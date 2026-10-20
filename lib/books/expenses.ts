import { count, daysBetween, shortDay, storedDay } from "./format";

/**
 * A supplier's bill, read for the lists and pages that show one (Bills, a
 * bill's page, a supplier's): what is left to pay on it and how late it is.
 * Pure.
 */

export type ExpenseState = "overdue" | "part-paid" | "to-pay" | "paid" | "draft" | "void";

export const EXPENSE_STATE_LABEL: Record<ExpenseState, string> = {
  overdue: "Overdue",
  "part-paid": "Part paid",
  "to-pay": "To pay",
  paid: "Paid",
  draft: "Draft",
  void: "Void",
};

export type BillFacts = {
  status: "DRAFT" | "RECEIVED" | "PAID" | "VOIDED";
  billDate: Date;
  dueDate: Date | null;
  total: number;
  amountPaid: number;
  debitNoteTotal: number;
  writeOffTotal: number;
};

/** What is left to pay on a bill, and how it reads: "4 days overdue", "Due 18 Oct", "Paid". */
export function billState(facts: BillFacts, today: string): { state: ExpenseState; when: string; balance: number } {
  const balance = Math.round(Math.max(0, facts.total - facts.amountPaid - facts.debitNoteTotal - facts.writeOffTotal) * 100) / 100;
  if (facts.status === "VOIDED") return { state: "void", when: "Voided", balance: 0 };
  if (facts.status === "DRAFT") return { state: "draft", when: `Entered ${shortDay(storedDay(facts.billDate))}`, balance };
  if (facts.status === "PAID" || balance <= 0) return { state: "paid", when: "Paid", balance: 0 };
  const due = facts.dueDate ? storedDay(facts.dueDate) : null;
  const late = due ? daysBetween(due, today) : 0;
  if (due && late > 0) return { state: "overdue", when: `${count(late, "day")} overdue`, balance };
  const when = due ? (late === 0 ? "Due today" : `Due ${shortDay(due)}`) : `Received ${shortDay(storedDay(facts.billDate))}`;
  return { state: facts.amountPaid > 0 ? "part-paid" : "to-pay", when, balance };
}
