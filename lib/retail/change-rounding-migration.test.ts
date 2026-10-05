/**
 * Migration witness for `retail_change_rounding` (SET-05, W-05).
 *
 * A sale keeps the ZiG notes it handed back as change, and every shop's retail
 * sale rule posts what rounding that change leaves to cash over short: a
 * credit when the shop kept it, a debit when the customer got it.
 *
 * And for `retail_void_change_rounding`: every shop with a retail sale or void
 * rule has cash over short (5420), and the void rule carries the same lines,
 * which a void runs inverted.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

describe("change, as stored", () => {
  it("keeps the ZiG part of a sale's change, nothing by default", async () => {
    const [facts] = await prisma.$queryRaw<Array<{ data_type: string; is_nullable: string; column_default: string | null }>>`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'RetailSale' AND column_name = 'changeZig'`;
    expect(facts).toEqual({ data_type: "numeric", is_nullable: "NO", column_default: "0" });
  });

  it("leaves no retail sale rule without its change rounding lines", async () => {
    const [row] = await prisma.$queryRaw<Array<{ missing: bigint }>>`
      SELECT COUNT(*) AS missing
      FROM "PostingRule" r
      JOIN "ChartOfAccount" a ON a."companyId" = r."companyId" AND a."code" = '5420' AND a."nodeType" = 'LEDGER'
      CROSS JOIN (VALUES ('CREDIT', 'changeRoundingKept'), ('DEBIT', 'changeRoundingGiven')) AS line(direction, path)
      WHERE r."sourceType" = 'RETAIL_SALE'
        AND r."name" = 'Retail sale - perpetual inventory'
        AND NOT EXISTS (
          SELECT 1 FROM "PostingRuleLine" l
          WHERE l."ruleId" = r."id" AND l."valuePath" = line.path AND l."direction"::text = line.direction
            AND l."accountId" = a."id" AND l."basis" = 'DEDUCTIONS'
        )`;
    expect(Number(row.missing)).toBe(0);
  });
});

describe("a void's change rounding (retail_void_change_rounding)", () => {
  it("leaves no shop with a retail sale or void rule without cash over short", async () => {
    const [row] = await prisma.$queryRaw<Array<{ missing: bigint }>>`
      SELECT COUNT(DISTINCT r."companyId") AS missing
      FROM "PostingRule" r
      WHERE r."sourceType" IN ('RETAIL_SALE', 'RETAIL_VOID')
        AND NOT EXISTS (SELECT 1 FROM "ChartOfAccount" a WHERE a."companyId" = r."companyId" AND a."code" = '5420')`;
    expect(Number(row.missing)).toBe(0);
  });

  it("leaves no retail void rule without its change rounding lines", async () => {
    const [row] = await prisma.$queryRaw<Array<{ missing: bigint }>>`
      SELECT COUNT(*) AS missing
      FROM "PostingRule" r
      JOIN "ChartOfAccount" a ON a."companyId" = r."companyId" AND a."code" = '5420' AND a."nodeType" = 'LEDGER'
      CROSS JOIN (VALUES ('CREDIT', 'changeRoundingKept'), ('DEBIT', 'changeRoundingGiven')) AS line(direction, path)
      WHERE r."sourceType" = 'RETAIL_VOID'
        AND r."name" = 'Retail void - perpetual inventory'
        AND NOT EXISTS (
          SELECT 1 FROM "PostingRuleLine" l
          WHERE l."ruleId" = r."id" AND l."valuePath" = line.path AND l."direction"::text = line.direction
            AND l."accountId" = a."id" AND l."basis" = 'DEDUCTIONS'
        )`;
    expect(Number(row.missing)).toBe(0);
  });
});
