/**
 * Migration witness for `retail_payment_settings` (SET-05).
 *
 * The tenders are the ones a Harare shop takes: `MOBILE_MONEY` became
 * `ECOCASH`, and `INNBUCKS` and `ON_ACCOUNT` joined, in that order. No
 * payment, tender mapping, sale summary or Z-report says `MOBILE_MONEY` any
 * more. A shop's payment settings have their own row, and a currency rate
 * names who set it and where it came from.
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
  const [facts] = await prisma.$queryRaw<Array<{ data_type: string; is_nullable: string; column_default: string | null }>>`
    SELECT data_type, is_nullable, column_default
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

describe("the tenders, as stored", () => {
  it("lists the tenders in order, with no MOBILE_MONEY", async () => {
    expect(await enumLabels("RetailTenderType")).toEqual([
      "CASH",
      "CARD",
      "ECOCASH",
      "INNBUCKS",
      "TRANSFER",
      "ON_ACCOUNT",
      "VOUCHER",
    ]);
    expect(await enumLabels("RetailTenderType_old")).toEqual([]);
  });

  it("leaves no payment, mapping, sale summary or Z-report saying MOBILE_MONEY", async () => {
    const [row] = await prisma.$queryRaw<Array<{ payments: bigint; mappings: bigint; sales: bigint; reports: bigint }>>`
      SELECT
        (SELECT COUNT(*) FROM "RetailSalePayment" WHERE "tenderType"::text = 'MOBILE_MONEY') AS payments,
        (SELECT COUNT(*) FROM "TenderAccountMapping" WHERE "tenderType" = 'MOBILE_MONEY') AS mappings,
        (SELECT COUNT(*) FROM "RetailSale" WHERE "tenderSummary"::text LIKE '%"MOBILE_MONEY"%') AS sales,
        (SELECT COUNT(*) FROM "RetailZReport" WHERE "tenderBreakdown"::text LIKE '%"MOBILE_MONEY"%') AS reports`;
    expect({
      payments: Number(row.payments),
      mappings: Number(row.mappings),
      sales: Number(row.sales),
      reports: Number(row.reports),
    }).toEqual({ payments: 0, mappings: 0, sales: 0, reports: 0 });
  });
});

describe("payment settings and the rate's history, as stored", () => {
  it("keeps one settings row per company, with the board's defaults", async () => {
    expect(await enumLabels("RetailRateSource")).toEqual(["MANUAL", "RBZ_DAILY"]);
    expect(await column("RetailPaymentSettings", "takeCashUsd")).toMatchObject({ is_nullable: "NO", column_default: "true" });
    expect(await column("RetailPaymentSettings", "takeInnbucks")).toMatchObject({ is_nullable: "NO", column_default: "false" });
    expect(await column("RetailPaymentSettings", "zigChangeRounding")).toMatchObject({ data_type: "numeric", is_nullable: "NO" });
    expect(await column("RetailPaymentSettings", "ecocashMerchantCode")).toMatchObject({ is_nullable: "YES" });
    expect(await foreignKey("RetailPaymentSettings_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
    expect(await foreignKey("RetailPaymentSettings_updatedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });

  it("names who set a rate and where it came from", async () => {
    expect(await enumLabels("CurrencyRateSource")).toEqual(["MANUAL", "RBZ"]);
    expect(await column("CurrencyRate", "createdById")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(await column("CurrencyRate", "source")).toMatchObject({ is_nullable: "NO" });
    expect(await foreignKey("CurrencyRate_createdById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });
});
