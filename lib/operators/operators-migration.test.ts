/**
 * Migration witness for `operators`.
 *
 * An operator is their own identity, not a tenant `User`: a password, a sealed
 * authenticator secret, a lock that times out, and sessions held in the
 * database so that ending one takes effect on the next request.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function columns(table: string) {
  const rows = await prisma.$queryRaw<Array<{ name: string; type: string; nullable: string; default: string | null }>>`
    SELECT column_name AS name, udt_name AS type, is_nullable AS nullable, column_default AS default
    FROM information_schema.columns WHERE table_name = ${table}`;
  return Object.fromEntries(rows.map((row) => [row.name, { type: row.type, nullable: row.nullable === "YES", default: row.default }]));
}

async function indexes(table: string) {
  const rows = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = ${table}`;
  return Object.fromEntries(rows.map((row) => [row.indexname, row.indexdef]));
}

describe("operators", () => {
  it("are their own people, with a role from three", async () => {
    const [{ labels }] = await prisma.$queryRaw<Array<{ labels: string[] }>>`
      SELECT array_agg(enumlabel ORDER BY enumsortorder)::text[] AS labels
      FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = 'OperatorRole'`;
    expect(labels).toEqual(["OWNER", "SUPPORT", "BILLING"]);

    const cols = await columns("Operator");
    expect(cols.email).toMatchObject({ type: "text", nullable: false });
    expect(cols.role).toMatchObject({ type: "OperatorRole", nullable: false });
    expect(cols.passwordHash).toMatchObject({ type: "text", nullable: true });
    expect(cols.totpSecret).toMatchObject({ type: "text", nullable: true });
    expect(cols.totpConfirmedAt).toMatchObject({ type: "timestamp", nullable: true });
    expect(cols.totpLastStep).toMatchObject({ type: "int4", nullable: true });
    expect(cols.failedAttempts).toEqual({ type: "int4", nullable: false, default: "0" });
    expect(cols.lockedUntil).toMatchObject({ type: "timestamp", nullable: true });
    expect(cols.deactivatedAt).toMatchObject({ type: "timestamp", nullable: true });
    expect((await indexes("Operator")).Operator_email_key).toContain("UNIQUE");
  });

  it("hold sessions by the hash of their token, ended by a timestamp", async () => {
    const cols = await columns("OperatorSession");
    expect(cols.tokenHash).toMatchObject({ type: "text", nullable: false });
    expect(cols.verifiedAt).toMatchObject({ type: "timestamp", nullable: true });
    expect(cols.expiresAt).toMatchObject({ type: "timestamp", nullable: false });
    expect(cols.revokedAt).toMatchObject({ type: "timestamp", nullable: true });
    const idx = await indexes("OperatorSession");
    expect(idx.OperatorSession_tokenHash_key).toContain("UNIQUE");
    expect(idx.OperatorSession_operatorId_revokedAt_idx).toBeDefined();

    const [fk] = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
      SELECT delete_rule FROM information_schema.referential_constraints
      WHERE constraint_name = 'OperatorSession_operatorId_fkey'`;
    expect(fk.delete_rule).toBe("CASCADE");
  });
});
