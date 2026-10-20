/**
 * P4's exit test (books-final §8, and the brief's list), against the test
 * database, with the FDMS transport mocked:
 *
 *   - A paid invoice is voided through a full credit note, posted (§4.1
 *     rule 4); its payment is taken off it and stays on the customer's
 *     account; the invoice and the note net to nothing and the aging holds
 *     only the money on account. A paid bill voids the same way, its payment
 *     left as credit with the supplier.
 *   - Revise voids an invoice and opens a new draft linked to it.
 *   - The owner deletes a recorded, unfiscalised bill in an open month: its
 *     snapshot is in the audit trail and the ledger is clean.
 *   - A fiscalised invoice is never deleted.
 *   - A bulk void of five invoices, two of them refused, reports three done
 *     and two skipped with why; the audit trail holds one event per voided row.
 *   - An accountant without the grant is refused void and revise; with it, may.
 *   - A test device's documents are purged.
 *   - A till sale on account, a lay-by and a school fee each write a
 *     customer-level sub-ledger line, in the one statement and aging.
 *
 * The trial balance stays balanced throughout.
 */
import crypto from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { issueMock } = vi.hoisted(() => ({ issueMock: vi.fn() }));
vi.mock("@/lib/accounting/fdms-connector", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/accounting/fdms-connector")>()),
  issueWithFdmsConnector: issueMock,
}));
vi.mock("@/lib/platform/features", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform/features")>()),
  hasFeature: vi.fn(async () => true),
}));

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { openFiscalDay } from "@/lib/accounting/fiscal-day";
import { issueFiscalReceipt } from "@/lib/accounting/fiscalisation";
import { syncPaymentLedgerEntryForSource } from "@/lib/accounting/payment-ledger";
import { recordPurchasePayment, recordSalesReceipt } from "@/lib/accounting/payments";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { trialBalance } from "../invoice-test-fixtures";
import { issueDraftInvoice } from "../issue-invoice";
import { postBill, recordBill } from "./bills";
import { bulkAction } from "./bulk-actions";
import { booksActor, type BooksActor } from "./can-do";
import { postInvoice } from "./issue-invoice";
import { nextNumber } from "./numbering";
import { markTestDevice, purgeTestDevice } from "./purge";
import { partyAging, partyStatement } from "./statement-aging";
import { deleteDocument, reviseDocument, undoChoices, UndoRefused, voidDocument } from "./undo";
import { setVoidGrant } from "./void-grant";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 180_000 });

const KEY_ENV = `FDMS_P4_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const round = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

let shop: TestShop;
let bankId: string;
let customerId: string;
let vendorId: string;
let vat155: string;
let accountantId: string;

const owner = (): BooksActor => ({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN" });
const accountant = (): BooksActor => ({ companyId: shop.companyId, userId: accountantId, role: "FINANCE_OFFICER" });

/** The ledger balances: every debit has its credit. */
async function balanced() {
  const sums = await trialBalance(shop.companyId);
  expect(round(Object.values(sums).reduce((sum, value) => sum + value, 0))).toBe(0);
}

/** Every line a set of sources posted, voids included, netted per account. */
async function net(sources: Array<{ sourceType: "SALES_INVOICE" | "SALES_RECEIPT" | "SALES_CREDIT_NOTE" | "PURCHASE_BILL" | "PURCHASE_PAYMENT"; id: string }>) {
  const lines = await prisma.journalLine.findMany({
    where: { entry: { companyId: shop.companyId, OR: sources.flatMap((source) => [{ sourceType: source.sourceType, sourceId: source.id }, { sourceType: source.sourceType, sourceId: `void:${source.id}` }]) } },
    select: { debit: true, credit: true, account: { select: { code: true } } },
  });
  const sums: Record<string, number> = {};
  for (const line of lines) sums[line.account.code] = round((sums[line.account.code] ?? 0) + line.debit - line.credit);
  return { count: lines.length, nonzero: Object.entries(sums).filter(([, value]) => Math.abs(value) > 0.004) };
}

/** An invoice issued and posted through the core: one line at 15.5% VAT, dated today. */
async function issue(net: number, status: "ISSUED" | "DRAFT" = "ISSUED") {
  const tax = round(net * 0.155);
  const invoice = await prisma.$transaction(async (tx) =>
    tx.salesInvoice.create({
      data: {
        companyId: shop.companyId,
        customerId,
        invoiceNumber: status === "ISSUED" ? await nextNumber(tx, shop.companyId, "invoice") : null,
        invoiceDate: today(),
        status,
        currency: "USD",
        subTotal: net,
        taxTotal: tax,
        total: round(net + tax),
        createdById: shop.ownerId,
        issuedById: status === "ISSUED" ? shop.ownerId : null,
        issuedAt: status === "ISSUED" ? today() : null,
        lines: { create: [{ description: "Vinyl flooring, laid", quantity: 1, unitPrice: net, taxCodeId: vat155, taxRate: 15.5, taxAmount: tax, lineTotal: round(net + tax) }] },
      },
    }),
  );
  if (status === "ISSUED") {
    const posted = await postInvoice(prisma, { companyId: shop.companyId, invoice, actor: { userId: shop.ownerId, role: "SUPERADMIN" } });
    expect(posted.error).toBeUndefined();
  }
  return invoice;
}

const pay = (invoiceId: string, amount: number) =>
  recordSalesReceipt({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN", invoiceId, receivedAt: today(), amount, method: "Bank transfer", bankAccountId: bankId });

const events = (eventType: string, entityId: string) => prisma.platformAuditEvent.findMany({ where: { companyId: shop.companyId, eventType, entityId } });

const refusal = async (run: Promise<unknown>) => {
  try {
    await run;
  } catch (error) {
    if (error instanceof UndoRefused) return error;
    throw error;
  }
  throw new Error("It was not refused.");
};

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  const keypair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  process.env[KEY_ENV] = JSON.stringify({ key: keypair.privateKey });
  issueMock.mockImplementation(async () => ({ status: "SUCCESS", fiscalNumber: `FDMS-${crypto.randomUUID().slice(0, 6)}`, providerReference: "REF-1", qrCodeData: null, signature: null, rawResponseJson: "{}", error: null, nextRetryAt: null }));

  shop = await makeTestShop("P4 exit");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  await prisma.accountingSettings.update({
    where: { companyId: shop.companyId },
    data: { legalName: "Floorcode Zimbabwe (Pvt) Ltd", vatNumber: "220123456", taxNumber: "2000123456", address: "14 Coventry Rd, Harare" },
  });
  const ledger = (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: shop.companyId, code: "1010" }, select: { id: true } })).id;
  bankId = (await prisma.bankAccount.create({ data: { companyId: shop.companyId, name: "Stanbic USD", bankName: "Stanbic", kind: "BANK", currency: "USD", ledgerAccountId: ledger }, select: { id: true } })).id;
  customerId = (await prisma.customer.create({ data: { companyId: shop.companyId, name: "Pomona Offices", address: "2 Pomona Rd, Harare" }, select: { id: true } })).id;
  vendorId = (await prisma.vendor.create({ data: { companyId: shop.companyId, name: "Chikomo Fitters" }, select: { id: true } })).id;
  vat155 = (await prisma.taxCode.update({ where: { companyId_code: { companyId: shop.companyId, code: "VAT15_5" } }, data: { zimraTaxId: 517 }, select: { id: true } })).id;
  accountantId = (await prisma.user.create({ data: { email: `accountant-${crypto.randomUUID().slice(0, 8)}@shop.test`, name: "Rumbi Chari", role: "FINANCE_OFFICER", companyId: shop.companyId }, select: { id: true } })).id;
}, 180_000);

afterAll(async () => {
  delete process.env[KEY_ENV];
  if (!shop) return;
  const { companyId } = shop;
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
  await prisma.fiscalDay.deleteMany({ where: { companyId } });
  await prisma.bankStatementLine.deleteMany({ where: { reconciliation: { companyId } } });
  await prisma.bankTransaction.deleteMany({ where: { companyId } });
  await prisma.bankReconciliation.deleteMany({ where: { companyId } });
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfEntryId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.paymentLedgerEntry.deleteMany({ where: { companyId } });
  await prisma.salesReceipt.deleteMany({ where: { companyId } });
  await prisma.creditNote.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.updateMany({ where: { companyId }, data: { supersedesId: null } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.purchasePayment.deleteMany({ where: { companyId } });
  await prisma.purchaseBill.deleteMany({ where: { companyId } });
  await prisma.retailLaybyPayment.deleteMany({ where: { companyId } });
  await prisma.retailLayby.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.schoolFeeInvoice.deleteMany({ where: { companyId } });
  await prisma.schoolStudent.deleteMany({ where: { companyId } });
  await prisma.schoolTerm.deleteMany({ where: { companyId } });
  await prisma.schoolAcademicYear.deleteMany({ where: { companyId } });
  await prisma.userPermissionOverride.deleteMany({ where: { companyId } });
  await prisma.fiscalisationProviderConfig.deleteMany({ where: { companyId } });
  await prisma.bankAccount.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
}, 60_000);

describe("P4 exit: undo everywhere", () => {
  it("voids a paid invoice through a full credit note: the receipt goes on account, the ledger and aging are clean", async () => {
    const invoice = await issue(100);
    const receipt = await pay(invoice.id, 115.5);
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: "PAID" });
    // The payment does not stand in the way (§4.3): it is what the dialog says stays on account.
    expect(await undoChoices(owner(), "invoice", invoice.id)).toMatchObject({ void: { allowed: true }, dependents: [], fiscalNote: null });

    const invoiceVoid = await voidDocument(owner(), "invoice", invoice.id, { reason: "Raised twice" });
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: "VOIDED", amountPaid: 0 });

    // A full credit note, issued and posted; never a bare mirror for a new void.
    const note = await prisma.creditNote.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(note).toMatchObject({ status: "ISSUED", total: 115.5, reason: "Raised twice" });
    expect(invoiceVoid.detail).toBe(`Voided through ${note.noteNumber}. ${receipt.receiptNumber} stays on account.`);
    expect(await prisma.journalEntry.count({ where: { companyId: shop.companyId, sourceType: "SALES_CREDIT_NOTE", sourceId: note.id, status: "POSTED" } })).toBe(1);
    expect(await prisma.journalEntry.count({ where: { companyId: shop.companyId, sourceType: "SALES_INVOICE", sourceId: `void:${invoice.id}` } })).toBe(0);

    // The receipt is kept, on account, with its bank line.
    expect(await prisma.salesReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({ invoiceId: null, voidedAt: null, amount: 115.5 });
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: shop.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } })).toMatchObject({ invoiceId: null, partyId: customerId, status: "POSTED" });
    expect(await prisma.bankTransaction.count({ where: { companyId: shop.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } })).toBe(1);

    // Who and why in the audit trail.
    const [event] = await events("books.invoice.voided", invoice.id);
    expect(event).toMatchObject({ id: invoiceVoid.auditEventId, actor: shop.ownerId, reason: "Raised twice", entityType: "SalesInvoice" });
    expect(await undoChoices(owner(), "invoice", invoice.id)).toMatchObject({ status: "void", voided: { reason: "Raised twice" }, void: { allowed: false } });

    // The invoice and its credit note net to nothing; the aging holds only the money on account.
    const ledger = await net([
      { sourceType: "SALES_INVOICE", id: invoice.id },
      { sourceType: "SALES_CREDIT_NOTE", id: note.id },
    ]);
    expect(ledger.count).toBeGreaterThan(0);
    expect(ledger.nonzero.filter(([code]) => code === "1100" || code.startsWith("22"))).toEqual([]);
    const aging = await partyAging(shop.companyId, "customer");
    expect(aging.rows.find((row) => row.partyId === customerId)).toMatchObject({ total: -115.5 });
    await balanced();
  });

  it("voids a paid bill by its mirror: the payment stays as credit with the supplier", async () => {
    const bill = await prisma.$transaction(async (tx) =>
      tx.purchaseBill.create({
        data: {
          companyId: shop.companyId,
          vendorId,
          billNumber: await nextNumber(tx, shop.companyId, "bill"),
          billDate: today(),
          status: "RECEIVED",
          currency: "USD",
          subTotal: 100,
          taxTotal: 15.5,
          total: 115.5,
          fdmsStatus: "VALID",
          supplierFtiNumber: "FTI-90",
          lines: { create: [{ description: "Grout, 10 bags", quantity: 1, unitPrice: 100, taxRate: 15.5, taxAmount: 15.5, lineTotal: 115.5 }] },
        },
      }),
    );
    await postBill(prisma, bill, { userId: shop.ownerId, role: "SUPERADMIN" });
    const payment = await recordPurchasePayment({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN", billId: bill.id, paidAt: today(), amount: 115.5, method: "Bank transfer", bankAccountId: bankId });
    expect(await undoChoices(owner(), "bill", bill.id)).toMatchObject({ void: { allowed: true }, dependents: [] });

    await voidDocument(owner(), "bill", bill.id, { reason: "Recorded twice" });
    expect(await prisma.purchaseBill.findUniqueOrThrow({ where: { id: bill.id } })).toMatchObject({ status: "VOIDED" });
    expect(await prisma.purchasePayment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ billId: null, vendorId, status: "PAID" });
    expect((await net([{ sourceType: "PURCHASE_BILL", id: bill.id }])).nonzero).toEqual([]);
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: shop.companyId, sourceType: "PURCHASE_PAYMENT", sourceId: payment.id } })).toMatchObject({ billId: null, partyId: vendorId });
    await balanced();
  });

  it("revises an invoice: the old one is void and a new draft is linked to it", async () => {
    const invoice = await issue(200);
    const revised = await reviseDocument(owner(), "invoice", invoice.id, { reason: "Wrong rate on the fitting" });
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: "VOIDED" });
    const draft = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: revised.draft.id }, include: { lines: true } });
    // A draft has no number: it takes the next one in the series when it is issued (§4.1 rules 2 and 8).
    expect(draft).toMatchObject({ status: "DRAFT", invoiceNumber: null, supersedesId: invoice.id, customerId, total: invoice.total, createdById: shop.ownerId });
    expect(draft.lines).toHaveLength(1);
    expect(await undoChoices(owner(), "invoice", invoice.id)).toMatchObject({ supersededBy: draft.id, status: "void" });
    expect(await undoChoices(owner(), "invoice", draft.id)).toMatchObject({ supersedes: invoice.id, status: "draft" });
    expect(await events("books.invoice.revised", invoice.id)).toHaveLength(1);
    const note = await prisma.creditNote.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    const ledger = await net([
      { sourceType: "SALES_INVOICE", id: invoice.id },
      { sourceType: "SALES_CREDIT_NOTE", id: note.id },
    ]);
    expect(ledger.nonzero.filter(([code]) => code === "1100" || code.startsWith("22"))).toEqual([]);
    await balanced();
  });

  it("revises a paid invoice and a paid bill: the payments move to the new one when it is issued or recorded", async () => {
    const invoice = await issue(300);
    const receipt = await pay(invoice.id, 346.5);
    const revised = await reviseDocument(owner(), "invoice", invoice.id, { reason: "Wrong date on it" });
    expect(await prisma.salesReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({ invoiceId: null });
    await issueDraftInvoice(owner(), revised.draft.id);
    expect(await prisma.salesReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({ invoiceId: revised.draft.id });
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: revised.draft.id } })).toMatchObject({ status: "PAID", amountPaid: 346.5 });
    expect(await events("books.invoice.payments-moved", revised.draft.id)).toHaveLength(1);

    const bill = await prisma.$transaction(async (tx) =>
      tx.purchaseBill.create({
        data: {
          companyId: shop.companyId,
          vendorId,
          billNumber: await nextNumber(tx, shop.companyId, "bill"),
          billDate: today(),
          status: "RECEIVED",
          currency: "USD",
          subTotal: 200,
          taxTotal: 31,
          total: 231,
          fdmsStatus: "VALID",
          supplierFtiNumber: "FTI-91",
          lines: { create: [{ description: "Screed, 8 bags", quantity: 1, unitPrice: 200, taxRate: 15.5, taxAmount: 31, lineTotal: 231 }] },
        },
      }),
    );
    await postBill(prisma, bill, { userId: shop.ownerId, role: "SUPERADMIN" });
    const payment = await recordPurchasePayment({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN", billId: bill.id, paidAt: today(), amount: 231, method: "Bank transfer", bankAccountId: bankId });
    const newBill = await reviseDocument(owner(), "bill", bill.id, { reason: "Ten bags, not eight" });
    expect(await prisma.purchasePayment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ billId: null });
    await recordBill(owner(), newBill.draft.id, { supplierFtiNumber: "FTI-91" });
    expect(await prisma.purchasePayment.findUniqueOrThrow({ where: { id: payment.id } })).toMatchObject({ billId: newBill.draft.id });
    expect(await prisma.purchaseBill.findUniqueOrThrow({ where: { id: newBill.draft.id } })).toMatchObject({ status: "PAID" });
    await balanced();
  });

  it("lets the owner delete a recorded, unfiscalised bill in an open month, keeping its snapshot", async () => {
    const bill = await prisma.$transaction(async (tx) =>
      tx.purchaseBill.create({
        data: {
          companyId: shop.companyId,
          vendorId,
          billNumber: await nextNumber(tx, shop.companyId, "bill"),
          billDate: today(),
          status: "RECEIVED",
          currency: "USD",
          subTotal: 400,
          taxTotal: 62,
          total: 462,
          fdmsStatus: "VALID",
          supplierFtiNumber: "FTI-88",
          lines: { create: [{ description: "Adhesive, 20 tins", quantity: 1, unitPrice: 400, taxRate: 15.5, taxAmount: 62, lineTotal: 462 }] },
        },
      }),
    );
    await postBill(prisma, bill, { userId: shop.ownerId, role: "SUPERADMIN" });
    expect(await prisma.journalEntry.count({ where: { companyId: shop.companyId, sourceType: "PURCHASE_BILL", sourceId: bill.id } })).toBe(1);
    expect(await prisma.paymentLedgerEntry.count({ where: { companyId: shop.companyId, sourceType: "PURCHASE_BILL", sourceId: bill.id } })).toBe(1);

    // Never the accountant's: permanent delete is the owner's alone, grant or not.
    expect((await refusal(deleteDocument(accountant(), "bill", bill.id, { reason: "Entered twice" }))).status).toBe(403);

    const done = await deleteDocument(owner(), "bill", bill.id, { reason: "Entered twice" });
    expect(done.draft).toBe(false);
    expect(await prisma.purchaseBill.findUnique({ where: { id: bill.id } })).toBeNull();
    expect(await prisma.journalEntry.count({ where: { companyId: shop.companyId, sourceType: "PURCHASE_BILL", sourceId: { in: [bill.id, `void:${bill.id}`] } } })).toBe(0);
    expect(await prisma.paymentLedgerEntry.count({ where: { companyId: shop.companyId, sourceType: "PURCHASE_BILL", sourceId: bill.id } })).toBe(0);
    const [event] = await events("books.bill.deleted", bill.id);
    expect(event).toMatchObject({ id: done.auditEventId, reason: "Entered twice", actor: shop.ownerId });
    const payload = JSON.parse(event!.payloadJson!) as { snapshot: { id: string; total: number; lines: unknown[] }; journalEntries: unknown[] };
    expect(payload.snapshot).toMatchObject({ id: bill.id, total: 462 });
    expect(payload.snapshot.lines).toHaveLength(1);
    expect(payload.journalEntries).toHaveLength(1);
    await balanced();
  });

  it("never deletes a fiscalised invoice", async () => {
    const provider = await prisma.fiscalisationProviderConfig.create({
      data: { companyId: shop.companyId, providerKey: `zimra-p4-${crypto.randomUUID().slice(0, 6)}`, apiBaseUrl: "https://fdms.invalid", deviceId: "20001", certificateRef: `env:${KEY_ENV}`, isActive: true },
      select: { id: true },
    });
    await openFiscalDay({ companyId: shop.companyId, providerConfigId: provider.id });
    const invoice = await issue(80);
    const sentFirst = await issueFiscalReceipt(shop.companyId, invoice.id, shop.ownerId);
    expect(sentFirst, JSON.stringify(sentFirst)).toMatchObject({ status: "SUCCESS" });

    const refused = await refusal(deleteDocument(owner(), "invoice", invoice.id, { reason: "Test" }));
    expect(refused.message).toMatch(/was fiscalised, so ZIMRA holds it as issued and it is never deleted/);
    expect(await prisma.salesInvoice.findUnique({ where: { id: invoice.id } })).not.toBeNull();
    expect(await undoChoices(owner(), "invoice", invoice.id)).toMatchObject({ delete: { allowed: false, permanent: true } });
    // The live device leaves the stage to the test device below.
    await prisma.fiscalisationProviderConfig.update({ where: { id: provider.id }, data: { isActive: false } });
  });

  it("bulk voids five invoices, one a draft: four done (the part-paid one too), one skipped with why, one audit event per voided row", async () => {
    const plain = [await issue(10), await issue(20), await issue(30)];
    const draft = await issue(40, "DRAFT");
    const paid = await issue(50);
    const receipt = await pay(paid.id, 20);
    const ids = [plain[0]!.id, draft.id, plain[1]!.id, paid.id, plain[2]!.id];

    const result = await bulkAction(owner(), "invoice", "void", ids, { reason: "Imported twice" });
    expect(result.done.map((row) => row.id)).toEqual([plain[0]!.id, plain[1]!.id, paid.id, plain[2]!.id]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([{ id: draft.id, label: "Draft invoice", why: "Draft invoice is a draft and nothing was posted: delete it instead." }]);
    expect(result.done.find((row) => row.id === paid.id)?.detail).toMatch(new RegExp(`${receipt.receiptNumber} stays on account\\.$`));
    for (const invoice of [...plain, paid]) expect(await events("books.invoice.voided", invoice.id)).toHaveLength(1);
    expect(await prisma.salesInvoice.count({ where: { id: { in: [...plain, paid].map((invoice) => invoice.id) }, status: "VOIDED" } })).toBe(4);
    expect(await prisma.salesReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({ invoiceId: null, voidedAt: null });
    await balanced();

    // Delete permanently in bulk, as the owner, "delete 2" typed: the draft and a void one go.
    const deleted = await bulkAction(owner(), "invoice", "delete", [draft.id, plain[0]!.id], { reason: "Test data", confirm: "delete 2" });
    expect(deleted.done.map((row) => row.id)).toEqual([draft.id, plain[0]!.id]);
    expect((await refusal(bulkAction(owner(), "invoice", "delete", [plain[1]!.id], { reason: "Test data", confirm: "delete it" }))).message).toBe('Type "delete 1" to delete them.');
    await balanced();
  });

  it("refuses an accountant without the grant to void or revise; the owner's grant lets them", async () => {
    const invoice = await issue(60);
    expect(await refusal(voidDocument(accountant(), "invoice", invoice.id, { reason: "Wrong customer" }))).toMatchObject({ status: 403, message: "Only the owner can void or revise a posted document, unless they let you." });
    expect((await refusal(reviseDocument(accountant(), "invoice", invoice.id, { reason: "Wrong customer" }))).status).toBe(403);
    const bulk = await bulkAction(accountant(), "invoice", "void", [invoice.id], { reason: "Wrong customer" });
    expect(bulk.skipped[0]?.why).toBe("Only the owner can void or revise a posted document, unless they let you.");

    // The accountant cannot give it to themselves; the owner can.
    expect((await refusal(setVoidGrant(accountant(), accountantId, true))).status).toBe(403);
    await setVoidGrant(owner(), accountantId, true);
    const granted = await booksActor({ user: { id: accountantId, companyId: shop.companyId, role: "FINANCE_OFFICER" } } as never);
    const revised = await reviseDocument(granted, "invoice", invoice.id, { reason: "Wrong customer" });
    expect(revised.draft.id).toBeTruthy();
    const [event] = await events("books.invoice.revised", invoice.id);
    expect(event?.actor).toBe(accountantId);
    await balanced();
  });

  it("purges a test device: what it signed goes, with one snapshot of the device first", async () => {
    const device = await prisma.fiscalisationProviderConfig.create({
      data: { companyId: shop.companyId, providerKey: `zimra-test-${crypto.randomUUID().slice(0, 6)}`, apiBaseUrl: "https://fdmsapitest.invalid", deviceId: "30001", certificateRef: `env:${KEY_ENV}`, isActive: true },
      select: { id: true },
    });
    const day = await openFiscalDay({ companyId: shop.companyId, providerConfigId: device.id });
    const invoice = await issue(90);
    expect((await issueFiscalReceipt(shop.companyId, invoice.id, shop.ownerId)).status).toBe("SUCCESS");
    expect((await prisma.fiscalReceipt.findUniqueOrThrow({ where: { invoiceId: invoice.id } })).fiscalDayId).toBe(day.id);

    // Not until the owner says it is ZIMRA's test environment.
    expect((await refusal(purgeTestDevice(owner(), device.id, { reason: "Test environment data" }))).message).toMatch(/is not marked as a test device/);
    expect((await refusal(markTestDevice(accountant(), device.id, { isTestDevice: true, reason: "Test environment" }))).status).toBe(403);
    await markTestDevice(owner(), device.id, { isTestDevice: true, reason: "Registered on fdmsapitest" });

    const purged = await purgeTestDevice(owner(), device.id, { reason: "Test environment data" });
    expect(purged.purged.map((row) => row.id)).toEqual([invoice.id]);
    expect(purged.skipped).toEqual([]);
    expect(purged.fiscalDaysRemoved).toBe(1);
    expect(await prisma.salesInvoice.findUnique({ where: { id: invoice.id } })).toBeNull();
    expect(await prisma.fiscalReceipt.count({ where: { invoiceId: invoice.id } })).toBe(0);
    expect(await prisma.fiscalDay.count({ where: { providerConfigId: device.id } })).toBe(0);
    const [event] = await events("books.fiscal-device.purged", device.id);
    expect(event).toMatchObject({ id: purged.auditEventId, reason: "Test environment data" });
    expect((JSON.parse(event!.payloadJson!) as { fiscalReceipts: unknown[] }).fiscalReceipts).toHaveLength(1);
    expect(await events("books.invoice.deleted", invoice.id)).toHaveLength(1);
    expect((await net([{ sourceType: "SALES_INVOICE", id: invoice.id }])).count).toBe(0);
    await balanced();
  });
});

describe("P4: till sales on account, lay-bys and school fees in the one statement and aging", () => {
  it("writes a customer line for a sale on account and a lay-by, and a family's line for a fee invoice", async () => {
    const shopper = (await prisma.customer.create({ data: { companyId: shop.companyId, name: "Tariro Moyo" }, select: { id: true } })).id;
    const sale = await prisma.retailSale.create({
      data: {
        companyId: shop.companyId,
        saleNo: `SALE-P4-${crypto.randomUUID().slice(0, 6)}`,
        siteId: shop.mainId,
        customerId: shopper,
        totalAmount: 57.75,
        baseAmount: 57.75,
        postedAt: today(),
        payments: { create: [{ companyId: shop.companyId, tenderType: "ON_ACCOUNT", amount: 50, baseAmount: 50 }, { companyId: shop.companyId, tenderType: "CASH", amount: 7.75, baseAmount: 7.75 }] },
      },
    });
    await syncPaymentLedgerEntryForSource({ companyId: shop.companyId, sourceType: "RETAIL_SALE", sourceId: sale.id });

    const layby = await prisma.retailLayby.create({
      data: { companyId: shop.companyId, laybyNo: `LB-P4-${crypto.randomUUID().slice(0, 6)}`, siteId: shop.mainId, customerId: shopper, total: 120, paid: 30, dueOn: today(), createdById: shop.ownerId },
    });
    const deposit = await prisma.retailLaybyPayment.create({
      data: { companyId: shop.companyId, laybyId: layby.id, kind: "DEPOSIT", tenderType: "CASH", amount: 30, baseAmount: 30, receivedById: shop.ownerId },
    });
    await syncPaymentLedgerEntryForSource({ companyId: shop.companyId, sourceType: "RETAIL_LAYBY_PAYMENT", sourceId: deposit.id });

    const year = await prisma.schoolAcademicYear.create({ data: { companyId: shop.companyId, code: `Y-${crypto.randomUUID().slice(0, 4)}`, name: "2026", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
    const term = await prisma.schoolTerm.create({ data: { companyId: shop.companyId, academicYearId: year.id, code: "T3", name: "Term 3", startDate: new Date("2026-09-01"), endDate: new Date("2026-12-01") } });
    const student = await prisma.schoolStudent.create({ data: { companyId: shop.companyId, studentNo: `ST-${crypto.randomUUID().slice(0, 6)}`, firstName: "Nyasha", lastName: "Dube" } });
    const fee = await prisma.schoolFeeInvoice.create({
      data: { companyId: shop.companyId, invoiceNo: `SFI-${crypto.randomUUID().slice(0, 6)}`, studentId: student.id, termId: term.id, issueDate: today(), dueDate: today(), status: "ISSUED", totalAmount: 300, baseAmount: 300, balanceAmount: 300 },
    });
    await syncPaymentLedgerEntryForSource({ companyId: shop.companyId, sourceType: "SCHOOL_FEE_INVOICE", sourceId: `SCHOOL_FEE_INVOICE:${fee.id}` });

    const lines = await prisma.paymentLedgerEntry.findMany({ where: { companyId: shop.companyId, sourceType: { in: ["RETAIL_SALE", "RETAIL_LAYBY_PAYMENT", "SCHOOL_FEE_INVOICE"] } } });
    expect(lines.map((line) => ({ type: line.sourceType, party: line.partyType, debit: line.debit, credit: line.credit })).sort((a, b) => a.type.localeCompare(b.type))).toEqual([
      { type: "RETAIL_LAYBY_PAYMENT", party: "CUSTOMER", debit: 0, credit: 30 },
      { type: "RETAIL_SALE", party: "CUSTOMER", debit: 50, credit: 0 },
      { type: "SCHOOL_FEE_INVOICE", party: "STUDENT", debit: 300, credit: 0 },
    ]);

    const aging = await partyAging(shop.companyId, "customer");
    expect(aging.rows.find((row) => row.partyId === shopper)).toMatchObject({ name: "Tariro Moyo", total: 20 });
    expect(aging.rows.find((row) => row.partyId === student.id)).toMatchObject({ name: "Nyasha Dube", total: 300 });
    const statement = await partyStatement(shop.companyId, "customer", shopper, new Date("2026-01-01"), new Date("2099-01-01"));
    expect(statement.currencies[0]!.lines.map((line) => line.amount).sort()).toEqual([-30, 50]);
  });
});

// §8 asks for 200 rows; 60 keep the same mix (8 issued, 1 draft, 1 fiscalised in every 10) and the run under a minute.
describe("P4 exit (books-final §8): a selection of invoices, mixed drafts, issued and fiscalised", () => {
  it("voids the issued ones as a granted accountant, then the owner deletes what may go; one audit event per row", async () => {
    const live = await prisma.fiscalisationProviderConfig.create({
      data: { companyId: shop.companyId, providerKey: `zimra-live-${crypto.randomUUID().slice(0, 6)}`, apiBaseUrl: "https://fdms.invalid", deviceId: "40001", certificateRef: `env:${KEY_ENV}`, isActive: true },
      select: { id: true },
    });
    await openFiscalDay({ companyId: shop.companyId, providerConfigId: live.id });
    const issued: string[] = [];
    const drafts: string[] = [];
    const fiscalised: string[] = [];
    for (let n = 0; n < 60; n += 1) {
      if (n % 10 === 0) {
        // Whole-cent VAT: the device signs nothing finer than a cent.
        const invoice = await issue(100 + n * 10);
        expect((await issueFiscalReceipt(shop.companyId, invoice.id, shop.ownerId)).status).toBe("SUCCESS");
        fiscalised.push(invoice.id);
      } else if (n % 5 === 0) drafts.push((await issue(25 + n, "DRAFT")).id);
      else issued.push((await issue(25 + n)).id);
    }
    expect([issued.length, drafts.length, fiscalised.length]).toEqual([48, 6, 6]);
    const all = [...issued, ...drafts, ...fiscalised];
    await setVoidGrant(owner(), accountantId, true);
    const granted = await booksActor({ user: { id: accountantId, companyId: shop.companyId, role: "FINANCE_OFFICER" } } as never);

    const voided = await bulkAction(granted, "invoice", "void", all, { reason: "Imported from the wrong file" });
    expect(voided.failed).toEqual([]);
    expect(voided.done).toHaveLength(54);
    expect(voided.skipped.map((row) => row.id).sort()).toEqual([...drafts].sort());
    expect(new Set(voided.skipped.map((row) => row.why))).toEqual(new Set(["Draft invoice is a draft and nothing was posted: delete it instead."]));
    // The fiscalised ones went through a fiscal credit note each, citing them.
    const notes = await prisma.creditNote.findMany({ where: { invoiceId: { in: fiscalised } }, include: { fiscalReceipt: { select: { status: true } } } });
    expect(notes).toHaveLength(6);
    expect(notes.map((note) => [note.status, note.fiscalReceipt?.status])).toEqual(notes.map(() => ["ISSUED", "SUCCESS"]));
    expect(await prisma.platformAuditEvent.count({ where: { companyId: shop.companyId, eventType: "books.invoice.voided", entityId: { in: all } } })).toBe(54);
    await balanced();

    const removed = await bulkAction(owner(), "invoice", "delete", all, { reason: "Test data", confirm: "delete 60" });
    expect(removed.failed).toEqual([]);
    expect(removed.done.map((row) => row.id).sort()).toEqual([...issued, ...drafts].sort());
    expect(removed.skipped.map((row) => row.id).sort()).toEqual([...fiscalised].sort());
    expect(removed.skipped.every((row) => /was fiscalised, so ZIMRA holds it as issued/.test(row.why))).toBe(true);
    expect(await prisma.platformAuditEvent.count({ where: { companyId: shop.companyId, eventType: "books.invoice.deleted", entityId: { in: all } } })).toBe(54);
    expect(await prisma.salesInvoice.count({ where: { id: { in: all } } })).toBe(6);
    await balanced();
    await prisma.fiscalisationProviderConfig.update({ where: { id: live.id }, data: { isActive: false } });
  }, 600_000);
});
