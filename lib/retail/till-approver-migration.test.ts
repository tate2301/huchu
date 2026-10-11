/**
 * Migration witness for `20261006130000_retail_till_open_price_approver_empties`
 * and `20261007090000_retail_sale_floor`, which both brought a sale's approver.
 *
 * Databases ran the two in either order (the till branch's first, or PR #193's),
 * so the till migration adds `RetailSale.approvedById`, `approvedByName` and
 * their key only where they are missing. Its statements must run again on a
 * database that already has them, and the result must be one nullable column
 * pair with one SET NULL key to User.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const TILL_MIGRATION = path.join(
  process.cwd(),
  "prisma/migrations/20261006130000_retail_till_open_price_approver_empties/migration.sql",
);
const SALE_FLOOR_MIGRATION = path.join(process.cwd(), "prisma/migrations/20261007090000_retail_sale_floor/migration.sql");

/** The till migration's statements on RetailSale's approver: the column pair and the guarded key. */
function approverStatements(sql: string): string[] {
  const alter = sql.match(/ALTER TABLE "RetailSale" ADD COLUMN IF NOT EXISTS "approvedById"[\s\S]*?;/);
  const key = sql.match(/DO \$\$[\s\S]*?RetailSale_approvedById_fkey[\s\S]*?END \$\$;/);
  return [alter?.[0], key?.[0]].filter((statement): statement is string => Boolean(statement));
}

async function column(name: string) {
  const [row] = await prisma.$queryRaw<Array<{ type: string; nullable: string }>>`
    SELECT udt_name AS type, is_nullable AS nullable
    FROM information_schema.columns WHERE table_name = 'RetailSale' AND column_name = ${name}`;
  return row ? { type: row.type, nullable: row.nullable === "YES" } : null;
}

describe("a sale's approver, whichever migration ran first", () => {
  it("the till migration adds the columns and key only where they are missing", () => {
    const sql = readFileSync(TILL_MIGRATION, "utf8");
    expect(approverStatements(sql)).toHaveLength(2);
    expect(sql).not.toMatch(/ADD COLUMN\s+"approvedById"/);
    expect(sql).not.toMatch(/^ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_approvedById_fkey"/m);
  });

  it("the sale-floor migration leaves the approver to the till migration", () => {
    const sql = readFileSync(SALE_FLOOR_MIGRATION, "utf8");
    expect(sql).not.toMatch(/ADD COLUMN\s+"approvedBy(Id|Name)"/);
    expect(sql).not.toMatch(/RetailSale_approvedById_fkey/);
  });

  it("runs again on a database that already has the approver", async () => {
    const statements = approverStatements(readFileSync(TILL_MIGRATION, "utf8"));
    await expect(
      prisma.$transaction(async (tx) => {
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
  });

  it("leaves one nullable pair and one SET NULL key to User", async () => {
    expect(await column("approvedById")).toEqual({ type: "text", nullable: true });
    expect(await column("approvedByName")).toEqual({ type: "text", nullable: true });
    const keys = await prisma.$queryRaw<Array<{ rule: string; target: string }>>`
      SELECT rc.delete_rule AS rule, ccu.table_name AS target
      FROM information_schema.referential_constraints rc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE rc.constraint_name = 'RetailSale_approvedById_fkey'`;
    expect(keys).toEqual([{ rule: "SET NULL", target: "User" }]);
  });
});
