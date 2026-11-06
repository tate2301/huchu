import type { PrismaClient } from "@prisma/client";

import type { EnsuredCrmDocument } from "@/lib/books/crm-document-bridge";
import { docLabel } from "@/lib/books/doc-number";
import type { OpenInvoice } from "@/lib/books/payment-form";

import { customerFace, customerImage } from "./faces";
import { dayOf, methodWord, money, shortDay, storedDay } from "./format";
import { INVOICE_STATE_LABEL, invoiceState, type InvoiceState } from "./invoice-state";
import { facesOf, historyOf, historyWhen, postingRows, type Faces, type HistoryItem, type PostingRow } from "./record-view";

export type PaymentRecord = {
  id: string;
  number: string;
  state: { key: "received" | "on-account" | "void"; label: string };
  stateLabel: string;
  customer: { id: string | null; name: string; contact?: string | null; image?: string | null };
  faces?: Faces;
  currency: string;
  amount: number;
  date: string;
  method: string;
  reference: string | null;
  into: string;
  bankLine: "Matched" | "To match" | "No bank line" | "Void";
  rate: string;
  madeBy: string;
  invoice: {
    id: string;
    number: string;
    date: string;
    stateKey: InvoiceState;
    stateLabel: string;
    total: number;
    balance: number;
  } | null;
  deal: string | null;
  dealId: string | null;
  lead: string | null;
  leadId: string | null;
  voided: { reason: string | null; by: string | null; on: string } | null;
  posting: PostingRow[];
  entries: number;
  history: HistoryItem[];
};

export type PaymentRecordPage = PaymentRecord & {
  can: {
    void: boolean;
    apply?: boolean;
  };
  openInvoices?: OpenInvoice[];
  crmDocument?: EnsuredCrmDocument | null;
};

export async function readPaymentRecord(
  db: PrismaClient,
  companyId: string,
  id: string,
  now = new Date(),
): Promise<PaymentRecord | null> {
  const receipt = await db.salesReceipt.findFirst({
    where: {
      companyId,
      OR: [{ id }, { crmLeadDocuments: { some: { id } } }],
    },
    select: {
      id: true,
      receiptNumber: true,
      receivedAt: true,
      amount: true,
      currency: true,
      exchangeRate: true,
      method: true,
      reference: true,
      voidedAt: true,
      voidReason: true,
      createdAt: true,
      customerId: true,
      customer: { select: { id: true, name: true, contactName: true, ...customerFace } },
      createdBy: { select: { name: true, image: true } },
      voidedBy: { select: { name: true, image: true } },
      bankAccount: { select: { id: true, name: true, bankName: true, currency: true } },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          status: true,
          currency: true,
          total: true,
          amountPaid: true,
          creditTotal: true,
          writeOffTotal: true,
          customer: { select: { id: true, name: true, contactName: true, ...customerFace } },
          receipts: { where: { voidedAt: null }, select: { receivedAt: true, method: true }, orderBy: { receivedAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!receipt) return null;

  const [doc, entries, bankTxns] = await Promise.all([
    db.crmLeadDocument.findFirst({
      where: {
        companyId,
        OR: [
          { receiptId: receipt.id },
          ...(receipt.invoice ? [{ invoiceId: receipt.invoice.id, type: "INVOICE" as const }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        createdBy: { select: { name: true, image: true } },
        deal: { select: { id: true, dealNo: true, title: true, wonAt: true } },
        lead: { select: { id: true, leadNo: true, title: true } },
        approval: {
          select: {
            status: true,
            createdAt: true,
            firstViewedAt: true,
          },
        },
      },
    }),
    db.journalEntry.findMany({
      where: {
        companyId,
        OR: [
          { sourceType: "SALES_RECEIPT", sourceId: receipt.id },
          { sourceType: "SALES_RECEIPT", sourceId: { startsWith: `${receipt.id}:` } },
          { sourceType: "SALES_RECEIPT", sourceId: `void:${receipt.id}` },
          { sourceType: "SALES_RECEIPT", sourceId: { startsWith: `void:${receipt.id}:` } },
        ],
      },
      orderBy: [{ entryDate: "asc" }, { entryNumber: "asc" }],
      select: {
        entryNumber: true,
        entryDate: true,
        lines: { select: { debit: true, credit: true, account: { select: { code: true, name: true } } } },
      },
    }),
    db.bankTransaction.findMany({
      where: { companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id },
      select: { id: true, matchedStatementLines: { select: { id: true }, take: 1 } },
    }),
  ]);

  const customerRecord = receipt.invoice?.customer ?? receipt.customer;
  const currency = receipt.currency ?? receipt.invoice?.currency ?? "USD";
  const today = dayOf(now);
  const methodNice = methodWord(receipt.method).replace(/^./, (c) => c.toUpperCase());
  const into = receipt.bankAccount
    ? `${receipt.bankAccount.bankName || receipt.bankAccount.name}, ${receipt.bankAccount.currency}`
    : methodNice;

  const isMatched = bankTxns.some((row) => row.matchedStatementLines.length > 0);
  const bankLine: PaymentRecord["bankLine"] = receipt.voidedAt
    ? "Void"
    : isMatched
      ? "Matched"
      : bankTxns.length > 0
        ? "To match"
        : "No bank line";

  const state: PaymentRecord["state"] = receipt.voidedAt
    ? { key: "void", label: "Void" }
    : receipt.invoice
      ? { key: "received", label: "Received" }
      : { key: "on-account", label: "On account" };

  let invoiceView: PaymentRecord["invoice"] = null;
  if (receipt.invoice) {
    const inv = receipt.invoice;
    const invState = invoiceState(
      {
        status: inv.status,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        total: inv.total,
        amountPaid: inv.amountPaid,
        creditTotal: inv.creditTotal,
        writeOffTotal: inv.writeOffTotal,
        lastReceipt: inv.receipts[0] ?? null,
      },
      today,
    );
    invoiceView = {
      id: inv.id,
      number: docLabel(inv.invoiceNumber),
      date: shortDay(storedDay(inv.invoiceDate)),
      stateKey: invState.state,
      stateLabel: INVOICE_STATE_LABEL[invState.state],
      total: inv.total,
      balance: invState.balance,
    };
  }

  const historyItems: Array<HistoryItem & { at: Date }> = [
    {
      tone: "ok",
      text: `${receipt.createdBy?.name ?? "Someone"} recorded ${receipt.receiptNumber} (${money(receipt.amount, currency)})${invoiceView ? ` on ${invoiceView.number}` : " on account"}.`,
      when: historyWhen(receipt.createdAt, now),
      at: receipt.createdAt,
    },
  ];
  if (doc?.type === "RECEIPT" && doc.approval?.createdAt) {
    historyItems.push({
      tone: "in",
      text: "Receipt link shared.",
      when: historyWhen(doc.approval.createdAt, now),
      at: doc.approval.createdAt,
    });
  }
  if (doc?.type === "RECEIPT" && doc.approval?.firstViewedAt) {
    historyItems.push({
      tone: "in",
      text: `${customerRecord?.name ?? "The customer"} opened the receipt link.`,
      when: historyWhen(doc.approval.firstViewedAt, now),
      at: doc.approval.firstViewedAt,
    });
  }
  if (receipt.voidedAt) {
    historyItems.push({
      tone: "wa",
      text: `${receipt.voidedBy?.name ?? "Someone"} voided ${receipt.receiptNumber}${receipt.voidReason ? `: ${receipt.voidReason}` : "."}`,
      when: historyWhen(receipt.voidedAt, now),
      at: receipt.voidedAt,
    });
  }

  return {
    id: receipt.id,
    number: receipt.receiptNumber,
    state,
    stateLabel: state.label,
    customer: {
      id: customerRecord?.id ?? receipt.customerId ?? null,
      name: customerRecord?.name ?? "Customer on account",
      contact: customerRecord?.contactName ?? null,
      image: customerRecord ? customerImage(customerRecord) : null,
    },
    faces: facesOf(receipt.createdBy, receipt.voidedBy, doc?.createdBy),
    currency,
    amount: Math.round(receipt.amount * 100) / 100,
    date: shortDay(storedDay(receipt.receivedAt)),
    method: methodNice,
    reference: receipt.reference ?? null,
    into,
    bankLine,
    rate: receipt.exchangeRate && receipt.exchangeRate !== 1 ? String(receipt.exchangeRate) : "1.00",
    madeBy: `${receipt.createdBy?.name ?? doc?.createdBy?.name ?? "Someone in the workspace"}, ${shortDay(dayOf(receipt.createdAt))}`,
    invoice: invoiceView,
    deal: doc?.deal ? (doc.deal.wonAt ? `${doc.deal.dealNo}, won ${shortDay(dayOf(doc.deal.wonAt))}` : `${doc.deal.dealNo} · ${doc.deal.title}`) : null,
    dealId: doc?.deal?.id ?? null,
    lead: doc?.lead ? `${doc.lead.leadNo} · ${doc.lead.title}` : null,
    leadId: doc?.lead?.id ?? null,
    voided: receipt.voidedAt
      ? {
          reason: receipt.voidReason ?? null,
          by: receipt.voidedBy?.name ?? null,
          on: shortDay(dayOf(receipt.voidedAt)),
        }
      : null,
    posting: postingRows(entries),
    entries: entries.length,
    history: historyOf(historyItems),
  };
}
