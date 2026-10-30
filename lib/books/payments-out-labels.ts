import type { PurchasePaymentStatus } from "@prisma/client";

/**
 * Payments made words for client components: no database behind them
 * (a client component must never reach `@/lib/prisma`).
 */

export const PAYMENT_OUT_VIEWS = ["all", "to-approve", "paid", "void"] as const;
export type PaymentOutView = (typeof PAYMENT_OUT_VIEWS)[number];

export const PAYMENT_OUT_TAB_LABEL: Record<PaymentOutView, string> = {
  all: "All",
  "to-approve": "To approve",
  paid: "Paid",
  void: "Void",
};

export const PAYMENT_OUT_STATE: Record<PurchasePaymentStatus, string> = {
  DRAFT: "Draft",
  TO_APPROVE: "To approve",
  APPROVED: "Approved",
  PAID: "Paid",
  VOIDED: "Void",
};

export const PAYMENTS_OUT_PAGE_SIZE = 50;
