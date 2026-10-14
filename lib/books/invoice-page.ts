import type { InvoiceStatus } from "@prisma/client";

import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes";
import { prisma } from "@/lib/prisma";
import { daysBetween, usualTerms, waitsForAPerson } from "@/lib/vane/drafts";

import { money } from "./format";

/**
 * One invoice in Books (`/books/invoices/[id]`), and Vane's draft invoice
 * (the PageVaneDraft board): its lines and totals, who it is to and what it
 * is for, and, for Vane's draft, what it was made from, what changed since
 * the quote and whether a person has taken it on. Pure shaping below the
 * read (`shapeInvoicePage`), tested.
 */

export type InvoicePageLine = { id: string; description: string; quantity: number; unitPrice: number; amount: number };

export type InvoicePage = {
  id: string;
  number: string;
  status: "draft" | "issued" | "paid" | "void";
  statusLabel: string;
  currency: string;
  customer: { id: string; name: string };
  lines: InvoicePageLine[];
  subTotal: number;
  taxTotal: number;
  total: number;
  /** "VAT 15.5%" when the lines share one rate, "VAT" when they do not. */
  taxLabel: string;
  /** The finding's two tones: the fact, then the grey rest. */
  finding: { fact: string; rest: string | null };
  /** The attributes beside it, as the board lists them. */
  attrs: Array<{ term: string; value: string; tone?: "warn" | "ok" | "bad" | "plain" }>;
  /** What changed since the accepted quote, line by line; empty when nothing did. Null when it was not made from a quote. */
  changes: Array<{ term: string; value: string }> | null;
  vane: null | {
    /** Vane's draft that no person has taken on yet: it can only be issued as theirs. */
    waiting: boolean;
    /** "Made from QT-0398, accepted on 7 October." */
    madeFrom: string | null;
    /** Vane's card about it, for What I read. */
    cardId: string | null;
  };
  /** What this person may do with it here. */
  can: { issue: boolean; discard: boolean };
  /** Why Delete the draft is not theirs to press, when it is not. */
  discardRefusal: string | null;
};

type Row = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  currency: string;
  invoiceDate: Date;
  dueDate: Date | null;
  subTotal: number;
  taxTotal: number;
  total: number;
  madeByVane: boolean;
  createdById: string | null;
  createdAt: Date;
  issuedAt: Date | null;
  customer: { id: string; name: string };
  createdBy: { name: string } | null;
  issuedBy: { name: string } | null;
  lines: Array<{ id: string; description: string; quantity: number; unitPrice: number; taxRate: number }>;
  fromQuotation: null | {
    quotationNumber: string;
    total: number;
    lines: Array<{ description: string; quantity: number; unitPrice: number }>;
  };
};

export type InvoicePageFacts = {
  row: Row;
  /** When the customer accepted the quote it was made from, when the app knows. */
  acceptedAt: Date | null;
  deal: { dealNo: string; wonAt: Date | null } | null;
  usualTermsDays: number | null;
  cardId: string | null;
  timeZone: string;
  can: { issue: boolean; discard: boolean };
};

const STATUS: Record<InvoiceStatus, { status: InvoicePage["status"]; label: string; tone: "warn" | "ok" | "bad" | "plain" }> = {
  DRAFT: { status: "draft", label: "Draft", tone: "warn" },
  ISSUED: { status: "issued", label: "Issued", tone: "plain" },
  PAID: { status: "paid", label: "Paid", tone: "ok" },
  VOIDED: { status: "void", label: "Cancelled", tone: "bad" },
};

const dayMonth = (date: Date, timeZone: string, month: "long" | "short" = "long") =>
  date.toLocaleDateString("en-GB", { day: "numeric", month, timeZone });
const clock = (date: Date, timeZone: string) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
const quantity = (value: number) => (Number.isInteger(value) ? String(value) : value.toLocaleString("en-GB", { maximumFractionDigits: 2 }));
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const cents = (value: number) => Math.round(value * 100);

/** "18 cents", "$1.20". */
function difference(amount: number, currency: string): string {
  const value = Math.abs(amount);
  return value < 1 ? plural(Math.round(value * 100), "cent", "cents") : money(value, currency);
}

/** Each line the quote had and the invoice changed, dropped or added, by its description. */
export function changesSinceQuote(
  quote: Array<{ description: string; quantity: number; unitPrice: number }>,
  invoice: Array<{ description: string; quantity: number; unitPrice: number }>,
  currency: string,
): Array<{ term: string; value: string }> {
  const changes: Array<{ term: string; value: string }> = [];
  const left = [...invoice];
  for (const line of quote) {
    const at = left.findIndex((candidate) => candidate.description === line.description);
    if (at < 0) {
      changes.push({ term: line.description, value: "On the quote, not here" });
      continue;
    }
    const [now] = left.splice(at, 1);
    if (now!.quantity !== line.quantity) changes.push({ term: line.description, value: `${quantity(line.quantity)} on the quote, ${quantity(now!.quantity)} here` });
    else if (cents(now!.unitPrice) !== cents(line.unitPrice)) {
      changes.push({ term: line.description, value: `${money(line.unitPrice, currency)} on the quote, ${money(now!.unitPrice, currency)} here` });
    }
  }
  for (const line of left) changes.push({ term: line.description, value: "Added since the quote" });
  return changes;
}

export function shapeInvoicePage(facts: InvoicePageFacts): InvoicePage {
  const { row, timeZone } = facts;
  const state = STATUS[row.status];
  const vaneDraft = row.madeByVane;
  const waiting = waitsForAPerson(row) && row.status === "DRAFT";
  const terms = row.dueDate ? Math.max(0, daysBetween(row.invoiceDate, row.dueDate)) : null;
  const rates = [...new Set(row.lines.map((line) => line.taxRate))];
  const taxLabel = rates.length === 1 && rates[0]! > 0 ? `VAT ${rates[0]}%` : "VAT";

  const lines = row.lines.map<InvoicePageLine>((line) => ({
    id: line.id,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    amount: line.quantity * line.unitPrice,
  }));

  // The finding: what it comes to, to whom, and when it falls due.
  const due =
    row.status === "DRAFT"
      ? terms === null
        ? "with no due date yet"
        : `due ${plural(terms, "day", "days")} after you issue it`
      : row.dueDate
        ? `due on ${dayMonth(row.dueDate, timeZone)}`
        : "with no due date";
  const fact = `${money(row.total, row.currency)} to ${row.customer.name}, ${due}.`;
  let rest: string | null = null;
  const quote = row.fromQuotation;
  if (quote) {
    const gap = row.total - quote.total;
    if (cents(gap) === 0) rest = `The same as the accepted quote, ${money(quote.total, row.currency)}.`;
    else {
      const sameLines = changesSinceQuote(quote.lines, row.lines, row.currency).length === 0;
      const why = sameLines
        ? `VAT worked out on each of its ${plural(row.lines.length, "line", "lines")} ${gap > 0 ? "adds" : "takes off"} ${difference(gap, row.currency)}`
        : `the changed lines ${gap > 0 ? "add" : "take off"} ${difference(gap, row.currency)}`;
      rest = `The accepted quote said ${money(quote.total, row.currency)}; ${why}.`;
    }
  }

  const attrs: InvoicePage["attrs"] = [{ term: "Customer", value: row.customer.name }];
  if (facts.deal) {
    attrs.push({ term: "For", value: facts.deal.wonAt ? `${facts.deal.dealNo}, won ${dayMonth(facts.deal.wonAt, timeZone, "short")}` : facts.deal.dealNo });
  } else if (quote) {
    attrs.push({ term: "For", value: quote.quotationNumber });
  }
  attrs.push({ term: "Date", value: row.status === "DRAFT" && vaneDraft ? "On issue" : dayMonth(row.invoiceDate, timeZone) });
  attrs.push({
    term: "Due",
    value:
      terms === null
        ? "No due date"
        : row.status === "DRAFT"
          ? `${plural(terms, "day", "days")}${facts.usualTermsDays === terms ? ", their usual" : ""}`
          : dayMonth(row.dueDate!, timeZone),
  });
  attrs.push({ term: "Status", value: state.label, tone: state.tone });
  attrs.push({
    term: "Made by",
    value: vaneDraft
      ? row.createdBy
        ? `Vane, taken on by ${row.createdBy.name}`
        : `Vane, ${clock(row.createdAt, timeZone)}`
      : (row.createdBy?.name ?? "Unknown"),
  });
  if (row.issuedBy && row.issuedAt) attrs.push({ term: "Issued by", value: `${row.issuedBy.name}, ${dayMonth(row.issuedAt, timeZone, "short")}` });

  const accepted = facts.acceptedAt ? `, accepted on ${dayMonth(facts.acceptedAt, timeZone)}` : ", accepted";
  return {
    id: row.id,
    number: row.invoiceNumber,
    status: state.status,
    statusLabel: state.label,
    currency: row.currency,
    customer: row.customer,
    lines,
    subTotal: row.subTotal,
    taxTotal: row.taxTotal,
    total: row.total,
    taxLabel,
    finding: { fact, rest },
    attrs,
    changes: quote ? changesSinceQuote(quote.lines, row.lines, row.currency) : null,
    vane: vaneDraft ? { waiting, madeFrom: quote ? `Made from ${quote.quotationNumber}${accepted}.` : null, cardId: facts.cardId } : null,
    can: { issue: facts.can.issue && row.status === "DRAFT", discard: facts.can.discard && row.status === "DRAFT" },
    discardRefusal: row.status === "DRAFT" && !facts.can.discard ? "Only a superadmin can cancel an invoice." : null,
  };
}

/** One invoice for a person in its workspace, or null when it is not one of theirs. */
export async function invoicePage(
  who: { companyId: string; role: string; timeZone?: string },
  id: string,
): Promise<InvoicePage | null> {
  const row = await prisma.salesInvoice.findFirst({
    where: { id, companyId: who.companyId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      currency: true,
      invoiceDate: true,
      dueDate: true,
      subTotal: true,
      taxTotal: true,
      total: true,
      madeByVane: true,
      createdById: true,
      createdAt: true,
      issuedAt: true,
      customer: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      issuedBy: { select: { name: true } },
      lines: { orderBy: { createdAt: "asc" }, select: { id: true, description: true, quantity: true, unitPrice: true, taxRate: true } },
      quotationId: true,
      fromQuotation: {
        select: {
          quotationNumber: true,
          total: true,
          lines: { orderBy: { createdAt: "asc" }, select: { description: true, quantity: true, unitPrice: true } },
        },
      },
    },
  });
  if (!row) return null;

  const [doc, past, card] = await Promise.all([
    row.quotationId
      ? prisma.crmLeadDocument.findFirst({
          where: { companyId: who.companyId, quotationId: row.quotationId, type: "QUOTATION" },
          select: { approval: { select: { status: true, respondedAt: true } }, deal: { select: { dealNo: true, wonAt: true } } },
        })
      : null,
    prisma.salesInvoice.findMany({
      where: { companyId: who.companyId, customerId: row.customer.id, status: { in: ["ISSUED", "PAID"] }, dueDate: { not: null }, id: { not: row.id } },
      orderBy: { invoiceDate: "desc" },
      take: 20,
      select: { invoiceDate: true, dueDate: true },
    }),
    row.madeByVane
      ? prisma.vaneItem.findFirst({
          where: { companyId: who.companyId, subjectType: "SalesInvoice", subjectId: row.id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
      : null,
  ]);

  return shapeInvoicePage({
    row: { ...row, createdBy: row.createdBy ? { name: row.createdBy.name ?? "Someone" } : null, issuedBy: row.issuedBy ? { name: row.issuedBy.name ?? "Someone" } : null },
    acceptedAt: doc?.approval?.status === "APPROVED" ? (doc.approval.respondedAt ?? null) : null,
    deal: doc?.deal ?? null,
    usualTermsDays: usualTerms(past),
    cardId: card?.id ?? null,
    timeZone: who.timeZone ?? "Africa/Harare",
    can: {
      issue: isRouteAllowedForRole(who.role, "/api/accounting/sales/invoices", "PATCH"),
      // Cancelling an invoice is a superadmin's, as the invoice route has it.
      discard: who.role === "SUPERADMIN",
    },
  });
}
