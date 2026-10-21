/**
 * Migration witness for `teams_overrides`.
 *
 * Runs the migration's own SQL on a scratch schema holding the old shape of
 * `UserPermissionOverride` (keyed by user), inside a transaction that is rolled
 * back, and proves: what each person could do is the same before and after,
 * the old column and its keys are gone, an override recorded against a
 * workspace its user was not in is dropped, and an override goes with its
 * membership.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

class Rollback extends Error {
  constructor(readonly result: unknown) {
    super("rollback");
  }
}

function statements(): string[] {
  const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261021110000_teams_overrides/migration.sql"), "utf8");
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

type Effective = Array<{ userId: string; companyId: string; permissionKey: string; isAllowed: boolean }>;

async function onScratch<T>(work: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA m3_witness`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path = m3_witness, public`);
      await tx.$executeRawUnsafe(`CREATE TABLE m3_witness."User" (LIKE public."User" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`);
      await tx.$executeRawUnsafe(`CREATE TABLE m3_witness."WorkspaceMembership" (LIKE public."WorkspaceMembership" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`);
      // The table as it was before the migration.
      await tx.$executeRawUnsafe(`
        CREATE TABLE m3_witness."UserPermissionOverride" (
          "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "userId" TEXT NOT NULL, "permissionKey" TEXT NOT NULL,
          "isAllowed" BOOLEAN NOT NULL, "grantedById" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id"))`);
      await tx.$executeRawUnsafe(`CREATE UNIQUE INDEX "UserPermissionOverride_userId_permissionKey_key" ON m3_witness."UserPermissionOverride"("userId", "permissionKey")`);
      await tx.$executeRawUnsafe(`CREATE INDEX "UserPermissionOverride_userId_idx" ON m3_witness."UserPermissionOverride"("userId")`);
      await tx.$executeRawUnsafe(`ALTER TABLE m3_witness."UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES m3_witness."User"("id") ON DELETE CASCADE`);
      throw new Rollback(await work(tx));
    });
  } catch (error) {
    if (error instanceof Rollback) return error.result as T;
    throw error;
  }
  throw new Error("unreachable");
}

describe("permission overrides on the membership", () => {
  it("keeps what each person could do, drops the user key, and drops an override for a workspace its user was not in", async () => {
    const result = await onScratch(async (tx) => {
      const user = (id: string, companyId: string, role: string) =>
        tx.$executeRawUnsafe(`INSERT INTO m3_witness."User" ("id", "name", "role", "companyId", "updatedAt") VALUES ('${id}', '${id}', '${role}', '${companyId}', now())`);
      await user("u1", "A", "SALES_REP");
      await user("u2", "A", "MANAGER");
      await user("u3", "B", "CASHIER");
      // u2 has no membership yet: created between M2 and M3.
      for (const [id, companyId] of [["m1", "A"], ["m3", "B"]]) {
        await tx.$executeRawUnsafe(
          `INSERT INTO m3_witness."WorkspaceMembership" ("id", "companyId", "userId", "role", "updatedAt") VALUES ('${id}', '${companyId}', '${id === "m1" ? "u1" : "u3"}', 'CLERK', now())`,
        );
      }
      const override = (id: string, userId: string, companyId: string, key: string, allowed: boolean) =>
        tx.$executeRawUnsafe(
          `INSERT INTO m3_witness."UserPermissionOverride" ("id", "companyId", "userId", "permissionKey", "isAllowed", "updatedAt") VALUES ('${id}', '${companyId}', '${userId}', '${key}', ${allowed}, now())`,
        );
      await override("o1", "u1", "A", "records.export", false);
      await override("o2", "u2", "A", "records.merge", true);
      await override("o3", "u3", "B", "records.export", true);
      await override("o4", "u1", "B", "records.delete", true); // u1 is not in B

      const before = await tx.$queryRawUnsafe<Effective>(
        `SELECT "userId", "companyId", "permissionKey", "isAllowed" FROM m3_witness."UserPermissionOverride" ORDER BY 1, 2, 3`,
      );
      for (const statement of statements()) await tx.$executeRawUnsafe(statement);
      const after = await tx.$queryRawUnsafe<Effective>(
        `SELECT m."userId", o."companyId", o."permissionKey", o."isAllowed"
         FROM m3_witness."UserPermissionOverride" o JOIN m3_witness."WorkspaceMembership" m ON m."id" = o."membershipId" ORDER BY 1, 2, 3`,
      );
      const columns = await tx.$queryRawUnsafe<Array<{ column_name: string; is_nullable: string }>>(
        `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'm3_witness' AND table_name = 'UserPermissionOverride'`,
      );
      const indexes = await tx.$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'm3_witness' AND tablename = 'UserPermissionOverride'`,
      );
      const total = await tx.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM m3_witness."UserPermissionOverride"`);

      await tx.$executeRawUnsafe(`DELETE FROM m3_witness."WorkspaceMembership" WHERE "id" = 'm1'`);
      const afterDelete = await tx.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM m3_witness."UserPermissionOverride"`);
      return { before, after, columns, indexes: indexes.map((row) => row.indexname).sort(), total: total[0].n, afterDelete: afterDelete[0].n };
    });

    // The member in A that had a membership kept theirs; so did the one in B; the one made in between gained one.
    expect(result.after).toEqual(result.before.filter((row) => !(row.userId === "u1" && row.companyId === "B")));
    expect(result.total).toBe(3);
    const names = result.columns.map((column) => column.column_name);
    expect(names).not.toContain("userId");
    expect(result.columns.find((column) => column.column_name === "membershipId")?.is_nullable).toBe("NO");
    expect(result.indexes).toContain("UserPermissionOverride_membershipId_permissionKey_key");
    expect(result.indexes).toContain("UserPermissionOverride_membershipId_idx");
    expect(result.indexes).not.toContain("UserPermissionOverride_userId_permissionKey_key");
    expect(result.indexes).not.toContain("UserPermissionOverride_userId_idx");
    // Removing a membership takes its overrides with it.
    expect(result.afterDelete).toBe(2);
  });

  it("is as the application database has it: no user column, a key on the membership", async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'UserPermissionOverride' AND table_schema = 'public'`;
    expect(columns.map((column) => column.column_name)).toContain("membershipId");
    expect(columns.map((column) => column.column_name)).not.toContain("userId");
    const [{ rule }] = await prisma.$queryRaw<Array<{ rule: string }>>`
      SELECT delete_rule AS rule FROM information_schema.referential_constraints WHERE constraint_name = 'UserPermissionOverride_membershipId_fkey'`;
    expect(rule).toBe("CASCADE");
  });
});
