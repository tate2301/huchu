/**
 * Migration witness for `retail_posting_settings` (SET-09).
 *
 * A retail posting rule line can ask for one of the company's role accounts
 * (`ROLE_MAPPING` + `accountRole`) instead of naming a code, and no retail
 * rule line still names 4000, 2200, 5000, 1200, 5410 or 2240 by hand. The
 * company's role accounts, its posting schedule and its posting runs have
 * their own tables.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function enumLabels(name: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name}
    ORDER BY e.enumsortorder`;
  return rows.map((row) => row.label);
}

async function column(table: string, name: string) {
  const [facts] = await prisma.$queryRaw<Array<{ udt_name: string; is_nullable: string; column_default: string | null }>>`
    SELECT udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${name}`;
  return facts;
}

async function foreignKey(name: string) {
  const [fk] = await prisma.$queryRaw<Array<{ foreign_table: string; delete_rule: string }>>`
    SELECT ccu.table_name AS foreign_table, rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${name}`;
  return fk;
}

describe("role accounts on posting rule lines", () => {
  it("adds ROLE_MAPPING as an account source and the six roles", async () => {
    expect(await enumLabels("PostingRuleLineAccountSource")).toEqual(["FIXED_ACCOUNT", "TENDER_MAPPING", "ROLE_MAPPING"]);
    expect(await enumLabels("PostingRuleLineAccountSource_old")).toEqual([]);
    expect(await enumLabels("RetailAccountRole")).toEqual([
      "SALES",
      "VAT_OUTPUT",
      "COST_OF_SALES",
      "STOCK",
      "BREAKAGE",
      "DEPOSITS_HELD",
    ]);
    expect(await column("PostingRuleLine", "accountRole")).toMatchObject({ udt_name: "RetailAccountRole", is_nullable: "YES" });
    expect(await column("PostingRuleLine", "accountSource")).toMatchObject({ is_nullable: "NO" });
    expect((await column("PostingRuleLine", "accountSource")).column_default).toContain("FIXED_ACCOUNT");
  });

  it("leaves no retail rule line naming a role's account by hand", async () => {
    const [row] = await prisma.$queryRaw<Array<{ fixed: bigint }>>`
      SELECT COUNT(*) AS fixed
      FROM "PostingRuleLine" l
      JOIN "PostingRule" r ON r."id" = l."ruleId"
      JOIN "ChartOfAccount" a ON a."id" = l."accountId"
      WHERE r."sourceType"::text LIKE 'RETAIL\\_%'
        AND a."code" IN ('4000', '2200', '5000', '1200', '5410', '2240')`;
    expect(Number(row.fixed)).toBe(0);
  });

  it("gives every role line a role and no account", async () => {
    const [row] = await prisma.$queryRaw<Array<{ broken: bigint }>>`
      SELECT COUNT(*) AS broken FROM "PostingRuleLine"
      WHERE "accountSource" = 'ROLE_MAPPING' AND ("accountRole" IS NULL OR "accountId" IS NOT NULL)`;
    expect(Number(row.broken)).toBe(0);
  });
});

describe("posting settings, role accounts and runs, as stored", () => {
  it("keys role accounts by company and role, and never loses an account in use", async () => {
    expect(await column("RetailAccountRoleMapping", "role")).toMatchObject({ udt_name: "RetailAccountRole", is_nullable: "NO" });
    expect(await foreignKey("RetailAccountRoleMapping_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
    expect(await foreignKey("RetailAccountRoleMapping_accountId_fkey")).toEqual({
      foreign_table: "ChartOfAccount",
      delete_rule: "RESTRICT",
    });
    const [pk] = await prisma.$queryRaw<Array<{ columns: string }>>`
      SELECT string_agg(a.attname, ',' ORDER BY array_position(i.indkey, a.attnum)) AS columns
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
      WHERE c.relname = 'RetailAccountRoleMapping' AND i.indisprimary`;
    expect(pk.columns).toBe("companyId,role");
  });

  it("posts at the end of each day unless changed", async () => {
    expect(await enumLabels("RetailPostingSchedule")).toEqual(["END_OF_DAY", "EVERY_SALE"]);
    expect((await column("RetailPostingSettings", "schedule")).column_default).toContain("END_OF_DAY");
    expect(await foreignKey("RetailPostingSettings_updatedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });

  it("keeps each run with its counts", async () => {
    expect(await enumLabels("RetailPostingTrigger")).toEqual(["SCHEDULE", "BY_HAND"]);
    for (const name of ["salesPosted", "refundsPosted", "deliveriesPosted", "countsPosted", "otherPosted", "failed"]) {
      expect(await column("RetailPostingRun", name)).toMatchObject({ is_nullable: "NO", column_default: "0" });
    }
    expect(await foreignKey("RetailPostingRun_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'RetailPostingRun'`;
    expect(indexes.map((index) => index.indexname)).toContain("RetailPostingRun_companyId_startedAt_idx");
  });
});
