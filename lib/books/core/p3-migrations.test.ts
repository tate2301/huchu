/**
 * Migration witness for `20261019170000_books_fx_revaluation_enum` and
 * `20261019170100_books_bank_currency_tax` (books-final §7, P3): excluded
 * statement lines and closable reconciliations (D15), the frozen rate on
 * every money document (D3), the currency on a journal line (D4),
 * withholding on suppliers, customers and payments (D17), the tax settings,
 * the revaluation's source type, and what Vane's and Explore's readers may
 * read of them. The backfill leaves nothing in the base currency without
 * its rate of 1.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type ColumnFacts = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

const columns = async (table: string) => {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table}
    ORDER BY column_name`;
  return Object.fromEntries(rows.map((row) => [row.column_name, row]));
};

const labels = async (name: string) =>
  (await prisma.$queryRawUnsafe<Array<{ value: string }>>(`SELECT unnest(enum_range(NULL::"${name}"))::text AS value`)).map((row) => row.value);

const FROZEN = ["SalesQuotation", "SalesInvoice", "CreditNote", "PurchaseBill", "DebitNote", "PurchasePayment", "CrmRequisition", "CrmDailyCostEntry", "ExpenseClaim"];

describe("bank, currency and tax, as stored", () => {
  it("excludes a statement line with who and why, and closes a reconciliation against a statement (D15)", async () => {
    const line = await columns("BankStatementLine");
    for (const column of ["excludedAt", "excludedById", "excludeReason"]) expect(line[column]).toMatchObject({ is_nullable: "YES" });
    const rec = await columns("BankReconciliation");
    expect(rec.statementEndDate).toMatchObject({ is_nullable: "YES", data_type: "timestamp without time zone" });
    for (const column of ["statementBalance", "closedAt", "closedById"]) expect(rec[column]).toBeDefined();
  });

  it("freezes the rate, its source and the base total on every money document (D3)", async () => {
    for (const table of FROZEN) {
      const facts = await columns(table);
      expect(facts.exchangeRate, table).toMatchObject({ data_type: "double precision", is_nullable: "YES" });
      expect(facts.rateSource, table).toMatchObject({ data_type: "text", is_nullable: "YES" });
      expect(facts.baseTotal?.is_nullable, table).toBe("YES");
    }
    expect((await columns("ExpenseClaim")).baseTotal).toMatchObject({ data_type: "numeric" });
    expect((await columns("SalesInvoice")).baseTotal).toMatchObject({ data_type: "double precision" });
  });

  it("backfilled every document in the base currency with rate 1", async () => {
    for (const table of ["SalesInvoice", "PurchaseBill", "SalesQuotation"]) {
      const [row] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`
        SELECT count(*) AS n FROM "${table}" t
        WHERE t."exchangeRate" IS NULL AND t."createdAt" < '2026-10-19'
          AND upper(t."currency") = upper(COALESCE((SELECT s."baseCurrency" FROM "AccountingSettings" s WHERE s."companyId" = t."companyId"), 'USD'))`);
      expect(Number(row!.n), table).toBe(0);
    }
  });

  it("keeps a journal line's own currency beside its base amount (D4)", async () => {
    const facts = await columns("JournalLine");
    expect(facts.currency).toMatchObject({ is_nullable: "YES", data_type: "text" });
    expect(facts.amountInCurrency).toMatchObject({ is_nullable: "YES", data_type: "double precision" });
    expect(facts.exchangeRate).toMatchObject({ is_nullable: "YES", data_type: "double precision" });
  });

  it("holds tax clearance, withholding agents and what was withheld (D17)", async () => {
    const vendor = await columns("Vendor");
    expect(vendor.itf263Number).toMatchObject({ is_nullable: "YES" });
    expect(vendor.itf263ExpiresAt).toMatchObject({ is_nullable: "YES" });
    expect(vendor.isVatWithholdingAgent).toMatchObject({ is_nullable: "NO", column_default: "false" });
    expect((await columns("Customer")).isVatWithholdingAgent).toMatchObject({ is_nullable: "NO", column_default: "false" });
    const payment = await columns("PurchasePayment");
    expect(payment.withholdingAmount).toMatchObject({ is_nullable: "NO", column_default: "0" });
    expect(payment.withholdingType).toMatchObject({ is_nullable: "YES" });
    expect(payment.certificateNo).toMatchObject({ is_nullable: "YES" });
    expect((await columns("AccountingSettings")).taxSettings).toMatchObject({ is_nullable: "YES", data_type: "jsonb" });
  });

  it("posts the month-end revaluation under its own source type", async () => {
    expect(await labels("AccountingSourceType")).toContain("FX_REVALUATION");
  });

  it("lets Vane's and Explore's readers read the new columns", async () => {
    for (const reader of ["vane_reader", "explore_reader"]) {
      const rows = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT table_name || '.' || column_name AS name FROM information_schema.column_privileges
        WHERE grantee = ${reader} AND privilege_type = 'SELECT'
          AND ((table_name = 'SalesInvoice' AND column_name IN ('exchangeRate', 'baseTotal'))
            OR (table_name = 'JournalLine' AND column_name = 'amountInCurrency')
            OR (table_name = 'BankStatementLine' AND column_name = 'excludeReason')
            OR (table_name = 'BankReconciliation' AND column_name = 'statementEndDate')
            OR (table_name = 'Vendor' AND column_name = 'itf263Number')
            OR (table_name = 'PurchasePayment' AND column_name = 'withholdingAmount'))
        ORDER BY 1`;
      expect(rows.map((row) => row.name), reader).toEqual([
        "BankReconciliation.statementEndDate",
        "BankStatementLine.excludeReason",
        "JournalLine.amountInCurrency",
        "PurchasePayment.withholdingAmount",
        "SalesInvoice.baseTotal",
        "SalesInvoice.exchangeRate",
        "Vendor.itf263Number",
      ]);
    }
  });
});
