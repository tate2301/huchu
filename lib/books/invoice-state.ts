import { count, daysBetween, methodWord, money, shortDay, storedDay } from "./format";

/**
 * Where an invoice stands, in the words Books → Invoices uses
 * (design/core-modules/html/books-invoices.html): Overdue, Part paid, Sent,
 * Paid, Draft or Void, with the one line that says when.
 */

export type InvoiceState = "overdue" | "part-paid" | "sent" | "paid" | "draft" | "void";

export const INVOICE_STATE_LABEL: Record<InvoiceState, string> = {
  overdue: "Overdue",
  "part-paid": "Part paid",
  sent: "Issued",
  paid: "Paid",
  draft: "Draft",
  void: "Void",
};

export type InvoiceFacts = {
  status: "DRAFT" | "ISSUED" | "PAID" | "VOIDED";
  invoiceDate: Date;
  dueDate: Date | null;
  total: number;
  amountPaid: number;
  creditTotal: number;
  writeOffTotal: number;
  /** The last payment, for "Paid 5 Oct, cash". */
  lastReceipt: { receivedAt: Date; method: string } | null;
};

/** What is still owed on it: total less payments, credit notes and write-offs. */
export function invoiceBalance(facts: Pick<InvoiceFacts, "total" | "amountPaid" | "creditTotal" | "writeOffTotal">): number {
  const balance = facts.total - facts.amountPaid - facts.creditTotal - facts.writeOffTotal;
  return Math.round(Math.max(0, balance) * 100) / 100;
}

export function invoiceState(facts: InvoiceFacts, today: string): { state: InvoiceState; when: string; balance: number; daysOverdue: number } {
  const balance = invoiceBalance(facts);
  if (facts.status === "VOIDED") return { state: "void", when: `Voided`, balance: 0, daysOverdue: 0 };
  if (facts.status === "DRAFT") return { state: "draft", when: `Written ${shortDay(storedDay(facts.invoiceDate))}`, balance, daysOverdue: 0 };
  if (facts.status === "PAID" || balance <= 0) {
    const paid = facts.lastReceipt;
    return {
      state: "paid",
      when: paid ? `Paid ${shortDay(storedDay(paid.receivedAt))}, ${methodWord(paid.method)}` : "Paid",
      balance: 0,
      daysOverdue: 0,
    };
  }
  const due = facts.dueDate ? storedDay(facts.dueDate) : null;
  const late = due ? daysBetween(due, today) : 0;
  if (due && late > 0) {
    return { state: "overdue", when: `${count(late, "day")} overdue`, balance, daysOverdue: late };
  }
  const when = due ? (late === 0 ? "Due today" : `Due ${shortDay(due)}`) : `Sent ${shortDay(storedDay(facts.invoiceDate))}`;
  return { state: facts.amountPaid > 0 ? "part-paid" : "sent", when, balance, daysOverdue: 0 };
}

/**
 * The finding Invoices opens with: what is owed and how much of it is late.
 * "$5,724.22 is owed to you on 5 invoices." / "3 are overdue, $2,480.00 in all."
 */
export function invoicesFinding(
  owed: { amount: number; invoices: number },
  overdue: { amount: number; invoices: number },
  currency = "USD",
): { fact: string; rest: string | null } {
  if (owed.invoices === 0) return { fact: "Nothing is owed to you.", rest: "Every invoice sent is paid." };
  const fact = `${money(owed.amount, currency)} is owed to you on ${count(owed.invoices, "invoice")}.`;
  if (overdue.invoices === 0) return { fact, rest: "None is overdue." };
  if (overdue.invoices === owed.invoices) {
    return { fact, rest: owed.invoices === 1 ? "It is overdue." : `All ${owed.invoices} are overdue.` };
  }
  return {
    fact,
    rest: `${overdue.invoices} ${overdue.invoices === 1 ? "is" : "are"} overdue, ${money(overdue.amount, currency)} in all.`,
  };
}
