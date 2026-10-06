/**
 * The sale rules the till applies before it sends a sale, so it asks at Take
 * instead of after a refusal. The server decides again on every sale
 * (`pos/sales`: `saleDiscountRule` in `lib/retail/till-rules.ts` and the
 * product's discount ceiling); where the two ever disagree, the till follows
 * the server's 409 `needsApprover` or 400. Pure and browser-safe, in whole cents.
 */

import { discountPinSentence, PRICE_UP_SENTENCE } from "@/lib/retail/till-rule-words";

import type { PaymentRow } from "./types";

const cents = (amount: number) => Math.round(amount * 100);

/** One line as the rules read it: what was charged against the shelf. */
export type RuledLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  shelfPrice: number;
  lineDiscountAmount: number;
  maxDiscountPercent: number | null;
};

/**
 * Why this sale needs a manager's PIN, as the server will say it, or null.
 *
 * W-64: a price above the shelf always asks; otherwise each line's discount
 * (its own discount plus any cut below the shelf), and the sale's as a whole
 * (the order discount less points paid with, plus every line's), against the
 * cashier's largest. Whether the person selling may approve it themselves is
 * the caller's question.
 */
export function discountApprovalReason(
  maxCashierDiscountPercent: string,
  input: { lines: readonly RuledLine[]; orderDiscount: number },
): string | null {
  if (input.lines.some((line) => line.unitPrice - line.shelfPrice > 0.009)) return PRICE_UP_SENTENCE;
  const limit = Number(maxCashierDiscountPercent);
  const over = (given: number, shelf: number) => shelf > 0 && (given / shelf) * 100 > limit;
  let shelfTotal = 0;
  let givenTotal = Math.max(cents(input.orderDiscount), 0);
  for (const line of input.lines) {
    const shelf = Math.round(cents(line.shelfPrice) * line.quantity);
    const given =
      Math.max(cents(line.lineDiscountAmount), 0) + Math.round(Math.max(cents(line.shelfPrice - line.unitPrice), 0) * line.quantity);
    if (over(given, shelf)) return discountPinSentence(maxCashierDiscountPercent);
    shelfTotal += shelf;
    givenTotal += given;
  }
  return over(givenTotal, shelfTotal) ? discountPinSentence(maxCashierDiscountPercent) : null;
}

/** A line over its product's own discount ceiling, in the server's words; nobody approves past it. */
export function discountCeilingProblem(line: RuledLine): string | null {
  if (line.maxDiscountPercent === null) return null;
  const ceiling = Math.round((cents(line.shelfPrice) * line.quantity * line.maxDiscountPercent) / 100);
  const off = Math.round(cents(line.shelfPrice - line.unitPrice) * line.quantity) + cents(line.lineDiscountAmount);
  return off > ceiling ? `The most off ${line.name} is ${line.maxDiscountPercent}% (US$${(ceiling / 100).toFixed(2)}).` : null;
}

export type PaymentSummary = {
  /** Each row with its amount as typed and its worth in the sale's money. */
  parsed: Array<PaymentRow & { amountValue: number; baseValue: number }>;
  nonCashTotal: number;
  cashTotal: number;
  tenderedTotal: number;
  /** What is owed back, in the sale's money; `splitChange` turns it into US dollars and ZiG notes. */
  changeAmount: number;
};

/**
 * The payments against what is due, in the sale's money: a ZiG amount counts
 * at today's rate (`zigRate`, ZiG per US dollar), the rate the server stamps.
 * Change only comes from cash.
 */
export function paymentSummary(rows: readonly PaymentRow[], amountDue: number, zigRate: number | null): PaymentSummary {
  const parsed = rows.map((row) => {
    const amountValue = Number(row.amount || "0");
    const baseValue = row.currency === "ZWG" && zigRate ? amountValue / zigRate : amountValue;
    return { ...row, amountValue, baseValue };
  });
  const sum = (list: typeof parsed) => list.reduce((total, row) => total + cents(row.baseValue), 0);
  const nonCash = sum(parsed.filter((row) => row.tenderType !== "CASH"));
  const cash = sum(parsed.filter((row) => row.tenderType === "CASH"));
  const cashDue = Math.max(cents(amountDue) - nonCash, 0);
  return {
    parsed,
    nonCashTotal: nonCash / 100,
    cashTotal: cash / 100,
    tenderedTotal: (nonCash + cash) / 100,
    changeAmount: Math.max(cash - cashDue, 0) / 100,
  };
}
