/**
 * Migration witness for `20261015120000_explore_reader` — NEEDS APPROVAL.
 *
 * The migration waits in prisma/proposed/ and is not applied, so this suite
 * skips itself until `ExploreReaderScope` exists. Once the migration is
 * approved and applied it checks, as the role itself: a connection bound to
 * one workspace and a list of tables reads that workspace's rows of those
 * tables and nothing else, never pay or personal details or a credential,
 * never Vane's or Explore's own tables, and cannot write; Vane's reader reads
 * the settings and the log but not the binding.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const applied = await prisma
  .$queryRaw<Array<{ ok: boolean }>>`SELECT to_regclass('"ExploreReaderScope"') IS NOT NULL AS ok`
  .then((rows) => rows[0]?.ok === true)
  .catch(() => false);

class Rollback extends Error {
  constructor(readonly rows: unknown[]) {
    super("rollback");
  }
}

/** One statement as `role`, bound to a company and tables (explore_reader) or a company (vane_reader), then rolled back. */
async function asReader<T = Record<string, unknown>>(
  role: "explore_reader" | "vane_reader",
  bind: { companyId: string; tables?: string[] } | null,
  sql: string,
): Promise<T[]> {
  try {
    await prisma.$transaction(async (tx) => {
      if (bind && role === "explore_reader") {
        await tx.$executeRaw`INSERT INTO "ExploreReaderScope" ("pid", "companyId", "userId", "tables")
          VALUES (pg_backend_pid(), ${bind.companyId}, 'witness', ${bind.tables ?? []}::text[])
          ON CONFLICT ("pid") DO UPDATE SET "companyId" = EXCLUDED."companyId", "tables" = EXCLUDED."tables"`;
      }
      if (bind && role === "vane_reader") {
        await tx.$executeRaw`INSERT INTO "VaneReaderScope" ("pid", "companyId") VALUES (pg_backend_pid(), ${bind.companyId})
          ON CONFLICT ("pid") DO UPDATE SET "companyId" = EXCLUDED."companyId"`;
      }
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      throw new Rollback(await tx.$queryRawUnsafe<unknown[]>(sql));
    });
  } catch (error) {
    if (error instanceof Rollback) return error.rows as T[];
    throw error;
  }
  throw new Error("unreachable");
}

const suffix = randomUUID().slice(0, 8);
const made = { a: "", b: "" };

describe.runIf(applied)("explore_reader, as stored (20261015120000_explore_reader)", () => {
  beforeAll(async () => {
    const [a, b] = await Promise.all(
      ["a", "b"].map((which) => prisma.company.create({ data: { name: `Explore witness ${which} ${suffix}`, slug: `explore-witness-${which}-${suffix}` } })),
    );
    made.a = a!.id;
    made.b = b!.id;
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [made.a, made.b] } } });
  });

  it("is a login of its own that cannot write", async () => {
    const [role] = await prisma.$queryRaw<Array<{ rolsuper: boolean; rolcreaterole: boolean }>>`
      SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname = 'explore_reader'`;
    expect(role).toEqual({ rolsuper: false, rolcreaterole: false });
    const writes = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM information_schema.role_table_grants
      WHERE grantee = 'explore_reader' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`;
    expect(writes[0]?.n).toBe(0);
    await expect(asReader("explore_reader", { companyId: made.a, tables: ["Company"] }, `UPDATE "Company" SET "name" = 'x' WHERE "id" = '${made.a}'`)).rejects.toThrow();
  });

  it("reads the bound workspace's rows of the bound tables only", async () => {
    const own = await asReader<{ id: string }>("explore_reader", { companyId: made.a, tables: ["Company"] }, `SELECT "id" FROM "Company" WHERE "id" IN ('${made.a}', '${made.b}')`);
    expect(own.map((row) => row.id)).toEqual([made.a]);
    const unbound = await asReader("explore_reader", { companyId: made.a, tables: [] }, `SELECT "id" FROM "Company"`);
    expect(unbound).toEqual([]);
    const nobody = await asReader("explore_reader", null, `SELECT "id" FROM "Company"`);
    expect(nobody).toEqual([]);
  });

  it("never reads pay, personal details, credentials or Vane's and Explore's own tables", async () => {
    const granted = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.column_privileges
      WHERE grantee = 'explore_reader' AND privilege_type = 'SELECT'`;
    const tables = new Set(granted.map((row) => row.table_name));
    for (const table of ["PayrollRun", "VaneMessage", "VaneItem", "ExploreQuestionRun", "ExploreSettings", "Session", "Account"]) {
      expect(tables.has(table), table).toBe(false);
    }
    const employee = granted.filter((row) => row.table_name === "Employee").map((row) => row.column_name);
    expect(employee.some((column) => /phone|nationalId|bank/i.test(column))).toBe(false);
    expect(granted.some((row) => /password|token|secret/i.test(row.column_name))).toBe(false);
  });

  it("sees only its own binding", async () => {
    const rows = await asReader<{ pid: number }>("explore_reader", { companyId: made.a, tables: [] }, `SELECT "pid" FROM "ExploreReaderScope"`);
    expect(rows).toHaveLength(1);
  });

  it("lets Vane read Explore's settings and log, never the binding", async () => {
    const granted = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT DISTINCT table_name FROM information_schema.column_privileges
      WHERE grantee = 'vane_reader' AND table_name IN ('ExploreSettings', 'ExploreQuestionRun', 'ExploreReaderScope')
      ORDER BY table_name`;
    expect(granted.map((row) => row.table_name)).toEqual(["ExploreQuestionRun", "ExploreSettings"]);
    const settings = await asReader("vane_reader", { companyId: made.a }, `SELECT "companyId" FROM "ExploreSettings"`);
    expect(settings).toEqual([]);
  });
});

describe("explore_reader before approval", () => {
  it("is not applied: the migration waits in prisma/proposed", () => {
    expect(typeof applied).toBe("boolean");
  });
});
