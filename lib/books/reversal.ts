import type { Ask } from "@/lib/workspace/ask";

import { count } from "./format";

/**
 * The words and sums of Reverse and Delete on an invoice, shared by the
 * server (`reverse-invoice.ts`, `delete-invoice.ts`) and the dialogs. Pure.
 */

const round = (n: number) => Math.round(n * 100) / 100;

export const REASON_MIN = 3;
export const REASON_MAX = 300;

/** Whether the invoice reached the fiscal device: signed into a fiscal day, or accepted by it. */
export function wasFiscalised(receipt: { status: string; receiptGlobalNo: number | null } | null): boolean {
  return Boolean(receipt && (receipt.status === "SUCCESS" || receipt.receiptGlobalNo !== null));
}

/** What the page says about the fiscal side of a reversal, when the invoice was fiscalised: its credit note went to the device, or waits to. */
export function fiscalNote(number: string, sent = false): string {
  return sent
    ? `The credit note went to the fiscal device, citing ${number}.`
    : `The credit note has not reached the fiscal device yet: retry it from the fiscal register.`;
}

/**
 * What the Void drawer says about the fiscal side of a payment: a receipt is
 * never sent to the fiscal device itself, the invoice it paid is, and voids
 * are not sent to it yet.
 */
export function receiptFiscalNote(invoice: string): string {
  return `The fiscal device still holds ${invoice}: payments and voids are not sent to it, so nothing changes there.`;
}

/** What to credit: chosen lines, each up to its quantity, or an amount including VAT. */
export type CreditChoice = { lines: Array<{ lineId: string; quantity: number }> } | { amount: number };

type InvoiceLine = { id: string; description: string; quantity: number; unitPrice: number; taxRate: number; taxCodeId: string | null };

export type CreditLine = { description: string; quantity: number; unitPrice: number; taxRate: number; taxCodeId?: string };

/** The credit note's lines for a choice, and its total, or why there are none. Pure: the dialog previews with it. */
export function creditLines(number: string, lines: InvoiceLine[], choice: CreditChoice): { lines: CreditLine[]; total: number } | { error: string } {
  if ("amount" in choice) {
    if (!(choice.amount > 0)) return { error: "Give the amount to credit." };
    const rates = [...new Set(lines.map((line) => line.taxRate))];
    if (rates.length > 1) return { error: `${number}'s lines carry different VAT rates. Credit chosen lines instead.` };
    const rate = rates[0] ?? 0;
    const net = round(choice.amount / (1 + rate / 100));
    const taxCodeId = lines.find((line) => line.taxCodeId)?.taxCodeId ?? undefined;
    return { lines: [{ description: `Credit against ${number}`, quantity: 1, unitPrice: net, taxRate: rate, taxCodeId }], total: round(net * (1 + rate / 100)) };
  }
  const byId = new Map(lines.map((line) => [line.id, line]));
  const out: CreditLine[] = [];
  for (const chosen of choice.lines) {
    if (!(chosen.quantity > 0)) continue;
    const line = byId.get(chosen.lineId);
    if (!line) return { error: "A line chosen is not on this invoice." };
    if (chosen.quantity > line.quantity + 1e-6) return { error: `${line.description}: at most ${line.quantity} can be credited.` };
    out.push({ description: line.description, quantity: chosen.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate, taxCodeId: line.taxCodeId ?? undefined });
  }
  if (out.length === 0) return { error: "Choose a line to credit, and how much of it." };
  return { lines: out, total: round(out.reduce((sum, line) => sum + line.quantity * line.unitPrice * (1 + line.taxRate / 100), 0)) };
}

/** What Delete takes with it, for the dialog: "INV-0143 and its 3 ledger entries, 1 payment link and the fiscal record". */
export type InvoiceRemoval = {
  number: string;
  draft: boolean;
  ledgerEntries: number;
  paymentLinks: number;
  creditNotes: number;
  fiscalRecord: boolean;
  /** Its fiscal receipt sits in a fiscal day that has not closed: Delete is refused until it does. */
  fiscalDayOpen: boolean;
  /** ZIMRA holds it (or one of its credit notes) as issued: never deleted; reversed with a credit note (books-final §2.5). */
  fiscalised: boolean;
  /** The month it is dated in is closed: allowed, with a warning. */
  periodClosed: boolean;
  /** The CRM deal or lead it was raised for, when it was. */
  crm: boolean;
};

const joined = (parts: string[]) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

/** "INV-0143 and its 3 ledger entries, 1 payment link and the fiscal record", or just the number. */
export function removalSentence(removal: InvoiceRemoval): string {
  const parts = [
    removal.ledgerEntries ? count(removal.ledgerEntries, "ledger entry", "ledger entries") : null,
    removal.paymentLinks ? count(removal.paymentLinks, "payment link") : null,
    removal.creditNotes ? count(removal.creditNotes, "credit note") : null,
    removal.fiscalRecord ? "the fiscal record" : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? `${removal.number} and its ${joined(parts)}` : removal.number;
}


/**
 * The Delete dialog's words. A draft goes with one press. Anything else names
 * what goes with it, keeps its payments as the customer's money on account,
 * warns when its month is closed, and needs a reason and its number typed. On
 * a fiscal day still open it is refused before asking.
 */
export function deleteAsk(removal: InvoiceRemoval, customer: string): Ask {
  const { number } = removal;
  if (removal.draft) {
    return { title: `Delete ${number}?`, body: `The draft to ${customer} goes. Nothing was sent or posted.`, keep: "Keep it", go: "Delete the draft", fill: "bad" };
  }
  if (removal.fiscalised) {
    return {
      title: `${number} can't be deleted`,
      body: `It was fiscalised, so ZIMRA holds it as issued and it is never deleted here. Reverse it instead: a credit note for all or part of it, from its page.`,
      keep: "Keep it",
      go: "",
      fill: "bad",
    };
  }
  if (removal.fiscalDayOpen) {
    return {
      title: `${number} can't be deleted yet`,
      body: `It is on a fiscal day that is still open, and the day's Z report counts it. Close the fiscal day in Accounting, then delete it.`,
      keep: "Keep it",
      go: "",
      fill: "bad",
    };
  }
  const payments =
    removal.paymentLinks === 0
      ? ""
      : ` ${removal.paymentLinks === 1 ? "Its payment stays" : `Its ${removal.paymentLinks} payments stay`} as ${customer}'s money on account.`;
  const closed = removal.periodClosed ? " Its month is closed: deleting it changes figures that were closed." : "";
  const crm = removal.crm ? " Its deal keeps the quote." : "";
  return {
    title: `Delete ${number}?`,
    body: `This deletes ${removalSentence(removal)}, as if it was never written.${payments}${crm}${closed} It can't be undone; the audit log keeps a copy.`,
    keep: "Keep it",
    go: "Delete the invoice",
    fill: "bad",
    field: { key: "reason", label: "Why", placeholder: "Raised against the wrong customer", min: REASON_MIN, max: REASON_MAX, needed: "Say why, in a few words." },
    typed: { label: `Type ${number} to delete it`, text: number },
  };
}
