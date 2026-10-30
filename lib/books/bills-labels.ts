import type { FdmsCheckStatus } from "@prisma/client";

/**
 * Bills' words for client components: no database behind them
 * (a client component must never reach `@/lib/prisma`).
 */

export const BILL_VIEWS = ["to-pay", "overdue", "paid", "drafts", "debit-notes", "void"] as const;
export type BillView = (typeof BILL_VIEWS)[number];

export const BILL_TAB_LABEL: Record<BillView, string> = {
  "to-pay": "To pay",
  overdue: "Overdue",
  paid: "Paid",
  drafts: "Drafts",
  "debit-notes": "Debit notes",
  void: "Void",
};

export const FDMS_LABEL: Record<FdmsCheckStatus, string> = {
  NOT_CHECKED: "Not checked",
  VALID: "Valid",
  NOT_VALID: "Not valid",
};

export const BILLS_PAGE_SIZE = 50;
