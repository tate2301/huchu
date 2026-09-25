/**
 * Editing an issued invoice, and revising a quote, against a real database.
 *
 * The invoice edit is the one worth being paranoid about, because every way
 * it can go wrong still "balances". A reversal that marks the original
 * REVERSED and posts a POSTED mirror double-reverses in every report that
 * counts POSTED entries, and the trial balance still agrees with itself — so
 * the assertion that matters is not "debits equal credits" but "receivables
 * say what the invoice now says". The same goes for the refusals: an invoice
 * someone has paid, credited, written off or fiscalised must come back
 * exactly as it was, with nothing posted.
 *
 * The quote half pins the revision path the builder now uses: a new version,
 * the old one void, and the client's link following the work.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  DocumentLockedError,
  createInvoiceForLead,
  createQuotationForLead,
  recordReceiptForLead,
  updateInvoiceForDocument,
} from "@/lib/crm/accounting-bridge";
import { getApprovalByToken, getOrCreateApproval, respondToApproval } from "@/lib/crm/approvals";
import { getTrialBalance } from "@/lib/accounting/ledger";
import { JournalReversalError, salesInvoicePostingKey } from "@/lib/accounting/journals";

const SLUG = "crm-document-edit-test";
const EMAIL = "crm-document-edit-test@example.invalid";

let companyId: string;
let userId: string;
let leadId: string;
let otherLeadId: string;

/** 100 × 20.00 + 15% tax = 2,300.00 */
const ORIGINAL = [{ description: "Epoxy floor, per m²", quantity: 100, unitPrice: 20, taxRate: 15 }];
/** 120 × 20.00 + 15% tax = 2,760.00 */
const EDITED = [{ description: "Epoxy floor, per m²", quantity: 120, unitPrice: 20, taxRate: 15 }];
/** 120 × 20.00 + 150 × 1.00, 15% tax = 2,932.50 */
const EDITED_AGAIN = [
  { description: "Epoxy floor, per m²", quantity: 120, unitPrice: 20, taxRate: 15 },
  { description: "Skirting, per m", quantity: 150, unitPrice: 1, taxRate: 15 },
];

async function clear() {
  await prisma.crmDocumentApproval.deleteMany({ where: { companyId } });
  await prisma.crmActivity.deleteMany({ where: { companyId } });
  await prisma.crmLeadDocument.deleteMany({ where: { companyId } });
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
  await prisma.creditNote.deleteMany({ where: { companyId } });
  await prisma.salesWriteOff.deleteMany({ where: { companyId } });
  await prisma.salesReceipt.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.salesQuotation.deleteMany({ where: { companyId } });
  await prisma.paymentLedgerEntry.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.updateMany({ where: { companyId }, data: { status: "OPEN" } });
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Document Edit Test", slug: SLUG },
  });
  companyId = company.id;
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Chipo Accounts", companyId, role: "MANAGER" },
  });
  userId = user.id;

  await clear();
  await prisma.crmLead.deleteMany({ where: { companyId } });
  const [lead, other] = await Promise.all([
    prisma.crmLead.create({
      data: { companyId, leadNo: "LEAD-EDIT-1", title: "Warehouse floor", contactName: "Tariro Moyo" },
    }),
    prisma.crmLead.create({
      data: { companyId, leadNo: "LEAD-EDIT-2", title: "Showroom floor", contactName: "Farai Dube" },
    }),
  ]);
  leadId = lead.id;
  otherLeadId = other.id;
});

beforeEach(clear);

afterAll(async () => {
  await clear();
  await prisma.crmLead.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  // The chart and tax codes posting seeded refuse a cascading delete; the
  // slug is fixed, so a company left behind is reused rather than piling up.
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
});

function invoiceOnLead(lines = ORIGINAL) {
  return createInvoiceForLead({ companyId, userId, leadId, lines });
}

function editInvoice(leadDocumentId: string, lines = EDITED) {
  return updateInvoiceForDocument({ companyId, userId, leadId, leadDocumentId, lines });
}

async function entryWithLines(where: { id?: string; sourceId?: string }) {
  return prisma.journalEntry.findFirstOrThrow({
    where: { companyId, ...where },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
}

function byAccount(lines: Array<{ debit: number; credit: number; account: { code: string } }>) {
  const net = new Map<string, number>();
  for (const line of lines) {
    net.set(line.account.code, (net.get(line.account.code) ?? 0) + line.debit - line.credit);
  }
  return net;
}

async function balanceOf(code: string) {
  const trial = await getTrialBalance({ companyId });
  return trial.rows.find((row) => row.code === code)?.balance ?? 0;
}

describe("editing an issued invoice", () => {
  it("reverses the old posting, posts the new figures, and leaves receivables at the new total", async () => {
    const invoice = await invoiceOnLead();
    const original = await entryWithLines({ sourceId: invoice.invoiceId });
    expect(await balanceOf("1100")).toBeCloseTo(2300, 2);

    const result = await editInvoice(invoice.leadDocumentId);
    expect(result.total).toBeCloseTo(2760, 2);
    expect(result.revision).toBe(1);

    // The original stays on the books, stamped, and its mirror cancels it
    // account by account.
    const after = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: original.id },
      include: { reversalEntry: { select: { id: true } } },
    });
    expect(after.status).toBe("POSTED");
    expect(after.reversedAt).not.toBeNull();
    const mirror = await entryWithLines({ id: after.reversalEntry!.id });
    expect(mirror.status).toBe("POSTED");
    expect(mirror.reversalOfEntryId).toBe(original.id);
    for (const [, net] of byAccount([...original.lines, ...mirror.lines])) {
      expect(net).toBeCloseTo(0, 2);
    }

    // The new entry carries the new totals, under the revision's own key.
    const reposted = await entryWithLines({
      sourceId: salesInvoicePostingKey({ id: invoice.invoiceId, revision: 1 }),
    });
    expect(reposted.id).toBe(result.journalEntryId);
    const repostedNet = byAccount(reposted.lines);
    expect(repostedNet.get("1100")).toBeCloseTo(2760, 2);
    expect(repostedNet.get("4000")).toBeCloseTo(-2400, 2);
    expect(repostedNet.get("2200")).toBeCloseTo(-360, 2);

    // Three entries, three distinct numbers — all written in one transaction.
    const numbers = [original.entryNumber, mirror.entryNumber, reposted.entryNumber];
    expect(new Set(numbers).size).toBe(3);

    // The ledger still balances, and — the part a double reversal would
    // quietly get wrong — says what the invoice now says.
    const trial = await getTrialBalance({ companyId });
    expect(trial.totals.debit).toBeCloseTo(trial.totals.credit, 2);
    expect(await balanceOf("1100")).toBeCloseTo(2760, 2);
    expect(await balanceOf("4000")).toBeCloseTo(-2400, 2);
    expect(await balanceOf("2200")).toBeCloseTo(-360, 2);

    // The invoice keeps its number and carries the new lines.
    const stored = await prisma.salesInvoice.findUniqueOrThrow({
      where: { id: invoice.invoiceId },
      include: { lines: true },
    });
    expect(stored.invoiceNumber).toBe(invoice.invoiceNumber);
    expect(stored.total).toBeCloseTo(2760, 2);
    expect(stored.revision).toBe(1);
    expect(stored.lines.map((line) => line.quantity)).toEqual([120]);
    const document = await prisma.crmLeadDocument.findUniqueOrThrow({
      where: { id: invoice.leadDocumentId },
    });
    expect(document.amount).toBeCloseTo(2760, 2);
  });

  it("reverses the previous edit's posting when edited again", async () => {
    const invoice = await invoiceOnLead();
    await editInvoice(invoice.leadDocumentId, EDITED);
    const second = await editInvoice(invoice.leadDocumentId, EDITED_AGAIN);
    expect(second.revision).toBe(2);
    expect(second.total).toBeCloseTo(2932.5, 2);

    const firstRepost = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId, sourceId: salesInvoicePostingKey({ id: invoice.invoiceId, revision: 1 }) },
    });
    expect(firstRepost.reversedAt).not.toBeNull();

    const trial = await getTrialBalance({ companyId });
    expect(trial.totals.debit).toBeCloseTo(trial.totals.credit, 2);
    expect(await balanceOf("1100")).toBeCloseTo(2932.5, 2);
    // Only the latest revision is live; every other invoice posting is reversed.
    const live = await prisma.journalEntry.findMany({
      where: { companyId, sourceType: "SALES_INVOICE", status: "POSTED", reversedAt: null },
      select: { sourceId: true },
    });
    expect(live.map((entry) => entry.sourceId)).toEqual([
      salesInvoicePostingKey({ id: invoice.invoiceId, revision: 2 }),
    ]);
  });

  it("refuses, and changes nothing, when the new period is closed", async () => {
    const invoice = await invoiceOnLead();
    const before = await prisma.journalEntry.count({ where: { companyId } });
    await prisma.accountingPeriod.updateMany({
      where: { companyId, startDate: { lte: new Date() }, endDate: { gte: new Date() } },
      data: { status: "CLOSED" },
    });

    await expect(editInvoice(invoice.leadDocumentId)).rejects.toBeInstanceOf(JournalReversalError);

    expect(await prisma.journalEntry.count({ where: { companyId } })).toBe(before);
    const stored = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.invoiceId } });
    expect(stored.total).toBeCloseTo(2300, 2);
    expect(stored.revision).toBe(0);
    // Nothing waits in the outbox to post the edit that was refused.
    expect(
      await prisma.accountingIntegrationEvent.count({
        where: {
          companyId,
          sourceId: salesInvoicePostingKey({ id: invoice.invoiceId, revision: 1 }),
          status: { in: ["PENDING", "FAILED"] },
        },
      }),
    ).toBe(0);
  });
});

describe("an invoice something has happened to", () => {
  /** Refused with the reason, and the books and the invoice exactly as they were. */
  async function expectLocked(leadDocumentId: string, invoiceId: string, reason: string) {
    const entries = await prisma.journalEntry.count({ where: { companyId } });
    const before = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });

    const attempt = editInvoice(leadDocumentId);
    await expect(attempt).rejects.toBeInstanceOf(DocumentLockedError);
    await expect(attempt).rejects.toThrow(reason);

    expect(await prisma.journalEntry.count({ where: { companyId } })).toBe(entries);
    const after = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(after.total).toBe(before.total);
    expect(after.revision).toBe(before.revision);
  }

  it("is refused once part paid", async () => {
    const invoice = await invoiceOnLead();
    await recordReceiptForLead({
      companyId,
      userId,
      leadId,
      invoiceDocumentId: invoice.leadDocumentId,
      amount: 100,
      method: "Bank transfer",
    });
    await expectLocked(invoice.leadDocumentId, invoice.invoiceId, "Part paid — issue a credit note in Accounting");
  });

  it("is refused once paid in full", async () => {
    const invoice = await invoiceOnLead();
    await recordReceiptForLead({
      companyId,
      userId,
      leadId,
      invoiceDocumentId: invoice.leadDocumentId,
      amount: 2300,
      method: "Bank transfer",
    });
    await expectLocked(invoice.leadDocumentId, invoice.invoiceId, "Paid — issue a credit note in Accounting");
  });

  it("is refused once a credit note exists, even a draft", async () => {
    const invoice = await invoiceOnLead();
    await prisma.creditNote.create({
      data: { companyId, invoiceId: invoice.invoiceId, noteNumber: `CN-EDIT-${Date.now()}`, noteDate: new Date(), total: 50 },
    });
    await expectLocked(invoice.leadDocumentId, invoice.invoiceId, "Credited — adjust it with a credit note in Accounting");
  });

  it("is refused once part of it is written off", async () => {
    const invoice = await invoiceOnLead();
    await prisma.salesWriteOff.create({ data: { companyId, invoiceId: invoice.invoiceId, amount: 50 } });
    await expectLocked(invoice.leadDocumentId, invoice.invoiceId, "Written off — adjust it in Accounting");
  });

  it("is refused once sent to the fiscal device, whatever came back", async () => {
    const invoice = await invoiceOnLead();
    await prisma.fiscalReceipt.create({ data: { companyId, invoiceId: invoice.invoiceId, status: "FAILED" } });
    await expectLocked(invoice.leadDocumentId, invoice.invoiceId, "Sent to ZIMRA — issue a credit note in Accounting");
  });

  it("is refused once void", async () => {
    const invoice = await invoiceOnLead();
    await prisma.salesInvoice.update({ where: { id: invoice.invoiceId }, data: { status: "VOIDED" } });
    await expectLocked(invoice.leadDocumentId, invoice.invoiceId, "Voided — raise a new invoice instead");
  });
});

describe("revising a quote", () => {
  const CHEAPER = [{ description: "Epoxy floor, per m²", quantity: 100, unitPrice: 17.5 }];

  it("issues the next version, voids the old one and moves the client's link to it", async () => {
    const first = await createQuotationForLead({ companyId, userId, leadId, lines: ORIGINAL });
    const { token } = await prisma.$transaction((tx) =>
      getOrCreateApproval(tx, { companyId, leadDocumentId: first.leadDocumentId }),
    );
    await respondToApproval({ token, action: "DECLINE", note: "Too dear" });

    const second = await createQuotationForLead({
      companyId,
      userId,
      leadId,
      lines: CHEAPER,
      supersedesId: first.leadDocumentId,
      revisionNote: "Cheaper resin",
    });

    const revised = await prisma.crmLeadDocument.findUniqueOrThrow({ where: { id: second.leadDocumentId } });
    expect(revised.version).toBe(2);
    expect(revised.supersedesId).toBe(first.leadDocumentId);
    expect(revised.revisionNote).toBe("Cheaper resin");

    const old = await prisma.salesQuotation.findUniqueOrThrow({ where: { id: first.quotationId } });
    expect(old.status).toBe("VOIDED");

    // The same link, now on the new version, asking for a fresh answer.
    const approval = await prisma.crmDocumentApproval.findUniqueOrThrow({ where: { token } });
    expect(approval.leadDocumentId).toBe(second.leadDocumentId);
    expect(approval.status).toBe("PENDING");
    expect(approval.respondedAt).toBeNull();
    expect(approval.responseNote).toBeNull();

    const view = await getApprovalByToken(token);
    expect(view?.number).toBe(second.quotationNumber);
    expect(view?.total).toBeCloseTo(1750, 2);
    expect(view?.linkState).toBe("ACTIVE");
  });

  it("refuses to revise a quote that has already been replaced", async () => {
    const first = await createQuotationForLead({ companyId, userId, leadId, lines: ORIGINAL });
    await createQuotationForLead({
      companyId,
      userId,
      leadId,
      lines: CHEAPER,
      supersedesId: first.leadDocumentId,
    });
    await expect(
      createQuotationForLead({ companyId, userId, leadId, lines: CHEAPER, supersedesId: first.leadDocumentId }),
    ).rejects.toThrow("Voided");
  });

  it("refuses to revise an accepted quote", async () => {
    const first = await createQuotationForLead({ companyId, userId, leadId, lines: ORIGINAL });
    const { token } = await prisma.$transaction((tx) =>
      getOrCreateApproval(tx, { companyId, leadDocumentId: first.leadDocumentId }),
    );
    await respondToApproval({ token, action: "APPROVE", name: "Tariro Moyo" });

    await expect(
      createQuotationForLead({ companyId, userId, leadId, lines: CHEAPER, supersedesId: first.leadDocumentId }),
    ).rejects.toThrow("Accepted");
    const accepted = await prisma.salesQuotation.findUniqueOrThrow({ where: { id: first.quotationId } });
    expect(accepted.status).toBe("ACCEPTED");
  });

  it("refuses to supersede another record's quote", async () => {
    const theirs = await createQuotationForLead({ companyId, userId, leadId: otherLeadId, lines: ORIGINAL });
    await expect(
      createQuotationForLead({ companyId, userId, leadId, lines: CHEAPER, supersedesId: theirs.leadDocumentId }),
    ).rejects.toThrow("doesn't exist");
    const untouched = await prisma.salesQuotation.findUniqueOrThrow({ where: { id: theirs.quotationId } });
    expect(untouched.status).toBe("SENT");
  });
});
