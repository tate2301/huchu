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

export function getPaymentSummary(payments: PaymentRow[], total: number) {
  const parsed = payments.map((payment) => ({
    ...payment,
    amountValue: Number(payment.amount || "0"),
  }));
  const nonCashTotal = round(
    parsed
      .filter((payment) => payment.tenderType !== "CASH")
      .reduce((sum, payment) => sum + payment.amountValue, 0),
  );
  const cashTotal = round(
    parsed
      .filter((payment) => payment.tenderType === "CASH")
      .reduce((sum, payment) => sum + payment.amountValue, 0),
  );
  const tenderedTotal = round(
    parsed.reduce((sum, payment) => sum + payment.amountValue, 0),
  );
  const cashDue = round(Math.max(total - nonCashTotal, 0));
  const changeAmount = round(Math.max(cashTotal - cashDue, 0));
  return { parsed, nonCashTotal, tenderedTotal, changeAmount };
}
