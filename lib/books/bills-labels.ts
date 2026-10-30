import type { FdmsCheckStatus } from "@prisma/client";

import type { ExpenseState } from "./expenses";

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

/** The Due chip: bills falling due in a window. */
export const BILL_DUES = ["any", "this-week", "this-month", "next-30"] as const;
export type BillDue = (typeof BILL_DUES)[number];
export const BILL_DUE_LABEL: Record<BillDue, string> = {
  any: "Any",
  "this-week": "This week",
  "this-month": "This month",
  "next-30": "Next 30 days",
};

/** The State column's words: a bill that is recorded and not yet paid reads "Recorded"; a draft over the limit "To approve". */
export const BILL_STATE_WORD: Record<ExpenseState, string> = {
  overdue: "Overdue",
  "part-paid": "Part paid",
  "to-pay": "Recorded",
  paid: "Paid",
  draft: "Draft",
  void: "Void",
};
