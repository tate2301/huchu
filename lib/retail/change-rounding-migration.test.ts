/**
 * Migration witness for `retail_change_rounding` (SET-05, W-05).
 *
 * A sale keeps the ZiG notes it handed back as change, and every shop's retail
 * sale rule posts what rounding that change leaves to cash over short: a
 * credit when the shop kept it, a debit when the customer got it.
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
