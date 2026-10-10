/**
 * Migration witness for `retail_till_pin_issued` (ADM-03, 80-admin 3.3).
 *
 * Five wrong tries lock a till PIN until somebody sends a new one: the lock
 * is a moment (`lockedAt`), not an expiry. A PIN somebody issued must be
 * changed on first use, and says who issued it.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function columns(
  table: string,
): Promise<Record<string, { type: string; nullable: boolean; default: string | null }>> {
  const rows = await prisma.$queryRaw<Array<{ name: string; type: string; nullable: string; default: string | null }>>`
    SELECT column_name AS name, udt_name AS type, is_nullable AS nullable, column_default AS default
    FROM information_schema.columns WHERE table_name = ${table}`;
  return Object.fromEntries(
    rows.map((row) => [row.name, { type: row.type, nullable: row.nullable === "YES", default: row.default }]),
  );
}

async function foreignKey(name: string) {
  const [fk] = await prisma.$queryRaw<Array<{ foreign_table: string; delete_rule: string }>>`
    SELECT ccu.table_name AS foreign_table, rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${name}`;
  return fk;
}

describe("a till PIN's lock", () => {
  it("holds from the moment it locked, with no time-out", async () => {
    const cols = await columns("RetailTillPin");
    expect(cols.lockedAt).toEqual({ type: "timestamp", nullable: true, default: null });
    expect(cols.lockedUntil).toBeUndefined();
    expect(cols.failedAttempts).toEqual({ type: "int4", nullable: false, default: "0" });
  });

  it("knows a PIN somebody issued, and who issued it", async () => {
    const cols = await columns("RetailTillPin");
    expect(cols.mustChange).toEqual({ type: "bool", nullable: false, default: "false" });
    expect(cols.issuedAt).toMatchObject({ type: "timestamp", nullable: false });
    expect(cols.issuedById).toMatchObject({ type: "text", nullable: true });
    expect(cols.lastUnlockedAt).toMatchObject({ type: "timestamp", nullable: true });
    expect(await foreignKey("RetailTillPin_issuedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });
});
