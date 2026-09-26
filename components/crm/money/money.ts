/**
 * Shared shapes and formatting for the money pages.
 *
 * Amounts arrive from the API as strings, because they are `Decimal` in the
 * database and a JSON number would quietly round the cents off a figure
 * somebody is going to be held to. They stay strings the whole way to the
 * screen; nothing here parses them to do arithmetic.
 */

export type RequisitionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "DISBURSED"
  | "ACQUITTED"
  | "CANCELLED";

export const REQUISITION_STATUS_LABELS: Record<RequisitionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Waiting for approval",
  APPROVED: "Approved, not yet paid",
  REJECTED: "Declined",
  DISBURSED: "Paid out",
  ACQUITTED: "Accounted for",
  CANCELLED: "Withdrawn",
};

export const CATEGORIES = [
  "FUEL",
  "AIRTIME",
  "TRANSPORT",
  "MATERIALS",
  "EQUIPMENT",
  "LABOUR",
  "SUBSISTENCE",
  "ACCOMMODATION",
  "OTHER",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  FUEL: "Fuel",
  AIRTIME: "Airtime",
  TRANSPORT: "Transport",
  MATERIALS: "Materials",
  EQUIPMENT: "Equipment",
  LABOUR: "Labour",
  SUBSISTENCE: "Food",
  ACCOMMODATION: "Accommodation",
  OTHER: "Other",
};

/** Categories the form does not nag for a project on. */
export const UNPROJECTED: readonly Category[] = ["FUEL", "AIRTIME"];

/**
 * A requisition as the money pages draw it — one row in a register, a
 * project's section or a dashboard's drilldown. One shape, so the three cannot
 * each grow their own idea of which amount is the one that counts.
 */
export type RequisitionRow = {
  id: string;
  requisitionNo: string;
  status: RequisitionStatus;
  category: Category;
  purpose: string;
  amount: string;
  approvedAmount: string | null;
  acquittedAmount?: string | null;
  currency: string;
  createdAt?: string;
  neededBy?: string | null;
  requestedBy: { id: string; name: string | null } | null;
  project?: { id: string; name: string; projectNo: string } | null;
};

/** What was actually paid, or would be: the approved figure when an approver cut it. */
export function payable(row: { amount: string; approvedAmount: string | null }): string {
  return row.approvedAmount ?? row.amount;
}

/** One line of money in somebody's hands. */
export type CostEntryRow = {
  id: string;
  direction: "RECEIVED" | "SPENT";
  category: Category;
  amount: string;
  currency: string;
  description: string;
  receiptUrl: string | null;
  createdAt?: string;
  project?: { id: string; name: string; projectNo: string } | null;
  requisition?: { id: string; requisitionNo: string; status?: RequisitionStatus } | null;
  /** The invoice money received was paying, when it was a customer's. */
  invoiceDocument?: { id: string; invoice: { invoiceNumber: string } | null } | null;
  /**
   * Cash logged against an invoice accounting has not receipted yet. Only the
   * cost tracker's register works it out; elsewhere it is absent, which is
   * not the same as false.
   */
  notReceipted?: boolean;
  log: {
    logDate: string;
    submittedAt?: string | null;
    user: { id: string; name: string | null };
  } | null;
};

/**
 * "USD 1,050.00". A negative figure takes a true minus sign — the hyphen the
 * locale formatter writes is a dash the width of a digit's half, and in a
 * column of tabular figures it reads as a smudge rather than a sign.
 */
export function formatMoney(amount: string | number, currency = "USD"): string {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return `${currency} ${amount}`;
  return `${currency} ${value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Today as `YYYY-MM-DD`, in the same UTC terms the log is keyed on. */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Dates as the management surface writes them — "25 Sept 2026", day first —
 * rather than in whatever order the browser's locale prefers. The same day
 * written "9/25/2026" on one row and "2026-09-25" on the next is two
 * formats to read where there should be none.
 *
 * Log days are `YYYY-MM-DD` keys in UTC, so they are formatted in UTC: a
 * reader east of Greenwich would otherwise see the 24th for a day logged as
 * the 25th.
 */
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const WEEKDAY_DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function asDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
}

/** "25 Sept 2026" — a log day key or a timestamp. */
export function formatDate(value: string | Date): string {
  return DAY_MONTH_YEAR.format(asDate(value));
}

/** "Friday 25 September" — a day as a heading. */
export function formatDay(key: string): string {
  return WEEKDAY_DAY_MONTH.format(asDate(key));
}
