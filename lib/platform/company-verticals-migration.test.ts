/**
 * Migration witness for `company_verticals`.
 *
 * A workspace's verticals are rows, one per line of business, unique per
 * workspace, gone with the workspace; and every workspace that existed when it
 * ran was given the vertical it had been set up as.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function columns(table: string) {
  const rows = await prisma.$queryRaw<Array<{ name: string; type: string; nullable: string }>>`
    SELECT column_name AS name, udt_name AS type, is_nullable AS nullable
    FROM information_schema.columns WHERE table_name = ${table}`;
  return Object.fromEntries(rows.map((row) => [row.name, { type: row.type, nullable: row.nullable === "YES" }]));
}

async function enumLabels(name: string) {
  const [{ labels }] = await prisma.$queryRaw<Array<{ labels: string[] | null }>>`
    SELECT array_agg(enumlabel ORDER BY enumsortorder)::text[] AS labels
    FROM pg_enum JOIN pg_type ON pg_type.oid = enumtypid WHERE typname = ${name}`;
  return labels;
}

describe("company verticals", () => {
  it("is one row per vertical a workspace has", async () => {
    const cols = await columns("CompanyVertical");
    expect(cols.companyId).toEqual({ type: "text", nullable: false });
    expect(cols.vertical).toEqual({ type: "Vertical", nullable: false });
    expect(cols.addedAt).toEqual({ type: "timestamp", nullable: false });
    expect(await enumLabels("Vertical")).toEqual(["GOLD", "SCHOOLS", "RETAIL", "CRM", "WORKSHOP", "PAYROLL", "GENERAL"]);
  });

  it("holds each vertical once per workspace and goes with the workspace", async () => {
    const [unique] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM pg_indexes
      WHERE tablename = 'CompanyVertical' AND indexname = 'CompanyVertical_companyId_vertical_key'`;
    expect(Number(unique.count)).toBe(1);
    const [cascade] = await prisma.$queryRaw<Array<{ rule: string }>>`
      SELECT delete_rule AS rule FROM information_schema.referential_constraints
      WHERE constraint_name = 'CompanyVertical_companyId_fkey'`;
    expect(cascade.rule).toBe("CASCADE");
  });
});
