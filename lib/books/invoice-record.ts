import type { InvoiceStatus, PrismaClient } from "@prisma/client";

import { daysBetween, dayOf, money, shortDay, storedDay } from "./format";
import { INVOICE_STATE_LABEL, invoiceState } from "./invoice-state";

/**
 * One invoice in Books (the PageVaneDraft board): its lines and totals, who
 * made it, the quote it came from and what changed since that quote. A draft
 * Vane made says so, and is issued or deleted from here.
 */

export type InvoiceLineView = { id: string; description: string; quantity: number; unitPrice: number; amount: number };

export type InvoiceRecord = {
  id: string;
  number: string;
  status: InvoiceStatus;
  stateLabel: string;
  madeByVane: boolean;
  customer: { id: string; name: string };
  currency: string;
  /** "On issue" for a draft, else the day it is dated. */
  date: string;
  /** "21 days after you issue it", "4 November", or "No due date". */
  due: string;
  lines: InvoiceLineView[];
  subTotal: number;
  taxTotal: number;
  total: number;
  balance: number;
  /** The headline: "$6,400.18 to Borrowdale Brooke Clinic, due 21 days after you issue it." */
  fact: string;
  /** What is behind it, in grey: the quote it matches or how it differs. */
  rest: string | null;
  madeBy: string;
  quote: { id: string; number: string; accepted: string | null } | null;
  /** Each way the lines differ from the quote's: "Coved skirting: 64 m, not 60". Empty when they are as accepted. */
  changes: string[];
};

const round = (n: number) => Math.round(n * 100) / 100;
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

export async function readInvoiceRecord(db: Pick<PrismaClient, "salesInvoice">, companyId: string, id: string, now = new Date()): Promise<InvoiceRecord | null> {
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
      createdAt: true,
      customer: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      lines: { orderBy: { createdAt: "asc" }, select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true } },
      receipts: { select: { receivedAt: true, method: true }, orderBy: { receivedAt: "desc" }, take: 1 },
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

  const rest = !quote
    ? null
    : Math.abs(quote.total - invoice.total) > 0.005
      ? `The accepted quote said ${money(quote.total, invoice.currency)}; ${changes.length ? `${changes.length} ${changes.length === 1 ? "line differs" : "lines differ"}` : `rounding on the lines makes ${money(Math.abs(round(invoice.total - quote.total)), invoice.currency)} ${invoice.total > quote.total ? "more" : "less"}`}.`
      : `As ${quote.quotationNumber} was accepted.`;

  return {
    id: invoice.id,
    number: invoice.invoiceNumber,
    status: invoice.status,
    stateLabel: invoice.madeByVane && draft ? "Vane's draft" : INVOICE_STATE_LABEL[state.state],
    madeByVane: invoice.madeByVane,
    customer: invoice.customer,
    currency: invoice.currency,
    date: draft ? "On issue" : shortDay(dated),
    due,
    lines: invoice.lines.map((line) => ({ id: line.id, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, amount: line.lineTotal })),
    subTotal: invoice.subTotal,
    taxTotal: invoice.taxTotal,
    total: invoice.total,
    balance: state.balance,
    fact: draft
      ? `${amount} to ${invoice.customer.name}, ${dueDay ? `due ${due}` : "with no due date yet"}.`
      : `${amount} to ${invoice.customer.name}${state.balance > 0.005 ? `, ${money(state.balance, invoice.currency)} still owed` : ""}.`,
    rest,
    madeBy: invoice.madeByVane
      ? `Vane, ${invoice.createdAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Harare" })} on ${shortDay(dayOf(invoice.createdAt))}`
      : (invoice.createdBy?.name ?? "Someone in the workspace"),
    quote: quote ? { id: quote.id, number: quote.quotationNumber, accepted: quote.status === "ACCEPTED" ? shortDay(dayOf(quote.updatedAt)) : null } : null,
    changes,
  };
}
