/**
 * Gift and discount vouchers at the till (PRD-10, W-18). Every voucher is
 * money the server holds, so nothing about one works offline: the VOUCHER
 * tender and selling one are drawn off with the sentence below, and a sale
 * holding a voucher is never queued.
 */

import type { VoucherCheck } from "@/lib/retail/vouchers/redeem";
import type { PaymentRow } from "./types";

export type { VoucherCheck };

export const VOUCHERS_OFFLINE = "Vouchers need the till online.";

/** `pos/vouchers/check`'s answer. */
export type VoucherAnswer = { data: VoucherCheck | null; usable: boolean; reason: string | null };

/** Why a voucher cannot be used here, in the server's words, or null when it can. */
export function voucherProblem(answer: VoucherAnswer | null, kind: "MONEY" | "DISCOUNT"): string | null {
  if (!answer) return null;
  if (!answer.usable || !answer.data) return answer.reason ?? "That voucher cannot be used.";
  const discount = answer.data.kind === "DISCOUNT";
  if (kind === "MONEY" && discount) return `${answer.data.code} is a discount voucher. Take it off the sale instead.`;
  if (kind === "DISCOUNT" && !discount) return `${answer.data.code} is money: take it as a payment.`;
  return null;
}

/** What a money voucher pays here: what is left on it, at most what is still owed. */
export function voucherPays(left: number, owed: number): number {
  return Number(Math.max(0, Math.min(left, owed)).toFixed(2));
}

/** Whether this sale needs the server for its vouchers: a VOUCHER payment, a gift voucher sold, or a discount voucher. */
export function holdsVouchers(input: {
  payments: ReadonlyArray<Pick<PaymentRow, "tenderType">>;
  vouchersSold?: readonly unknown[];
  discountVoucher?: unknown;
}): boolean {
  return (input.vouchersSold?.length ?? 0) > 0 || Boolean(input.discountVoucher) || input.payments.some((row) => row.tenderType === "VOUCHER");
}

/** "10.00" from what was typed, or null when it is not a value a gift voucher can carry (up to 1,000.00). */
export function giftValue(typed: string): string | null {
  const value = Number(typed);
  if (!typed.trim() || !Number.isFinite(value) || value <= 0 || value > 1000) return null;
  return value.toFixed(2);
}
