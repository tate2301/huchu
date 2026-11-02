import type { PrismaClient, QuotationStatus } from "@prisma/client";

import type { EnsuredCrmDocument } from "@/lib/books/crm-document-bridge";
import { docLabel } from "@/lib/books/doc-number";

import { customerFace, customerImage } from "./faces";
import { dayOf, daysBetween, money, shortDay, storedDay } from "./format";
import { madeByLine, type InvoiceLineView } from "./invoice-record";
import { INVOICE_STATE_LABEL, invoiceState } from "./invoice-state";
import type { QuoteTab } from "./quotes-view";
import { facesOf, historyOf, historyWhen, type Faces, type HistoryItem } from "./record-view";

export type QuoteRecord = {
  id: string;
  number: string;
  status: QuotationStatus;
  stateLabel: string;
  state: { key: QuoteTab; label: string };
  madeByVane: boolean;
  waiting: boolean;
  cardId: string | null;
  customer: { id: string; name: string; contact?: string | null; image?: string | null };
  faces?: Faces;
  currency: string;
  date: string;
  validUntil: string;
  expiredDays: number;
  rate: string;
  lines: InvoiceLineView[];
  subTotal: number;
  taxTotal: number;
  total: number;
  taxLabel: string;
  notes: string | null;
  madeBy: string;
  issuedBy: string | null;
  deal: string | null;
  dealId: string | null;
  lead: string | null;
  leadId: string | null;
  version: number;
  revisionNote: string | null;
  supersedes: { id: string; number: string; version: number } | null;
  supersededBy: { id: string; number: string; version: number } | null;
  invoices: Array<{
    id: string;
    number: string;
    date: string;
    status: string;
    stateKey: "draft" | "sent" | "part-paid" | "paid" | "overdue" | "void";
    stateLabel: string;
    total: number;
    balance: number;
  }>;
  voided: { reason: string | null; by: string | null; on: string } | null;
  history: HistoryItem[];
};

export type QuoteRecordPage = QuoteRecord & {
  can: {
    issue: boolean;
    convert: boolean;
  };
  crmDocument?: EnsuredCrmDocument | null;
};

const QUOTE_STATE_FROM_STATUS: Record<QuotationStatus, { key: QuoteTab; label: string }> = {
  DRAFT: { key: "draft", label: "Draft" },
  SENT: { key: "sent", label: "Sent" },
  ACCEPTED: { key: "accepted", label: "Accepted" },
  EXPIRED: { key: "expired", label: "Expired" },
  VOIDED: { key: "void", label: "Void" },
};

export async function readQuoteRecord(
  db: PrismaClient,
  companyId: string,
  id: string,
  now = new Date(),
): Promise<QuoteRecord | null> {
  const quote = await db.salesQuotation.findFirst({
    where: {
      companyId,
      OR: [{ id }, { crmLeadDocuments: { some: { id } } }],
    },
    select: {
      id: true,
      quotationNumber: true,
      quotationDate: true,
      validUntil: true,
      status: true,
      currency: true,
      exchangeRate: true,
      subTotal: true,
      taxTotal: true,
      total: true,
      notes: true,
      madeByVane: true,
      createdById: true,
      createdAt: true,
      issuedAt: true,
      customer: { select: { id: true, name: true, contactName: true, ...customerFace } },
      createdBy: { select: { name: true, image: true } },
      issuedBy: { select: { name: true, image: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true, taxRate: true },
      },
      invoicesRaised: {
        orderBy: { invoiceDate: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          status: true,
          total: true,
          amountPaid: true,
          creditTotal: true,
          writeOffTotal: true,
          receipts: { where: { voidedAt: null }, select: { receivedAt: true, method: true }, orderBy: { receivedAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!quote) return null;

  const [doc, card, voidEvent] = await Promise.all([
    db.crmLeadDocument.findFirst({
      where: { companyId, quotationId: quote.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        version: true,
        revisionNote: true,
        createdAt: true,
        createdBy: { select: { name: true, image: true } },
        deal: { select: { id: true, dealNo: true, title: true, wonAt: true } },
        lead: { select: { id: true, leadNo: true, title: true } },
        approval: {
          select: {
            status: true,
            createdAt: true,
            firstViewedAt: true,
            respondedAt: true,
            responderName: true,
            responseNote: true,
          },
        },
        supersedes: {
          select: {
            version: true,
            quotation: { select: { id: true, quotationNumber: true } },
          },
        },
        supersededBy: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            version: true,
            quotation: { select: { id: true, quotationNumber: true } },
          },
        },
      },
    }),
    quote.madeByVane
      ? db.vaneItem.findFirst({
          where: { companyId, subjectType: "SalesQuotation", subjectId: quote.id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
      : null,
    quote.status === "VOIDED"
      ? db.platformAuditEvent.findFirst({
          where: { companyId, eventType: "books.quote.voided", entityType: "SalesQuotation", entityId: quote.id },
          orderBy: { createdAt: "desc" },
          select: { reason: true, actor: true, createdAt: true },
        })
      : null,
  ]);

  const voider = voidEvent?.actor
    ? await db.user.findFirst({ where: { id: voidEvent.actor, companyId }, select: { name: true, image: true } })
    : null;

  const today = dayOf(now);
  const draft = quote.status === "DRAFT";
  const dated = storedDay(quote.quotationDate);
  const validDay = quote.validUntil ? storedDay(quote.validUntil) : null;
  const expiredDays = validDay && validDay < today && quote.status === "SENT" ? Math.max(0, daysBetween(validDay, today)) : 0;

  const state =
    expiredDays > 0
      ? { key: "expired" as const, label: "Expired" }
      : QUOTE_STATE_FROM_STATUS[quote.status];

  const validUntil = !validDay
    ? "No expiry"
    : draft
      ? `${Math.max(0, daysBetween(dated, validDay))} days after issue`
      : shortDay(validDay);

  const rates = [...new Set(quote.lines.map((line) => line.taxRate))];
  const taxLabel = rates.length === 1 && rates[0]! > 0 ? `VAT ${rates[0]}%` : "VAT";

  const invoices = quote.invoicesRaised.map((inv) => {
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
    return {
      id: inv.id,
      number: docLabel(inv.invoiceNumber),
      date: shortDay(storedDay(inv.invoiceDate)),
      status: inv.status,
      stateKey: invState.state,
      stateLabel: INVOICE_STATE_LABEL[invState.state],
      total: inv.total,
      balance: invState.balance,
    };
  });

  const historyItems: Array<HistoryItem & { at: Date }> = [
    {
      tone: "",
      text: quote.madeByVane
        ? `Vane drafted ${quote.quotationNumber} for ${quote.customer.name}.`
        : `${quote.createdBy?.name ?? "Someone"} wrote ${quote.quotationNumber} for ${quote.customer.name}.`,
      when: historyWhen(quote.createdAt, now),
      at: quote.createdAt,
    },
  ];
  if (quote.issuedAt && (!quote.madeByVane || quote.issuedAt.getTime() > quote.createdAt.getTime() + 1000)) {
    historyItems.push({
      tone: "in",
      text: `${quote.issuedBy?.name ?? quote.createdBy?.name ?? "Someone"} issued ${quote.quotationNumber}.`,
      when: historyWhen(quote.issuedAt, now),
      at: quote.issuedAt,
    });
  }
  if (doc?.approval?.createdAt) {
    historyItems.push({
      tone: "in",
      text: "Approval link issued.",
      when: historyWhen(doc.approval.createdAt, now),
      at: doc.approval.createdAt,
    });
  }
  if (doc?.approval?.firstViewedAt) {
    historyItems.push({
      tone: "in",
      text: `${quote.customer.name} opened the approval link.`,
      when: historyWhen(doc.approval.firstViewedAt, now),
      at: doc.approval.firstViewedAt,
    });
  }
  if (doc?.approval?.respondedAt && (doc.approval.status === "APPROVED" || doc.approval.status === "DECLINED")) {
    const who = doc.approval.responderName || quote.customer.name;
    historyItems.push({
      tone: doc.approval.status === "APPROVED" ? "ok" : "wa",
      text:
        doc.approval.status === "APPROVED"
          ? `${who} accepted ${quote.quotationNumber}${doc.approval.responseNote ? `: "${doc.approval.responseNote}"` : "."}`
          : `${who} asked for changes on ${quote.quotationNumber}${doc.approval.responseNote ? `: "${doc.approval.responseNote}"` : "."}`,
      when: historyWhen(doc.approval.respondedAt, now),
      at: doc.approval.respondedAt,
    });
  }
  for (const inv of quote.invoicesRaised) {
    historyItems.push({
      tone: "ok",
      text: `Made into invoice ${docLabel(inv.invoiceNumber)} (${money(inv.total, quote.currency)}).`,
      when: historyWhen(inv.invoiceDate, now),
      at: inv.invoiceDate,
    });
  }
  if (voidEvent) {
    historyItems.push({
      tone: "wa",
      text: `${voider?.name ?? "Someone"} voided ${quote.quotationNumber}${voidEvent.reason ? `: ${voidEvent.reason}` : "."}`,
      when: historyWhen(voidEvent.createdAt, now),
      at: voidEvent.createdAt,
    });
  }

  return {
    id: quote.id,
    number: quote.quotationNumber,
    status: quote.status,
    stateLabel: quote.madeByVane && draft ? "Vane's draft" : state.label,
    state,
    madeByVane: quote.madeByVane,
    waiting: draft && quote.madeByVane && !quote.createdById,
    cardId: card?.id ?? null,
    customer: {
      id: quote.customer.id,
      name: quote.customer.name,
      contact: quote.customer.contactName ?? null,
      image: customerImage(quote.customer),
    },
    faces: facesOf(quote.createdBy, quote.issuedBy, voider, doc?.createdBy),
    currency: quote.currency,
    date: draft ? "On issue" : shortDay(dated),
    validUntil,
    expiredDays,
    rate: quote.exchangeRate && quote.exchangeRate !== 1 ? String(quote.exchangeRate) : "1.00",
    lines: quote.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.lineTotal,
    })),
    subTotal: quote.subTotal,
    taxTotal: quote.taxTotal,
    total: quote.total,
    taxLabel,
    notes: quote.notes ?? null,
    madeBy: madeByLine({
      madeByVane: quote.madeByVane,
      createdBy: quote.createdBy?.name ?? doc?.createdBy?.name ?? null,
      createdAt: quote.createdAt,
    }),
    issuedBy: quote.issuedAt ? `${quote.issuedBy?.name ?? quote.createdBy?.name ?? "Someone"}, ${shortDay(dayOf(quote.issuedAt))}` : null,
    deal: doc?.deal ? (doc.deal.wonAt ? `${doc.deal.dealNo}, won ${shortDay(dayOf(doc.deal.wonAt))}` : `${doc.deal.dealNo} · ${doc.deal.title}`) : null,
    dealId: doc?.deal?.id ?? null,
    lead: doc?.lead ? `${doc.lead.leadNo} · ${doc.lead.title}` : null,
    leadId: doc?.lead?.id ?? null,
    version: doc?.version ?? 1,
    revisionNote: doc?.revisionNote ?? null,
    supersedes: doc?.supersedes?.quotation
      ? { id: doc.supersedes.quotation.id, number: doc.supersedes.quotation.quotationNumber, version: doc.supersedes.version }
      : null,
    supersededBy: doc?.supersededBy[0]?.quotation
      ? { id: doc.supersededBy[0].quotation.id, number: doc.supersededBy[0].quotation.quotationNumber, version: doc.supersededBy[0].version }
      : null,
    invoices,
    voided:
      quote.status === "VOIDED"
        ? {
            reason: voidEvent?.reason ?? null,
            by: voider?.name ?? null,
            on: voidEvent ? shortDay(dayOf(voidEvent.createdAt)) : "",
          }
        : null,
    history: historyOf(historyItems),
  };
}
