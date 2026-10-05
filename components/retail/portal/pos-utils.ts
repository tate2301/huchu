"use client";

import type { PaymentRow } from "./pos-types";

export function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** A variance or a refund, with a true minus: a hyphen reads as a dash in a column. */
export function signedMoney(value: number) {
  return value < 0 ? `−${money(Math.abs(value))}` : money(value);
}

export function round(value: number) {
  return Number(value.toFixed(2));
}

/**
 * The tenders against what is due, in the sale's money: a ZiG amount counts
 * at today's rate (`zigRate`, ZiG per US dollar), the rate the server will
 * stamp on it.
 */
export function getPaymentSummary(payments: PaymentRow[], total: number, zigRate: number | null = null) {
  const parsed = payments.map((payment) => {
    const amountValue = Number(payment.amount || "0");
    const baseValue = payment.currency === "ZWG" && zigRate ? amountValue / zigRate : amountValue;
    return { ...payment, amountValue, baseValue };
  });
  const nonCashTotal = round(
    parsed
      .filter((payment) => payment.tenderType !== "CASH")
      .reduce((sum, payment) => sum + payment.baseValue, 0),
  );
  const cashTotal = round(
    parsed
      .filter((payment) => payment.tenderType === "CASH")
      .reduce((sum, payment) => sum + payment.baseValue, 0),
  );
  const tenderedTotal = round(
    parsed.reduce((sum, payment) => sum + payment.baseValue, 0),
  );
  const cashDue = round(Math.max(total - nonCashTotal, 0));
  const changeAmount = round(Math.max(cashTotal - cashDue, 0));
  return { parsed, nonCashTotal, tenderedTotal, changeAmount };
}
