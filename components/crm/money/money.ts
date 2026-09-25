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
  requisition?: { id: string; requisitionNo: string } | null;
  log: { logDate: string; user: { id: string; name: string | null } } | null;
};

export function formatMoney(amount: string | number, currency = "USD"): string {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return `${currency} ${amount}`;
  return `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Today as `YYYY-MM-DD`, in the same UTC terms the log is keyed on. */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDay(key: string): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
