/**
 * P3's exit test (books-final §8), against the test database, with the FDMS
 * transport mocked:
 *
 *   A September with US dollar and ZiG invoices, a US dollar receipt on a ZiG
 *   invoice (settled at another rate: a realised loss), a ZiG receipt into a
 *   ZiG account, an IMTT charge on the bank statement, and a supplier without
 *   a tax clearance paid with 30% withheld, closes with every money account
 *   reconciled to its statement, the VAT return equal to the movement on 2200
 *   and 2210, and the revaluation posted on the 30th and reversed on the 1st.
 *   Voiding a fiscalised invoice sends a fiscal credit note citing it.
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
import { recordPurchasePayment, recordSalesReceipt } from "@/lib/accounting/payments";
import { createOrRefreshVatReturnDraft, transitionVatReturnStatus } from "@/lib/accounting/vat-return";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { acceptMatch, uploadStatement } from "../bank";
import { trialBalance } from "../invoice-test-fixtures";
import { voidInvoice } from "../reverse-invoice";
import { closeReconciliation, reconciledTo, reconciliationSummary, startReconciliation } from "./bank";
import type { BooksActor } from "./can-do";
import { postBill } from "./bills";
import { postInvoice } from "./issue-invoice";
import { nextNumber } from "./numbering";
import { payablesControl, supplierAging } from "./payables";
import { revalueMonth } from "./revaluation";
import { partyAging, partyStatement } from "./statement-aging";
import { whatsDue } from "./tax-calendar";
import { vatFigures } from "./vat-figures";
import { issueWithholdingCertificate, withholdingReturn } from "./withholding";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 180_000 });

const KEY_ENV = `FDMS_P3_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const round = (n: number) => Math.round(n * 100) / 100;

let shop: TestShop;
let usdBank: string;
let zigBank: string;
let customerId: string;
let vendorId: string;
let vat155: string;
const invoices: Record<string, string> = {};
let billId: string;
let paymentId: string;

const owner = (): BooksActor => ({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN" });
const manager = (): BooksActor => ({ companyId: shop.companyId, userId: shop.managerId, role: "MANAGER" });
const code = async (value: string) => (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: shop.companyId, code: value }, select: { id: true } })).id;

/** An invoice issued and posted through the core: one line at 15.5% VAT. */
async function issue(key: string, currency: string, net: number, date: string) {
  const tax = round(net * 0.155);
  const invoice = await prisma.$transaction(async (tx) =>
    tx.salesInvoice.create({
      data: {
        companyId: shop.companyId,
        customerId,
        invoiceNumber: await nextNumber(tx, shop.companyId, "invoice"),
        invoiceDate: day(date),
        status: "ISSUED",
        currency,
        subTotal: net,
        taxTotal: tax,
        total: round(net + tax),
        issuedById: shop.ownerId,
        issuedAt: day(date),
        lines: { create: [{ description: "Vinyl flooring, laid", quantity: 1, unitPrice: net, taxCodeId: vat155, taxRate: 15.5, taxAmount: tax, lineTotal: round(net + tax) }] },
      },
    }),
  );
  const posted = await postInvoice(prisma, { companyId: shop.companyId, invoice, actor: { userId: shop.ownerId, role: "SUPERADMIN" } });
  expect(posted.error).toBeUndefined();
  invoices[key] = invoice.id;
  return invoice;
}

const bankTxn = async (sourceType: "SALES_RECEIPT" | "PURCHASE_PAYMENT", sourceId: string) =>
  (await prisma.bankTransaction.findFirstOrThrow({ where: { companyId: shop.companyId, sourceType, sourceId }, select: { id: true } })).id;

const lineId = async (description: string) =>
  (await prisma.bankStatementLine.findFirstOrThrow({ where: { reconciliation: { companyId: shop.companyId }, description }, select: { id: true } })).id;

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  const keypair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  process.env[KEY_ENV] = JSON.stringify({ key: keypair.privateKey });
  issueMock.mockImplementation(async () => ({ status: "SUCCESS", fiscalNumber: `FDMS-${crypto.randomUUID().slice(0, 6)}`, providerReference: "REF-1", qrCodeData: null, signature: null, rawResponseJson: "{}", error: null, nextRetryAt: null }));

  shop = await makeTestShop("P3 exit");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  await prisma.accountingSettings.update({
    where: { companyId: shop.companyId },
    data: { legalName: "Floorcode Zimbabwe (Pvt) Ltd", vatNumber: "220123456", taxNumber: "2000123456", address: "14 Coventry Rd, Harare" },
  });
  // The ZiG rate: 26 from 1 Sep, 26.5 from the 15th, 27 at the month's end.
  for (const [date, rate] of [["2026-09-01", 26], ["2026-09-15", 26.5], ["2026-09-30", 27]] as const) {
    await prisma.currencyRate.create({ data: { companyId: shop.companyId, baseCurrency: "USD", quoteCurrency: "ZWG", rate, effectiveDate: day(date), source: "RBZ" } });
  }
  const zigLedger = (await prisma.chartOfAccount.create({ data: { companyId: shop.companyId, code: "1012", name: "Stanbic ZiG", type: "ASSET", category: "Cash", nodeType: "LEDGER" }, select: { id: true } })).id;
  usdBank = (await prisma.bankAccount.create({ data: { companyId: shop.companyId, name: "Stanbic USD", bankName: "Stanbic", kind: "BANK", currency: "USD", ledgerAccountId: await code("1010") }, select: { id: true } })).id;
  zigBank = (await prisma.bankAccount.create({ data: { companyId: shop.companyId, name: "Stanbic ZiG", bankName: "Stanbic ZiG", kind: "BANK", currency: "ZWG", ledgerAccountId: zigLedger }, select: { id: true } })).id;
  customerId = (await prisma.customer.create({ data: { companyId: shop.companyId, name: "Pomona Offices", address: "2 Pomona Rd, Harare" }, select: { id: true } })).id;
  vendorId = (await prisma.vendor.create({ data: { companyId: shop.companyId, name: "Chikomo Fitters", vatNumber: "220998877" }, select: { id: true } })).id;
  vat155 = (await prisma.taxCode.update({ where: { companyId_code: { companyId: shop.companyId, code: "VAT15_5" } }, data: { zimraTaxId: 517 }, select: { id: true } })).id;
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
  await prisma.vatReturn.deleteMany({ where: { companyId } });
  await prisma.salesReceipt.deleteMany({ where: { companyId } });
  await prisma.creditNote.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.purchasePayment.deleteMany({ where: { companyId } });
  await prisma.purchaseBill.deleteMany({ where: { companyId } });
  await prisma.bankAccount.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
}, 60_000);

describe("P3 exit: a USD and ZiG month closes with every account reconciled", () => {
  it("posts ZiG documents in US dollars at their frozen rate, keeping the ZiG beside it", async () => {
    await issue("usd", "USD", 1000, "2026-09-02");
    const zig = await issue("zig", "ZWG", 26000, "2026-09-03");
    await issue("open", "ZWG", 13000, "2026-09-28");
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: zig.id } })).toMatchObject({ exchangeRate: 26, rateSource: "RBZ", baseTotal: 1155 });
    const lines = await prisma.journalLine.findMany({ where: { entry: { companyId: shop.companyId, sourceType: "SALES_INVOICE", sourceId: zig.id } }, select: { debit: true, credit: true, currency: true, amountInCurrency: true, exchangeRate: true, account: { select: { code: true } } } });
    expect(lines.find((line) => line.account.code === "1100")).toMatchObject({ debit: 1155, currency: "ZWG", amountInCurrency: 30030, exchangeRate: 26 });
    expect(lines.find((line) => line.account.code === "2200")).toMatchObject({ credit: 155, amountInCurrency: 4030 });
  });

  it("takes a US dollar receipt off a ZiG invoice at the day's rate, and posts the realised loss", async () => {
    const usd = await recordSalesReceipt({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN", invoiceId: invoices.usd, receivedAt: day("2026-09-10"), amount: 1155, method: "Bank transfer", bankAccountId: usdBank });
    const cross = await recordSalesReceipt({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN", invoiceId: invoices.zig, currency: "USD", receivedAt: day("2026-09-20"), amount: 1000, method: "Bank transfer", bankAccountId: usdBank });
    expect(cross).toMatchObject({ currency: "USD", exchangeRate: 1, baseAmount: 1000 });
    // 1,000 US dollars at 26.5 is ZiG 26,500 off the invoice, carried at 26: 1,019.23. A loss of 19.23.
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoices.zig } })).toMatchObject({ amountPaid: 26500, status: "ISSUED" });
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { sourceType: "SALES_RECEIPT", sourceId: cross.id } })).toMatchObject({ currency: "ZWG", credit: 26500 });
    const fx = await prisma.journalLine.findMany({ where: { entry: { sourceType: "SALES_RECEIPT", sourceId: cross.id }, account: { code: { in: ["1100", "4210"] } } }, select: { debit: true, credit: true, account: { select: { code: true } } } });
    expect(round(fx.filter((line) => line.account.code === "1100").reduce((sum, line) => sum + line.credit - line.debit, 0))).toBe(1019.23);
    expect(fx.find((line) => line.account.code === "4210")).toMatchObject({ debit: 19.23 });

    // The rest, in ZiG into the ZiG account on the 25th: 3,530 at 26.5 (133.21), carried at 135.77.
    const rest = await recordSalesReceipt({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN", invoiceId: invoices.zig, receivedAt: day("2026-09-25"), amount: 3530, method: "Bank transfer", bankAccountId: zigBank });
    expect(rest).toMatchObject({ currency: "ZWG", exchangeRate: 26.5, baseAmount: 133.21 });
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoices.zig } })).toMatchObject({ status: "PAID" });
    expect(usd.bankTransactionId).toBeTruthy();
  });

  it("withholds 30% from a supplier without a tax clearance, owed to ZIMRA", async () => {
    const bill = await prisma.$transaction(async (tx) =>
      tx.purchaseBill.create({
        data: {
          companyId: shop.companyId,
          vendorId,
          billNumber: await nextNumber(tx, shop.companyId, "bill"),
          billDate: day("2026-09-05"),
          status: "RECEIVED",
          currency: "USD",
          subTotal: 1500,
          taxTotal: 232.5,
          total: 1732.5,
          fdmsStatus: "VALID",
          supplierFtiNumber: "FTI-77",
          lines: { create: [{ description: "Fitting, Pomona", quantity: 1, unitPrice: 1500, taxRate: 15.5, taxAmount: 232.5, lineTotal: 1732.5 }] },
        },
      }),
    );
    billId = bill.id;
    expect((await postBill(prisma, bill, { userId: shop.ownerId, role: "SUPERADMIN" })).error).toBeUndefined();
    const payment = await recordPurchasePayment({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN", billId, paidAt: day("2026-09-22"), amount: 1732.5, method: "Bank transfer", bankAccountId: usdBank });
    paymentId = payment.id;
    expect(payment).toMatchObject({ withholdingAmount: 519.75, withholdingType: "INCOME_30", exchangeRate: 1, rateSource: "BASE" });
    expect(await prisma.bankTransaction.findFirstOrThrow({ where: { sourceType: "PURCHASE_PAYMENT", sourceId: paymentId } })).toMatchObject({ amount: 1212.75, direction: "DEBIT" });
    expect(await prisma.purchaseBill.findUniqueOrThrow({ where: { id: billId } })).toMatchObject({ status: "PAID" });
    const certificate = await issueWithholdingCertificate(owner(), paymentId);
    expect(certificate.certificateNo).toMatch(/^WHT-/);
    const ret = await withholdingReturn(shop.companyId, "2026-09");
    expect(ret).toMatchObject({ returnDue: "2026-10-05", paymentDue: "2026-10-10", ledger: { withholding: 519.75, vatWithheld: 0 }, missingCertificates: 0 });
    expect(ret.rows[0]).toMatchObject({ supplier: "Chikomo Fitters", gross: 1732.5, incomeTax: 519.75 });
  });

  it("matches every statement line, the IMTT charge to its own account, and closes both reconciliations", async () => {
    await uploadStatement(prisma, {
      companyId: shop.companyId,
      userId: shop.managerId,
      accountId: usdBank,
      rows: [
        { date: "2026-09-10", description: "Pomona Offices INV payment", reference: null, amount: 1155, direction: "CREDIT" },
        { date: "2026-09-20", description: "Pomona Offices transfer", reference: null, amount: 1000, direction: "CREDIT" },
        { date: "2026-09-22", description: "Chikomo Fitters", reference: null, amount: 1212.75, direction: "DEBIT" },
        { date: "2026-09-22", description: "IMTT 2% tax on transfer", reference: null, amount: 24.26, direction: "DEBIT" },
      ],
    });
    await uploadStatement(prisma, { companyId: shop.companyId, userId: shop.managerId, accountId: zigBank, rows: [{ date: "2026-09-25", description: "Pomona Offices ZiG", reference: null, amount: 3530, direction: "CREDIT" }] });

    const receipts = await prisma.salesReceipt.findMany({ where: { companyId: shop.companyId }, orderBy: { receivedAt: "asc" }, select: { id: true } });
    const who = { companyId: shop.companyId, userId: shop.managerId, role: "MANAGER" };
    await acceptMatch(prisma, { ...who, lineId: await lineId("Pomona Offices INV payment"), match: { kind: "transaction", transactionId: await bankTxn("SALES_RECEIPT", receipts[0].id) } });
    await acceptMatch(prisma, { ...who, lineId: await lineId("Pomona Offices transfer"), match: { kind: "transaction", transactionId: await bankTxn("SALES_RECEIPT", receipts[1].id) } });
    await acceptMatch(prisma, { ...who, lineId: await lineId("Chikomo Fitters"), match: { kind: "transaction", transactionId: await bankTxn("PURCHASE_PAYMENT", paymentId) } });
    await acceptMatch(prisma, { ...who, lineId: await lineId("IMTT 2% tax on transfer"), match: { kind: "bank-charges", amount: 24.26, imtt: true } });
    await acceptMatch(prisma, { ...who, lineId: await lineId("Pomona Offices ZiG"), match: { kind: "transaction", transactionId: await bankTxn("SALES_RECEIPT", receipts[2].id) } });

    const imtt = await prisma.journalLine.findFirstOrThrow({ where: { entry: { companyId: shop.companyId, sourceType: "BANK_TRANSACTION" }, account: { code: "5465" } }, select: { debit: true } });
    expect(imtt.debit).toBe(24.26);

    const usdRec = await startReconciliation(manager(), { bankAccountId: usdBank, statementEndDate: day("2026-09-30"), statementBalance: 917.99 });
    expect(await reconciliationSummary(shop.companyId, usdRec.id)).toMatchObject({ bookBalance: 917.99, toMatch: 0, outstanding: 0, difference: 0, canClose: true });
    await closeReconciliation(manager(), usdRec.id);
    const zigRec = await startReconciliation(manager(), { bankAccountId: zigBank, statementEndDate: day("2026-09-30"), statementBalance: 3530 });
    await closeReconciliation(manager(), zigRec.id);
    expect((await reconciledTo(shop.companyId, day("2026-09-30"))).every((account) => account.reconciled)).toBe(true);
    const tb = await trialBalance(shop.companyId);
    expect(tb["1010"]).toBe(917.99);
  });

  it("has the VAT return equal the movement on 2200 and 2210, due on the 10th and 15th", async () => {
    const figures = await vatFigures(shop.companyId, day("2026-09-01"), day("2026-09-30"));
    // Output: 155 + ZiG 4,030 at 26 (155.00) + ZiG 2,015 at 26.5 (76.04). Input: the bill's 232.50, its FTI valid.
    expect(figures.totals).toMatchObject({ output: 386.04, input: 232.5, net: 153.54 });
    expect(figures.tieOut.ties).toBe(true);
    expect(figures.tieOut.output).toMatchObject({ ledger: 386.04, difference: 0 });
    expect(figures.tieOut.input).toMatchObject({ ledger: 232.5, difference: 0 });
    expect(figures.byCurrency).toEqual(expect.arrayContaining([{ currency: "ZWG", output: 6045, input: 0 }]));
    expect(figures).toMatchObject({ returnDue: "2026-10-10", paymentDue: "2026-10-15" });

    const draft = await createOrRefreshVatReturnDraft({ companyId: shop.companyId, periodStart: day("2026-09-01"), periodEnd: day("2026-09-30"), preparedById: shop.managerId });
    expect(draft).toMatchObject({ outputTax: 386.04, inputTax: 232.5, netTax: 153.54 });
    expect(draft.returnDueDate?.toISOString().slice(0, 10)).toBe("2026-10-10");
    await transitionVatReturnStatus({ companyId: shop.companyId, vatReturnId: draft.id, nextStatus: "REVIEWED", actorId: shop.ownerId });
    await transitionVatReturnStatus({ companyId: shop.companyId, vatReturnId: draft.id, nextStatus: "FINALIZED", actorId: shop.managerId });

    const due = await whatsDue(shop.companyId, day("2026-10-01"), day("2026-10-31"));
    expect(due.map((item) => [item.date, item.kind, item.amount])).toEqual(
      expect.arrayContaining([
        ["2026-10-05", "WHT_RETURN", 519.75],
        ["2026-10-10", "VAT_RETURN", 153.54],
        ["2026-10-15", "VAT_PAYMENT", 153.54],
      ]),
    );
  });

  it("revalues what is held in ZiG on the 30th and reverses it on the 1st", async () => {
    const result = await revalueMonth(manager(), "2026-09");
    expect(result.plan?.rates).toEqual({ ZWG: 27 });
    // The open ZiG invoice (15,015 at 26.5 → 27: −10.49) and the ZiG account (3,530: 133.21 → 130.74: −2.47).
    expect(result.plan?.gain).toBe(-12.96);
    const entry = await prisma.journalEntry.findUniqueOrThrow({ where: { id: result.entryId! }, include: { lines: { include: { account: { select: { code: true } } } } } });
    expect(entry.entryDate.toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(entry.lines.find((line) => line.account.code === "4220")).toMatchObject({ debit: 12.96 });
    const reversal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: result.reversalId! }, include: { lines: { include: { account: { select: { code: true } } } } } });
    expect(reversal).toMatchObject({ reversalOfEntryId: entry.id, sourceType: "FX_REVALUATION" });
    expect(reversal.entryDate.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(reversal.lines.find((line) => line.account.code === "4220")).toMatchObject({ credit: 12.96 });
    expect((await revalueMonth(manager(), "2026-09")).already).toBe(true);
  });

  it("ties every control account to its one aging, and balances", async () => {
    const tb = await trialBalance(shop.companyId);
    expect(Math.abs(Object.values(tb).reduce((sum, value) => sum + value, 0))).toBeLessThan(0.005);
    // After the 1st's reversal the receivable is carried at the documents' own rates again.
    const customers = await partyAging(shop.companyId, "customer", day("2026-10-02"));
    expect(customers.total.total).toBe(tb["1100"]);
    expect(customers.rows[0].byCurrency).toEqual([expect.objectContaining({ currency: "ZWG", total: 15015 })]);
    expect((await supplierAging(shop.companyId)).total).toBe(await payablesControl(shop.companyId));
    expect(tb["2180"]).toBe(-519.75);
    expect(round(tb["4210"])).toBe(round(19.23 + 2.56));
    const statement = await partyStatement(shop.companyId, "customer", customerId, day("2026-09-01"), day("2026-09-30"));
    const zig = statement.currencies.find((group) => group.currency === "ZWG")!;
    expect(zig).toMatchObject({ opening: 0, closing: 15015 });
    expect(zig.lines.map((line) => line.amount)).toEqual([30030, -26500, -3530, 15015]);
  });

  it("voids a fiscalised invoice with a fiscal credit note that cites it", async () => {
    const provider = await prisma.fiscalisationProviderConfig.create({
      data: { companyId: shop.companyId, providerKey: `zimra-p3-${crypto.randomUUID().slice(0, 6)}`, apiBaseUrl: "https://fdms.invalid", deviceId: "20001", certificateRef: `env:${KEY_ENV}`, isActive: true },
      select: { id: true },
    });
    await openFiscalDay({ companyId: shop.companyId, providerConfigId: provider.id });
    const invoice = await issue("fiscal", "USD", 100, new Date().toISOString().slice(0, 10));
    const sent = await issueFiscalReceipt(shop.companyId, invoice.id, shop.ownerId);
    expect(sent.status).toBe("SUCCESS");
    const original = await prisma.fiscalReceipt.findUniqueOrThrow({ where: { invoiceId: invoice.id }, include: { fiscalDay: true } });

    const voided = await voidInvoice(owner(), invoice.id, { reason: "Customer cancelled the order" });
    expect(voided.creditNote?.fiscalSent).toBe(true);
    const note = await prisma.creditNote.findUniqueOrThrow({ where: { id: voided.creditNote!.id }, include: { fiscalReceipt: true } });
    expect(note).toMatchObject({ status: "ISSUED", currency: "USD", total: invoice.total, reason: "Customer cancelled the order" });
    expect(note.fiscalReceipt).toMatchObject({ status: "SUCCESS", receiptType: "CREDITNOTE", receiptCurrency: "USD" });
    expect(note.fiscalReceipt!.receiptGlobalNo).toBe((original.receiptGlobalNo ?? 0) + 1);
    const sentPayload = issueMock.mock.calls.at(-1)![0].payload.payload as { creditDebitNote: Record<string, unknown>; reason: string };
    expect(sentPayload.creditDebitNote).toMatchObject({ receiptGlobalNo: original.receiptGlobalNo, fiscalDayNo: original.fiscalDay!.fiscalDayNo, deviceID: "20001" });
    expect(sentPayload.reason).toBe("Customer cancelled the order");
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: "VOIDED" });
    // The invoice's VAT came off through the credit note: nothing on it is owed or due.
    const lines = await prisma.journalLine.findMany({
      where: { entry: { companyId: shop.companyId, OR: [{ sourceType: "SALES_INVOICE", sourceId: invoice.id }, { sourceType: "SALES_CREDIT_NOTE", sourceId: note.id }] }, account: { code: { in: ["1100", "2200"] } } },
      select: { debit: true, credit: true },
    });
    expect(round(lines.reduce((sum, line) => sum + line.debit - line.credit, 0))).toBe(0);
  });
});
