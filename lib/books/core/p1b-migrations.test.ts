/**
 * Migration witnesses for P1b (approved 19 Oct):
 * - `20261019130000_books_receipt_customer_currency` (D2): a receipt names its
 *   customer and keeps its currency, rate and base amount; the backfill finds
 *   the customer in the sub-ledger, the invoice, then the audit trail.
 * - `20261019140000_books_gapless_numbering` (D8): drafts may carry no number,
 *   write-offs are numbered, and every series continues after its highest.
 * - `20261019150000_books_ledger_backfill` (fixes 3 and 6): voided documents'
 *   lines are VOIDED, and past receipts and payments through a money account
 *   get their bank transaction.
 * Each backfill is run again here on rows made for it, twice: the second run
 * changes nothing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { destroyBooksFixture, makeBooksFixture, type BooksFixture } from "../invoice-test-fixtures";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const D2 = "20261019130000_books_receipt_customer_currency";
const D8 = "20261019140000_books_gapless_numbering";
const LEDGER = "20261019150000_books_ledger_backfill";

/** The migration's data statements, as `migrate deploy` runs them (its schema changes are already applied). */
async function backfill(name: string) {
  const sql = readFileSync(path.resolve(__dirname, `../../../prisma/migrations/${name}/migration.sql`), "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((part) => part.replace(/^\s*--.*$/gm, "").trim())
    .filter((part) => /^(UPDATE|WITH|INSERT)\b/i.test(part));
  for (const statement of statements) await prisma.$executeRawUnsafe(statement);
}

let fixture: BooksFixture;
let n = 0;
const invoice = (data: Record<string, unknown> = {}) =>
  prisma.salesInvoice.create({
    data: { companyId: fixture.companyId, customerId: fixture.customerId, invoiceNumber: `W-${fixture.stamp}-${++n}`, invoiceDate: new Date(), status: "ISSUED", subTotal: 100, total: 100, ...data },
  });
const receipt = (data: Record<string, unknown>) =>
  prisma.salesReceipt.create({
    data: { companyId: fixture.companyId, receiptNumber: `WR-${fixture.stamp}-${++n}`, receivedAt: new Date("2026-10-10T00:00:00Z"), amount: 268, method: "Cash", ...data },
  });

beforeAll(async () => {
  fixture = await makeBooksFixture("P1b witness");
}, 120_000);

afterAll(async () => {
  if (fixture) {
    const { companyId } = fixture;
    await prisma.bankTransaction.deleteMany({ where: { companyId } });
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.salesWriteOff.deleteMany({ where: { companyId } });
    await prisma.purchasePayment.deleteMany({ where: { companyId } });
    await prisma.purchaseBill.deleteMany({ where: { companyId } });
    await prisma.vendor.deleteMany({ where: { companyId } });
    await prisma.currencyRate.deleteMany({ where: { companyId } });
    await prisma.bankAccount.deleteMany({ where: { companyId } });
    await prisma.idSequence.deleteMany({ where: { companyId } });
  }
  await destroyBooksFixture(fixture);
}, 60_000);

describe("P1b migrations", () => {
  it("are applied to the database", async () => {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations" WHERE migration_name IN (${D2}, ${D8}, ${LEDGER}) AND finished_at IS NOT NULL`;
    expect(rows.map((row) => row.migration_name).sort()).toEqual([D2, D8, LEDGER]);
  });

  it("D2: gives each receipt its customer, currency, rate and base amount", async () => {
    const { companyId, customerId } = fixture;
    const other = await prisma.customer.create({ data: { companyId, name: "Avondale Dental" } });
    const zig = await prisma.bankAccount.create({ data: { companyId, name: "CBZ ZiG", currency: "ZWG" } });
    await prisma.currencyRate.create({ data: { companyId, baseCurrency: "USD", quoteCurrency: "ZWG", rate: 26.8, effectiveDate: new Date("2026-10-01T00:00:00Z") } });

    const usdInvoice = await invoice();
    const onInvoice = await receipt({ invoiceId: usdInvoice.id });
    const fromLedger = await receipt({});
    await prisma.paymentLedgerEntry.create({
      data: { companyId, sourceType: "SALES_RECEIPT", sourceId: fromLedger.id, entryDate: new Date(), accountType: "RECEIVABLE", partyType: "CUSTOMER", partyId: other.id, credit: 268, amount: 268 },
    });
    const fromAudit = await receipt({ bankAccountId: zig.id });
    await prisma.platformAuditEvent.create({
      data: { companyId, eventType: "books.invoice.deleted", entityType: "SalesInvoice", entityId: "gone", payloadJson: JSON.stringify({ invoice: { customerId }, receiptsOnAccount: [{ id: fromAudit.id }] }), eventHash: `w-${fixture.stamp}` },
    });
    const nobody = await receipt({});
    await prisma.platformAuditEvent.create({
      data: { companyId, eventType: "books.invoice.voided", entityType: "SalesInvoice", entityId: "bad", payloadJson: "not json", eventHash: `w2-${fixture.stamp}` },
    });

    await backfill(D2);
    const read = (id: string) => prisma.salesReceipt.findUniqueOrThrow({ where: { id }, select: { customerId: true, currency: true, exchangeRate: true, baseAmount: true } });
    expect(await read(onInvoice.id)).toEqual({ customerId, currency: "USD", exchangeRate: 1, baseAmount: 268 });
    expect(await read(fromLedger.id)).toEqual({ customerId: other.id, currency: "USD", exchangeRate: 1, baseAmount: 268 });
    expect(await read(fromAudit.id)).toEqual({ customerId, currency: "ZWG", exchangeRate: 26.8, baseAmount: 10 });
    expect(await read(nobody.id)).toEqual({ customerId: null, currency: "USD", exchangeRate: 1, baseAmount: 268 });

    // A currency with no rate on the day keeps its rate empty, never invented.
    const noRate = await receipt({ currency: "ZAR" });
    await backfill(D2);
    expect(await read(noRate.id)).toEqual({ customerId: null, currency: "ZAR", exchangeRate: null, baseAmount: null });

    const before = await prisma.salesReceipt.findMany({ where: { companyId }, orderBy: { id: "asc" } });
    await backfill(D2);
    expect(await prisma.salesReceipt.findMany({ where: { companyId }, orderBy: { id: "asc" } })).toEqual(before);
  });

  it("D8: lets a draft carry no number, numbers write-offs, and continues each series after its highest", async () => {
    const { companyId } = fixture;
    const drafts = await Promise.all([invoice({ status: "DRAFT", invoiceNumber: null }), invoice({ status: "DRAFT", invoiceNumber: null })]);
    expect(drafts.map((draft) => draft.invoiceNumber)).toEqual([null, null]);

    const target = await invoice();
    const first = await prisma.salesWriteOff.create({ data: { companyId, invoiceId: target.id, amount: 5, createdAt: new Date("2026-10-01T08:00:00Z") } });
    const second = await prisma.salesWriteOff.create({ data: { companyId, invoiceId: target.id, amount: 6, createdAt: new Date("2026-10-02T08:00:00Z") } });
    await invoice({ invoiceNumber: "INV-0450" });
    await prisma.idSequence.create({ data: { companyId, entityKey: "SALES_INVOICE", scopeKey: "GLOBAL", lastNumber: 12 } });

    await backfill(D8);
    expect((await prisma.salesWriteOff.findUniqueOrThrow({ where: { id: first.id } })).writeOffNumber).toBe("WO-0001");
    expect((await prisma.salesWriteOff.findUniqueOrThrow({ where: { id: second.id } })).writeOffNumber).toBe("WO-0002");
    const sequence = () => prisma.idSequence.findUniqueOrThrow({ where: { companyId_entityKey_scopeKey: { companyId, entityKey: "SALES_INVOICE", scopeKey: "GLOBAL" } } });
    expect((await sequence()).lastNumber).toBe(450);

    const third = await prisma.salesWriteOff.create({ data: { companyId, invoiceId: target.id, amount: 7 } });
    await backfill(D8);
    await backfill(D8);
    expect((await prisma.salesWriteOff.findUniqueOrThrow({ where: { id: first.id } })).writeOffNumber).toBe("WO-0001");
    expect((await prisma.salesWriteOff.findUniqueOrThrow({ where: { id: third.id } })).writeOffNumber).toBe("WO-0003");
    expect((await sequence()).lastNumber).toBe(450);
  });

  it("voids the lines of voided documents and gives past receipts and payments their bank side", async () => {
    const { companyId, customerId } = fixture;
    const bank = await prisma.bankAccount.create({ data: { companyId, name: "Stanbic USD", currency: "USD" } });
    const voided = await invoice({ status: "VOIDED" });
    const kept = await invoice();
    const mirrored = await invoice();
    const line = (sourceId: string) =>
      prisma.paymentLedgerEntry.create({ data: { companyId, sourceType: "SALES_INVOICE", sourceId, entryDate: new Date(), accountType: "RECEIVABLE", partyType: "CUSTOMER", partyId: customerId, debit: 100, amount: 100 } });
    await Promise.all([line(voided.id), line(kept.id), line(mirrored.id)]);
    await prisma.journalEntry.create({ data: { companyId, entryNumber: 9001, entryDate: new Date(), description: "Void", status: "POSTED", sourceType: "SALES_INVOICE", sourceId: `void:${mirrored.id}`, createdById: fixture.ownerId } });

    const banked = await receipt({ bankAccountId: bank.id });
    const voidReceipt = await receipt({ bankAccountId: bank.id, voidedAt: new Date() });
    const vendor = await prisma.vendor.create({ data: { companyId, name: "Msasa Tiles" } });
    const payment = await prisma.purchasePayment.create({ data: { companyId, vendorId: vendor.id, paymentNumber: `WP-${fixture.stamp}`, paidAt: new Date(), amount: 90, method: "Transfer", bankAccountId: bank.id } });

    await backfill(LEDGER);
    const status = async (sourceId: string) => (await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId, sourceId } })).status;
    expect(await status(voided.id)).toBe("VOIDED");
    expect(await status(mirrored.id)).toBe("VOIDED");
    expect(await status(kept.id)).toBe("POSTED");
    expect(await prisma.bankTransaction.findFirstOrThrow({ where: { companyId, sourceType: "SALES_RECEIPT", sourceId: banked.id } })).toMatchObject({ bankAccountId: bank.id, amount: 268, direction: "CREDIT" });
    expect(await prisma.bankTransaction.count({ where: { companyId, sourceId: voidReceipt.id } })).toBe(0);
    expect(await prisma.bankTransaction.findFirstOrThrow({ where: { companyId, sourceType: "PURCHASE_PAYMENT", sourceId: payment.id } })).toMatchObject({ amount: 90, direction: "DEBIT" });

    const count = await prisma.bankTransaction.count({ where: { companyId } });
    await backfill(LEDGER);
    expect(await prisma.bankTransaction.count({ where: { companyId } })).toBe(count);
  });
});
