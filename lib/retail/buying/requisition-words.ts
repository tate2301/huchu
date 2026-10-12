import { formatMoney } from "@/lib/workspace/format";

/**
 * A requisition's words (40-buying 3.2, 5.8, 5.9, 5.18–5.21), pure so the
 * list, the record, the sheets and the server say the same thing.
 */

export type RequisitionState = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "DISBURSED" | "ACQUITTED" | "CANCELLED";

export type StateTone = "warn" | "info" | "bad" | "hollow" | "neutral";

/** The seven states, in the order Filters › State lists them. */
export const REQUISITION_STATES: RequisitionState[] = ["SUBMITTED", "APPROVED", "DISBURSED", "ACQUITTED", "REJECTED", "CANCELLED", "DRAFT"];

const STATE_WORDS: Record<RequisitionState, [string, StateTone]> = {
  DRAFT: ["Draft", "neutral"],
  SUBMITTED: ["Waiting for approval", "warn"],
  APPROVED: ["Approved, to pay", "info"],
  DISBURSED: ["Paid, receipt due", "info"],
  ACQUITTED: ["Accounted for", "hollow"],
  REJECTED: ["Rejected", "hollow"],
  CANCELLED: ["Cancelled", "hollow"],
};

/** The state badge: "Receipt overdue" (bad) once a paid-out one is past its receipts day. */
export function requisitionStateBadge(state: RequisitionState, receiptsOverdue = false): { label: string; tone: StateTone } {
  if (state === "DISBURSED" && receiptsOverdue) return { label: "Receipt overdue", tone: "bad" };
  const [label, tone] = STATE_WORDS[state];
  return { label, tone };
}

/** The filter's words for a state ("Waiting for approval"). */
export const stateWord = (state: RequisitionState) => STATE_WORDS[state][0];

export type RequisitionStep = { label: string; state: "done" | "now" | "todo" };

/** Asked · Approved · Paid out · Accounted for: the first not done is now; rejected and cancelled stop after Asked. */
export function requisitionSteps(state: RequisitionState): RequisitionStep[] {
  const labels = ["Asked", "Approved", "Paid out", "Accounted for"];
  if (state === "REJECTED" || state === "CANCELLED" || state === "DRAFT") {
    return labels.map((label, index) => ({ label, state: index === 0 && state !== "DRAFT" ? "done" : "todo" }));
  }
  const done = { SUBMITTED: 1, APPROVED: 2, DISBURSED: 3, ACQUITTED: 4 }[state];
  return labels.map((label, index) => ({ label, state: index < done ? "done" : index === done ? "now" : "todo" }));
}

/** Live: one per order at a time (Submitted, Approved, Paid out). */
export const LIVE_STATES: RequisitionState[] = ["SUBMITTED", "APPROVED", "DISBURSED"];

export const REJECT_REASONS = ["Not needed now", "Too much", "Pay another way", "Other"] as const;
export type RejectReasonWord = (typeof REJECT_REASONS)[number];
export const REJECT_REASON_OF: Record<RejectReasonWord, "NOT_NEEDED_NOW" | "TOO_MUCH" | "PAY_ANOTHER_WAY" | "OTHER"> = {
  "Not needed now": "NOT_NEEDED_NOW",
  "Too much": "TOO_MUCH",
  "Pay another way": "PAY_ANOTHER_WAY",
  Other: "OTHER",
};
export const REJECT_REASON_WORD: Record<string, RejectReasonWord> = Object.fromEntries(
  Object.entries(REJECT_REASON_OF).map(([word, key]) => [key, word as RejectReasonWord]),
);

/** The sheet's currency segment and the stored code. */
export const CURRENCY_OF: Record<"US$" | "ZiG", "USD" | "ZWG"> = { US$: "USD", ZiG: "ZWG" };
export const CURRENCY_SEG: Record<string, "US$" | "ZiG"> = { USD: "US$", ZWG: "ZiG" };

/** "US dollars, cash" / "ZiG, cash" / "US dollars, bank transfer": the rail's Currency. */
export function currencyRailWords(currency: string, method: "CASH" | "BANK_TRANSFER" | "ECOCASH" | null): string {
  const what = currency === "ZWG" ? "ZiG" : "US dollars";
  const how = method === "BANK_TRANSFER" ? "bank transfer" : method === "ECOCASH" ? "EcoCash" : "cash";
  return `${what}, ${how}`;
}

/** "Afdis" from "Afdis Distillers". */
export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/** "Cash to pay Afdis for order PO-0005". */
export const orderPurpose = (supplier: string, poNo: string) => `Cash to pay ${firstName(supplier)} for order ${poNo}`;

/** The limit note on Ask for money (5.18): over the limit the owner approver, else any manager. */
export function limitNote(input: { amount: number; limit: number; approver: string | null; currency?: string }): string {
  const limit = formatMoney(input.limit);
  if (input.amount > input.limit) return `${input.approver ?? "The owner"} approves anything over ${limit}.`;
  return `Under ${limit}, a manager can approve it.`;
}

/** "REQ-0015 sent to Tendai Mhlanga for approval." / "… to the managers …". */
export function sentForApproval(requisitionNo: string, waitsFor: string | null): string {
  return `${requisitionNo} sent to ${waitsFor ?? "the managers"} for approval.`;
}

/** The toast once approved: "US$1,500.00 approved. Tafara can pay it out." */
export function approvedWords(amount: number, currency: string, askerFirst: string, askerCanPay: boolean): string {
  return `${formatMoney(amount, currency)} approved. ${askerCanPay ? `${askerFirst} can pay it out.` : "It can be paid out now."}`;
}

/** The expense type's short word for the list's Against: "Repairs", "Fuel", "Licences". */
export const expenseShort = (name: string) => firstName(name);
