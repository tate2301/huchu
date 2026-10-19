/**
 * The P1 exit test's ledger pieces (books-final §8), in a fresh workspace:
 * a CRM invoice issued through the core is posted, on its project's cost
 * centre, with its receivable line; a receipt recorded with a bank account
 * posts to that account with its bank transaction; supplier money goes out
 * the same way; no money event is IGNORED; and Money's in/out, Payments
 * received and the trial balance agree to the cent.
 *
 * Not covered here: fiscalising (a fiscal device is not reachable from the
 * test database; `fiscaliseIssuedInvoice` is the same call Books' issue makes),
 * the CRM requisition and the retail sale (their own tests post them through
 * the core), and "no Books button opens /accounting" (the screens' slice).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordPurchasePayment, recordSalesReceipt } from "@/lib/accounting/payments";
import { createInvoiceForLead, recordReceiptForLead } from "@/lib/crm/accounting-bridge";
import { createProject } from "@/lib/crm/projects";
import { prisma } from "@/lib/prisma";

import { destroyBooksFixture, makeBooksFixture, trialBalance, type BooksFixture } from "../invoice-test-fixtures";
import { cameIn, wentOut } from "../money";
import { readPaymentQuery, readPayments } from "../payments";
import { moneyInOut } from "./money-in-out";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });

let fixture: BooksFixture;
let dealId: string;
let costCenterId: string;
let ecocash: string;
let operating: string;

const accountId = async (code: string) => (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fixture.companyId, code }, select: { id: true } })).id;
const monthStart = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 2 * 3_600_000);
};

beforeAll(async () => {
  fixture = await makeBooksFixture("P1 exit");
  const { companyId } = fixture;
  const client = await prisma.crmClient.create({ data: { companyId, clientNo: `CLI-X${fixture.stamp.slice(-4)}`, name: "Borrowdale Brooke Clinic", customerId: fixture.customerId } });
  const pipeline = await prisma.crmPipeline.create({ data: { companyId, name: "Sales", isDefault: true } });
  const stage = await prisma.crmPipelineStage.create({ data: { companyId, pipelineId: pipeline.id, name: "Won", position: 1 } });
  dealId = (await prisma.crmDeal.create({ data: { companyId, dealNo: `CRMD-X${fixture.stamp.slice(-4)}`, title: "Theatre floor", pipelineId: pipeline.id, stageId: stage.id, clientId: client.id } })).id;
  const project = await prisma.$transaction((tx) => createProject(tx, companyId, fixture.ownerId, { name: "Theatre floor", dealId, clientId: client.id }));
  costCenterId = project.costCenterId!;
  ecocash = (await prisma.bankAccount.create({ data: { companyId, name: "EcoCash", kind: "MOBILE", currency: "USD", ledgerAccountId: await accountId("1016") } })).id;
  operating = (await prisma.bankAccount.create({ data: { companyId, name: "Stanbic USD", kind: "BANK", currency: "USD", ledgerAccountId: await accountId("1010") } })).id;
}, 180_000);

afterAll(async () => {
  if (fixture) {
    const { companyId } = fixture;
    await prisma.bankTransaction.deleteMany({ where: { companyId } });
    await prisma.crmActivity.deleteMany({ where: { companyId } });
    await prisma.crmLeadDocument.deleteMany({ where: { companyId } });
    await prisma.purchasePayment.deleteMany({ where: { companyId } });
    await prisma.purchaseBill.deleteMany({ where: { companyId } });
    await prisma.vendor.deleteMany({ where: { companyId } });
    await prisma.crmProject.deleteMany({ where: { companyId } });
    await prisma.crmDeal.deleteMany({ where: { companyId } });
    await prisma.crmPipelineStage.deleteMany({ where: { companyId } });
    await prisma.crmPipeline.deleteMany({ where: { companyId } });
    await prisma.crmClient.deleteMany({ where: { companyId } });
    await prisma.bankAccount.deleteMany({ where: { companyId } });
    await prisma.idSequence.deleteMany({ where: { companyId } });
  }
  await destroyBooksFixture(fixture);
}, 60_000);

describe("P1 exit: money reaches the ledger one way", () => {
  let invoiceId: string;
  let leadDocumentId: string;

  it("issues a CRM invoice through the core: numbered, posted on the project's cost centre, with its receivable line", async () => {
    const made = await createInvoiceForLead({
      companyId: fixture.companyId,
      userId: fixture.ownerId,
      dealId,
      lines: [{ description: "Vinyl sheet, theatre", quantity: 40, unitPrice: 25, taxRate: 15.5 }],
    });
    invoiceId = made.invoiceId;
    leadDocumentId = made.leadDocumentId;
    expect(made.invoiceNumber).toMatch(/^INV-\d{4,}$/);
    expect(made.total).toBe(1155);

    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: invoiceId }, include: { lines: true } });
    expect(entry.status).toBe("POSTED");
    expect(entry.lines.every((line) => line.costCenterId === costCenterId)).toBe(true);
    const line = await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: invoiceId } });
    expect(line).toMatchObject({ status: "POSTED", partyId: fixture.customerId, invoiceId, debit: 1155, journalEntryId: entry.id });

    // The CRM and Books show the same row.
    const doc = await prisma.crmLeadDocument.findUniqueOrThrow({ where: { id: leadDocumentId }, select: { invoiceId: true } });
    expect(doc.invoiceId).toBe(invoiceId);
  });

  it("records the CRM receipt into the bank account chosen, with its bank transaction and sub-ledger line", async () => {
    const before = await trialBalance(fixture.companyId);
    const paid = await recordReceiptForLead({ companyId: fixture.companyId, userId: fixture.ownerId, dealId, invoiceDocumentId: leadDocumentId, amount: 500, method: "Mobile money", bankAccountId: ecocash });
    const receipt = await prisma.salesReceipt.findUniqueOrThrow({ where: { id: paid.receiptId } });
    expect(receipt).toMatchObject({ customerId: fixture.customerId, currency: "USD", exchangeRate: 1, baseAmount: 500, bankAccountId: ecocash });
    const after = await trialBalance(fixture.companyId);
    expect(after["1016"]).toBe((before["1016"] ?? 0) + 500);
    expect(after["1100"]).toBe((before["1100"] ?? 0) - 500);
    expect(await prisma.bankTransaction.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } })).toMatchObject({ bankAccountId: ecocash, amount: 500, direction: "CREDIT" });
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { sourceType: "SALES_RECEIPT", sourceId: receipt.id } })).toMatchObject({ partyId: fixture.customerId, invoiceId, credit: 500 });
  });

  it("takes money on account and pays a supplier the same way", async () => {
    const onAccount = await recordSalesReceipt({ companyId: fixture.companyId, userId: fixture.ownerId, customerId: fixture.customerId, receivedAt: new Date(), amount: 120.35, method: "Bank transfer", bankAccountId: operating });
    expect(await prisma.bankTransaction.count({ where: { sourceType: "SALES_RECEIPT", sourceId: onAccount.id } })).toBe(1);
    const vendor = await prisma.vendor.create({ data: { companyId: fixture.companyId, name: "Msasa Adhesives" } });
    const bill = await prisma.purchaseBill.create({ data: { companyId: fixture.companyId, vendorId: vendor.id, billNumber: `BILL-X${fixture.stamp.slice(-4)}`, billDate: new Date(), status: "RECEIVED", subTotal: 260, total: 260 } });
    const payment = await recordPurchasePayment({ companyId: fixture.companyId, userId: fixture.ownerId, billId: bill.id, paidAt: new Date(), amount: 260, method: "Bank transfer", bankAccountId: operating });
    expect(await prisma.bankTransaction.findFirstOrThrow({ where: { sourceType: "PURCHASE_PAYMENT", sourceId: payment.id } })).toMatchObject({ bankAccountId: operating, direction: "DEBIT" });
  });

  it("leaves no money event IGNORED", async () => {
    expect(await prisma.accountingIntegrationEvent.count({ where: { companyId: fixture.companyId, status: "IGNORED", sourceType: { not: null } } })).toBe(0);
    expect(await prisma.accountingIntegrationEvent.count({ where: { companyId: fixture.companyId, status: { in: ["PENDING", "FAILED"] } } })).toBe(0);
  });

  it("has Money's in/out, Payments received and the trial balance agree to the cent", async () => {
    const flows = await moneyInOut(prisma, fixture.companyId, { from: monthStart() }, "USD");
    expect(flows.totalIn).toBe(620.35);
    expect(flows.totalOut).toBe(260);

    const today = new Date().toISOString().slice(0, 10);
    const money = await cameIn(prisma as never, fixture.companyId, today, "USD");
    expect(money.reduce((sum, source) => sum + source.amount, 0)).toBe(flows.totalIn);
    expect((await wentOut(prisma, fixture.companyId, today, "USD")).amount).toBe(flows.totalOut);

    const payments = await readPayments(prisma as never, fixture.companyId, readPaymentQuery(new URLSearchParams()));
    expect(payments.received).toBe(flows.totalIn);

    const tb = await trialBalance(fixture.companyId);
    const inTheBank = Math.round(((tb["1010"] ?? 0) + (tb["1016"] ?? 0)) * 100) / 100;
    expect(inTheBank).toBe(Math.round((flows.totalIn - flows.totalOut) * 100) / 100);
    const debits = Object.values(tb).reduce((sum, value) => sum + value, 0);
    expect(Math.abs(debits)).toBeLessThan(0.005);
  });
});
