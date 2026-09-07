/**
 * What the jobs API actually hands back, in one place.
 *
 * The list, the record page and the tab on a deal all read the same two
 * endpoints, and each of them used to describe the rows for itself — which is
 * how the old sheet ended up reading `err.data` for the blockers when
 * `ApiError` carries them on `details`, and silently showing "couldn't save"
 * on every refused completion instead.
 */
import type { WORK_ORDER_STATUSES } from "../../work-orders";

export type JobStatus = (typeof WORK_ORDER_STATUSES)[number];

export type JobItem = {
  id: string;
  description: string;
  quantity: number;
  completedQuantity: number;
  unit: string | null;
  notes: string | null;
};

export type JobPerson = { id: string; name: string | null };

/** The link a job keeps to the invoice it produced. */
export type JobInvoiceLink = {
  documentId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoicedAt: string;
};

/** A job as the collection route draws it — a row, with its figures precomputed. */
export type JobRow = {
  id: string;
  workOrderNo: string;
  title: string;
  status: JobStatus;
  priority: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  addressLine: string | null;
  assignedTo: JobPerson | null;
  client: { id: string; name: string } | null;
  site: { id: string; name: string; addressLine: string | null } | null;
  deal: { id: string; dealNo: string; title: string } | null;
  items: JobItem[];
  completionPercent: number;
  itemsDone: number;
  itemCount: number;
  isOverdue: boolean;
  invoice: JobInvoiceLink | null;
};

/**
 * A job as the record route draws it.
 *
 * The derived fields are the point: whether it can move, how far through it
 * is, what is stopping it closing and what is stopping it being billed are all
 * decided by `lib/crm/work-orders` on the server, and a page that worked any
 * of them out again would be a second opinion that can disagree.
 */
export type JobRecord = {
  id: string;
  workOrderNo: string;
  title: string;
  description: string | null;
  status: JobStatus;
  priority: string;
  createdAt: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startedAt: string | null;
  completedAt: string | null;
  addressLine: string | null;
  accessNotes: string | null;
  contactName: string | null;
  contactPhone: string | null;
  blockedReason: string | null;
  completionNotes: string | null;
  signedByName: string | null;
  signedAt: string | null;
  /**
   * The client's own sign-off, taken through `/s/<token>` rather than on the
   * crew's phone. Separate columns because they are separate claims: one is
   * the crew saying who accepted the work, the other is that person saying it
   * themselves.
   */
  signOffName?: string | null;
  signOffAt?: string | null;
  signOffToken?: string | null;
  signOffAskedAt?: string | null;
  signOffRating?: number | null;
  signOffNotes?: string | null;
  customerRating: number | null;
  crewIds: string[];
  documentId: string | null;
  dealId: string | null;
  clientId: string | null;
  siteId: string | null;
  items: JobItem[];
  assignedTo: JobPerson | null;
  client: { id: string; name: string } | null;
  site: {
    id: string;
    name: string;
    addressLine: string | null;
    accessInstructions?: string | null;
  } | null;
  deal: { id: string; dealNo: string; title: string } | null;
  allowedTransitions: JobStatus[];
  completionPercent: number;
  completionBlockers: string[];
  invoiceBlockers: string[];
  invoice: JobInvoiceLink | null;
  isOverdue: boolean;
};

/** What the invoice route says it would do, before it does it. */
export type JobInvoicePreview = {
  alreadyInvoiced: boolean;
  blockers: string[];
  unpriced: string[];
  currency: string;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
  }>;
  estimatedTotal?: number;
  /** Present once it has been raised. */
  documentId?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  status?: string | null;
  total?: number | null;
  issuedAt?: string | null;
};

/** Which record a jobs list is scoped to, and the query parameter it becomes. */
export type JobsRef =
  | { kind: "deal"; id: string }
  | { kind: "company"; id: string }
  | { kind: "site"; id: string };

export function jobsRefParam(ref: JobsRef): string {
  switch (ref.kind) {
    case "deal":
      return `dealId=${ref.id}`;
    case "company":
      return `clientId=${ref.id}`;
    case "site":
      return `siteId=${ref.id}`;
  }
}

/** Where a job's record page lives. */
export function jobHref(id: string): string {
  return `/crm/work-orders/${id}`;
}

/**
 * A job's own timing, in the words a coordinator uses.
 *
 * The window is two timestamps and reads as one fact — "Tue 26 Aug, 09:00 –
 * 12:00" — so it is assembled once rather than at each of the three places
 * that show it.
 */
export function jobWindow(
  start: string | null,
  end: string | null,
): string | null {
  if (!start) return null;
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return null;

  const day = from.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = (value: Date) =>
    value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (!end) return `${day}, ${time(from)}`;
  const to = new Date(end);
  if (Number.isNaN(to.getTime())) return `${day}, ${time(from)}`;

  // A job that runs past midnight names both days; one that does not would
  // otherwise read "Tue 26 Aug, 09:00 – 12:00" with the second day implied,
  // which is what everybody means anyway.
  const sameDay = from.toDateString() === to.toDateString();
  return sameDay
    ? `${day}, ${time(from)} – ${time(to)}`
    : `${day}, ${time(from)} – ${to.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })}, ${time(to)}`;
}
