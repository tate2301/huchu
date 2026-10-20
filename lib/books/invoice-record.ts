import type { InvoiceStatus, PrismaClient } from "@prisma/client";
import { docLabel } from "@/lib/books/doc-number";

import { customerFace, customerImage } from "./faces";
import { daysBetween, dayOf, money, shortDay, storedDay, weekdayDay } from "./format";
import { facesOf, type Faces } from "./record-view";
import { INVOICE_STATE_LABEL, invoiceState, type InvoiceState } from "./invoice-state";
import type { InvoiceBoardExtras } from "./invoice-board-view";
import type { InvoiceRemoval } from "./reversal";
import { wasFiscalised } from "./reversal";
import { usualTerms } from "@/lib/vane/drafts";

/**
 * One invoice in Books (the PageVaneDraft board): its lines and totals, who
 * made it, the quote it came from and what changed since that quote. A draft
 * Vane made says so, and is issued or deleted from here: issued only as the
 * person's own (`asMine`, `lib/vane/drafts.ts`) while nobody has taken it on.
 */

export type InvoiceLineView = { id: string; description: string; quantity: number; unitPrice: number; amount: number; /** "V15.5". */ tax: string | null };

export type InvoiceRecord = {
  id: string;
  number: string;
  status: InvoiceStatus;
  stateLabel: string;
  /** Where it stands in Invoices' words (Draft, Sent, Overdue…), for the aside's pill. */
  state: { key: InvoiceState; label: string };
  madeByVane: boolean;
  /** Vane's draft that no person has taken on yet: it is issued only as theirs (`asMine`). */
  waiting: boolean;
  /** Vane's card about it, for What I read. */
  cardId: string | null;
  /** contact: the person there, for the phone's header line ("Chisipite Dental · Mrs L. Banda"). */
  customer: { id: string; name: string; contact?: string | null; image?: string | null; code?: string | null; vat?: string | null; tin?: string | null };
  /** The people it names (who made, issued or voided it), with their photos. */
  faces?: Faces;
  /** Days past its due day while it is owed; 0 otherwise. */
  daysOverdue: number;
  currency: string;
  /** "On issue" for a draft, else the day it is dated. */
  date: string;
  /** "21 days after you issue it", "4 November", or "No due date". */
  due: string;
  /** The facts' Issued: "Thu 10 Sep 2026", null on a draft. */
  issuedOn: string | null;
  /** The facts' Due: "Thu 24 Sep, 14 days", null without one. */
  dueOn: string | null;
  /** The aside's Due: "21 days, their usual" on a draft, else as `due`. */
  dueTerms: string;
  lines: InvoiceLineView[];
  subTotal: number;
  taxTotal: number;
  total: number;
  balance: number;
  /** "VAT 15.5%" when the lines share one rate, "VAT" when they do not. */
  taxLabel: string;
  /** The headline: "$6,400.18 to Borrowdale Brooke Clinic, due 21 days after you issue it." */
  fact: string;
  /** What is behind it, in grey: the quote it matches or how it differs. */
  rest: string | null;
  madeBy: string;
  /** "James Banda, 14 Oct" once issued. */
  issuedBy: string | null;
  quote: { id: string; number: string; accepted: string | null } | null;
  /** The deal the quote won, when the CRM has one: "DL-0396, won 7 Oct". */
  deal: string | null;
  /** Each way the lines differ from the quote's: "Coved skirting: 64 m, not 60". Empty when they are as accepted. */
  changes: string[];
  /** Its lines as Reverse credits them: price, VAT rate and how many. */
  creditable: Array<{ id: string; description: string; quantity: number; unitPrice: number; taxRate: number; taxCodeId: string | null }>;
  /** What was paid on it. */
  paid: number;
  /** What is left to credit: its total less what was credited or written off. */
  creditLeft: number;
  /** Its credit notes: "CN-20261016-0912-431", $120.00, why. */
  credits: Array<{ number: string; total: number; reason: string | null; date: string; voided: boolean }>;
  /** Why and by whom it was voided, from the audit log, once it is void. */
  voided: { reason: string | null; by: string | null; on: string } | null;
  /** The CRM's document for it, when it was raised from a deal: emailing it and logging a chase go through the deal. */
  crm: { documentId: string; dealId: string | null } | null;
  /** The invoice that replaced it, once it was revised ("Replaced by INV-0143"). */
  replacedBy: { id: string; number: string } | null;
  /** It reached the fiscal device, which still holds it whatever is reversed here. */
  fiscalised: boolean;
  /** Once void: the payments it left as the customer's money on account, each of which the owner may void too. */
  onAccount: Array<{ id: string; number: string; amount: number; voided: boolean }>;
};

/** What the person may do with it on its page (the route adds it). */
export type InvoiceRecordPage = InvoiceRecord & {
  can: {
    issue: boolean;
    delete: boolean;
    reverse: boolean;
    voidPayments: boolean;
    /** Issue a credit note against it, and write off what is left (books-final §5.1). */
    credit?: boolean;
    writeOff?: boolean;
    /** Record a payment on it. */
    pay?: boolean;
  };
  /** What Delete takes with it, when this person may delete it. */
  removal: InvoiceRemoval | null;
  /** What BkInvoice draws beyond the invoice: payments, posting, history, fiscal. */
  board?: InvoiceBoardExtras | null;
};

/** The aside's Due on a draft: its terms, and whether they are the customer's usual. */
export function dueTerms(days: number, usual: number | null): string {
  return `${days} ${days === 1 ? "day" : "days"}${usual === days ? ", their usual" : ""}`;
}

/** Who made it: a person, Vane at a time, or Vane's draft a person took on. */
export function madeByLine(row: { madeByVane: boolean; createdBy: string | null; createdAt: Date }): string {
  if (!row.madeByVane) return row.createdBy ?? "Someone in the workspace";
  if (row.createdBy) return `Vane, taken on by ${row.createdBy}`;
  const time = row.createdAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Harare" });
  return `Vane, ${time} on ${shortDay(dayOf(row.createdAt))}`;
}

const round = (n: number) => Math.round(n * 100) / 100;
/** "Thu 10 Sep 2026". */
const longDate = (day: string) => `${weekdayDay(day)} ${day.slice(0, 4)}`;
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ""));

type Line = { description: string; quantity: number; unitPrice: number };

/** How an invoice's lines differ from its quote's, matched by description. */
export function changesFromQuote(invoice: Line[], quote: Line[], currency: string): string[] {
  const key = (line: Line) => line.description.trim().toLowerCase();
  const quoted = new Map(quote.map((line) => [key(line), line]));
  const changes: string[] = [];
  for (const line of invoice) {
    const was = quoted.get(key(line));
    quoted.delete(key(line));
    if (!was) {
      changes.push(`${line.description}: added`);
      continue;
    }
    if (Math.abs(was.quantity - line.quantity) > 1e-6) changes.push(`${line.description}: ${qty(line.quantity)}, not ${qty(was.quantity)}`);
    if (Math.abs(was.unitPrice - line.unitPrice) > 0.005) changes.push(`${line.description}: ${money(line.unitPrice, currency)}, not ${money(was.unitPrice, currency)}`);
  }
  for (const line of quoted.values()) changes.push(`${line.description}: left out`);
  return changes;
}

export async function readInvoiceRecord(db: Pick<PrismaClient, "salesInvoice" | "salesReceipt" | "crmLeadDocument" | "vaneItem" | "platformAuditEvent" | "user">, companyId: string, id: string, now = new Date()): Promise<InvoiceRecord | null> {
  const invoice = await db.salesInvoice.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      status: true,
      currency: true,
      subTotal: true,
      taxTotal: true,
      total: true,
      amountPaid: true,
      creditTotal: true,
      writeOffTotal: true,
      madeByVane: true,
      createdById: true,
      createdAt: true,
      issuedAt: true,
      quotationId: true,
      supersededBy: { select: { id: true, invoiceNumber: true }, orderBy: { createdAt: "asc" }, take: 1 },
      crmLeadDocuments: { select: { id: true, dealId: true }, orderBy: { createdAt: "desc" }, take: 1 },
      customer: { select: { id: true, name: true, contactName: true, code: true, vatNumber: true, taxNumber: true, ...customerFace } },
      createdBy: { select: { name: true, image: true } },
      issuedBy: { select: { name: true, image: true } },
      lines: { orderBy: { createdAt: "asc" }, select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true, taxRate: true, taxCodeId: true, taxCode: { select: { code: true } } } },
      creditNotes: { orderBy: { noteDate: "asc" }, select: { noteNumber: true, total: true, reason: true, noteDate: true, status: true } },
      fiscalReceipt: { select: { status: true, receiptGlobalNo: true } },
      receipts: { where: { voidedAt: null }, select: { receivedAt: true, method: true }, orderBy: { receivedAt: "desc" }, take: 1 },
      fromQuotation: {
        select: {
          id: true,
          quotationNumber: true,
          status: true,
          updatedAt: true,
          total: true,
          lines: { orderBy: { createdAt: "asc" }, select: { description: true, quantity: true, unitPrice: true } },
        },
      },
    },
  });
  if (!invoice) return null;

  const [doc, past, card, voidEvent] = await Promise.all([
    invoice.quotationId
      ? db.crmLeadDocument.findFirst({
          where: { companyId, quotationId: invoice.quotationId, type: "QUOTATION" },
          select: { approval: { select: { status: true, respondedAt: true } }, deal: { select: { dealNo: true, wonAt: true } } },
        })
      : null,
    db.salesInvoice.findMany({
      where: { companyId, customerId: invoice.customer.id, status: { in: ["ISSUED", "PAID"] }, dueDate: { not: null }, id: { not: invoice.id } },
      orderBy: { invoiceDate: "desc" },
      take: 20,
      select: { invoiceDate: true, dueDate: true },
    }),
    invoice.madeByVane
      ? db.vaneItem.findFirst({ where: { companyId, subjectType: "SalesInvoice", subjectId: invoice.id }, orderBy: { createdAt: "desc" }, select: { id: true } })
      : null,
    invoice.status === "VOIDED"
      ? db.platformAuditEvent.findFirst({
          where: { companyId, eventType: "books.invoice.voided", entityType: "SalesInvoice", entityId: invoice.id },
          orderBy: { createdAt: "desc" },
          select: { reason: true, actor: true, createdAt: true, payloadJson: true },
        })
      : null,
  ]);
  const voider = voidEvent?.actor ? await db.user.findFirst({ where: { id: voidEvent.actor, companyId }, select: { name: true, image: true } }) : null;
  const onAccount = await paymentsOnAccount(db, companyId, voidEvent?.payloadJson ?? null);

  const today = dayOf(now);
  const state = invoiceState(
    {
      status: invoice.status,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      creditTotal: invoice.creditTotal,
      writeOffTotal: invoice.writeOffTotal,
      lastReceipt: invoice.receipts[0] ?? null,
    },
    today,
  );
  const draft = invoice.status === "DRAFT";
  const dated = storedDay(invoice.invoiceDate);
  const dueDay = invoice.dueDate ? storedDay(invoice.dueDate) : null;
  // A draft is dated when it is issued, so its due date reads as the terms it carries.
  const due = !dueDay ? "No due date" : draft ? `${Math.max(0, daysBetween(dated, dueDay))} days after you issue it` : shortDay(dueDay);
  const quote = invoice.fromQuotation;
  const changes = quote ? changesFromQuote(invoice.lines, quote.lines, invoice.currency) : [];
  const amount = money(invoice.total, invoice.currency);
  const terms = dueDay ? Math.max(0, daysBetween(dated, dueDay)) : null;
  const rates = [...new Set(invoice.lines.map((line) => line.taxRate))];
  // The customer's answer on the quote's approval link dates its acceptance; else the quote's last change.
  const acceptedOn = doc?.approval?.status === "APPROVED" && doc.approval.respondedAt ? doc.approval.respondedAt : quote?.status === "ACCEPTED" ? quote.updatedAt : null;

  const rest = !quote
    ? null
    : Math.abs(quote.total - invoice.total) > 0.005
      ? `The accepted quote said ${money(quote.total, invoice.currency)}; ${changes.length ? `${changes.length} ${changes.length === 1 ? "line differs" : "lines differ"}` : `rounding on the lines makes ${money(Math.abs(round(invoice.total - quote.total)), invoice.currency)} ${invoice.total > quote.total ? "more" : "less"}`}.`
      : `As ${quote.quotationNumber} was accepted.`;

  return {
    id: invoice.id,
    number: docLabel(invoice.invoiceNumber),
    status: invoice.status,
    stateLabel: invoice.madeByVane && draft ? "Vane's draft" : INVOICE_STATE_LABEL[state.state],
    state: { key: state.state, label: INVOICE_STATE_LABEL[state.state] },
    madeByVane: invoice.madeByVane,
    waiting: draft && invoice.madeByVane && !invoice.createdById,
    cardId: card?.id ?? null,
    customer: {
      id: invoice.customer.id,
      name: invoice.customer.name,
      contact: invoice.customer.contactName ?? null,
      image: customerImage(invoice.customer),
      code: invoice.customer.code ?? null,
      vat: invoice.customer.vatNumber ?? null,
      tin: invoice.customer.taxNumber ?? null,
    },
    faces: facesOf(invoice.createdBy, invoice.issuedBy, voider),
    daysOverdue: state.daysOverdue,
    currency: invoice.currency,
    date: draft ? "On issue" : shortDay(dated),
    due,
    issuedOn: draft ? null : longDate(dated),
    dueOn: dueDay ? `${weekdayDay(dueDay)}${terms !== null ? `, ${terms} ${terms === 1 ? "day" : "days"}` : ""}` : null,
    // The aside's Terms: "14 days" (their usual marked on a draft), from its date to its due day.
    dueTerms: terms === null ? due : draft ? dueTerms(terms, usualTerms(past)) : `${terms} ${terms === 1 ? "day" : "days"}`,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.lineTotal,
      tax: line.taxCode?.code ?? (line.taxRate > 0 ? `${line.taxRate}%` : null),
    })),
    subTotal: invoice.subTotal,
    taxTotal: invoice.taxTotal,
    total: invoice.total,
    balance: state.balance,
    taxLabel: rates.length === 1 && rates[0]! > 0 ? `VAT ${rates[0]}%` : "VAT",
    fact: draft
      ? `${amount} to ${invoice.customer.name}, ${dueDay ? `due ${due}` : "with no due date yet"}.`
      : `${amount} to ${invoice.customer.name}${state.balance > 0.005 ? `, ${money(state.balance, invoice.currency)} still owed` : ""}.`,
    rest,
    madeBy: madeByLine({ madeByVane: invoice.madeByVane, createdBy: invoice.createdBy?.name ?? null, createdAt: invoice.createdAt }),
    issuedBy: invoice.issuedAt ? `${invoice.issuedBy?.name ?? "Someone"}, ${shortDay(dayOf(invoice.issuedAt))}` : null,
    quote: quote ? { id: quote.id, number: quote.quotationNumber, accepted: acceptedOn ? shortDay(dayOf(acceptedOn)) : null } : null,
    deal: doc?.deal ? (doc.deal.wonAt ? `${doc.deal.dealNo}, won ${shortDay(dayOf(doc.deal.wonAt))}` : doc.deal.dealNo) : null,
    changes,
    creditable: invoice.lines.map((line) => ({ id: line.id, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate, taxCodeId: line.taxCodeId })),
    paid: round(invoice.amountPaid),
    creditLeft: round(invoice.total - invoice.creditTotal - invoice.writeOffTotal),
    credits: invoice.creditNotes.map((note) => ({ number: docLabel(note.noteNumber, "credit note"), total: note.total, reason: note.reason, date: shortDay(dayOf(note.noteDate)), voided: note.status === "VOIDED" })),
    voided: invoice.status === "VOIDED" ? { reason: voidEvent?.reason ?? null, by: voider?.name ?? null, on: voidEvent ? shortDay(dayOf(voidEvent.createdAt)) : "" } : null,
    crm: invoice.crmLeadDocuments[0] ? { documentId: invoice.crmLeadDocuments[0].id, dealId: invoice.crmLeadDocuments[0].dealId } : null,
    replacedBy: invoice.supersededBy[0] ? { id: invoice.supersededBy[0].id, number: docLabel(invoice.supersededBy[0].invoiceNumber) } : null,
    fiscalised: wasFiscalised(invoice.fiscalReceipt),
    onAccount,
  };
}

/** The payments a void invoice left as the customer's money on account, as they stand now (its void's audit event names them). */
async function paymentsOnAccount(db: Pick<PrismaClient, "salesReceipt">, companyId: string, payloadJson: string | null): Promise<InvoiceRecord["onAccount"]> {
  if (!payloadJson) return [];
  let ids: string[] = [];
  try {
    const payload = JSON.parse(payloadJson) as { receiptsOnAccount?: Array<{ id?: string }> };
    ids = (payload.receiptsOnAccount ?? []).map((receipt) => receipt.id).filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
  if (ids.length === 0) return [];
  const receipts = await db.salesReceipt.findMany({
    where: { companyId, id: { in: ids }, invoiceId: null },
    orderBy: { receivedAt: "asc" },
    select: { id: true, receiptNumber: true, amount: true, voidedAt: true },
  });
  return receipts.map((receipt) => ({ id: receipt.id, number: receipt.receiptNumber, amount: round(receipt.amount), voided: receipt.voidedAt !== null }));
}
