/**
 * Work orders: the job that follows a won deal.
 *
 * The lifecycle is a state machine rather than a free-text status, because the
 * questions people ask of a job — "is anyone on site?", "why has this not
 * moved?" — only have answers if the states mean something and the moves
 * between them are the ones that can actually happen.
 */
import type { CrmWorkOrderStatus } from "@prisma/client";
import { z } from "zod";

export const WORK_ORDER_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
] as const;

export const WORK_ORDER_STATUS_LABELS: Record<CrmWorkOrderStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "On site",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * Which moves are allowed.
 *
 * A completed job is final: reopening one would let a signature stand against
 * work that changed afterwards. Redo it as a new job instead.
 */
const TRANSITIONS: Record<CrmWorkOrderStatus, CrmWorkOrderStatus[]> = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "BLOCKED", "CANCELLED", "DRAFT"],
  IN_PROGRESS: ["COMPLETED", "BLOCKED", "CANCELLED"],
  BLOCKED: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(
  from: CrmWorkOrderStatus,
  to: CrmWorkOrderStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: CrmWorkOrderStatus): CrmWorkOrderStatus[] {
  return TRANSITIONS[from];
}

/**
 * Whether the checklist can be rewritten, and why not when it can't.
 *
 * Two different refusals that look the same from a distance. Mid-job the lines
 * are what a crew is ticking off, and replacing them wholesale throws their
 * progress away — so the API refuses, and the page has to say so rather than
 * offering a control that quietly does nothing. Once the job is closed the
 * checklist has stopped being a worksheet and become the record of what was
 * done, which is the thing an invoice and a signature both stand on.
 */
export function checklistEditRefusal(status: CrmWorkOrderStatus): string | null {
  if (status === "IN_PROGRESS") {
    return "The crew is on site and ticking these off. Block the job or finish it before changing the list.";
  }
  if (status === "COMPLETED") {
    return "This job is signed off. Its checklist is the record of what was done.";
  }
  if (status === "CANCELLED") {
    return "This job was cancelled.";
  }
  return null;
}

export type WorkOrderItemProgress = { quantity: number; completedQuantity: number };

/**
 * What a job needs before it can be called done.
 *
 * A signature is the one that matters: a job with nobody's name against it is
 * a job the customer can still say never happened.
 */
export function completionBlockers(order: {
  items: WorkOrderItemProgress[];
  signedByName?: string | null;
  scheduledStart?: Date | string | null;
}): string[] {
  const blockers: string[] = [];

  if (!order.signedByName?.trim()) {
    blockers.push("Nobody has signed the job off");
  }

  const unfinished = order.items.filter((item) => item.completedQuantity < item.quantity);
  if (unfinished.length > 0) {
    blockers.push(
      `${unfinished.length} item${unfinished.length === 1 ? " is" : "s are"} not fully done`,
    );
  }

  return blockers;
}

/** How far through the job is, by quantity rather than by line count. */
export function completionPercent(items: WorkOrderItemProgress[]): number {
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  if (total === 0) return 0;
  const done = items.reduce(
    (sum, item) => sum + Math.min(item.completedQuantity, item.quantity),
    0,
  );
  return Math.round((done / total) * 100);
}

/** A job that should have started and hasn't. */
export function isOverdueToStart(
  order: { status: CrmWorkOrderStatus; scheduledStart: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (order.status !== "SCHEDULED" || !order.scheduledStart) return false;
  const start =
    typeof order.scheduledStart === "string"
      ? new Date(order.scheduledStart)
      : order.scheduledStart;
  return !Number.isNaN(start.getTime()) && start.getTime() < now.getTime();
}

export const workOrderItemSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().finite().positive(),
  unit: z.string().trim().max(20).nullable().optional(),
  productId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const createWorkOrderSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
  /** Pull the checklist from this quote's lines instead of typing it out. */
  documentId: z.string().uuid().nullable().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  scheduledStart: z.string().datetime().nullable().optional(),
  scheduledEnd: z.string().datetime().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  crewIds: z.array(z.string().uuid()).max(20).optional(),
  addressLine: z.string().trim().max(300).nullable().optional(),
  accessNotes: z.string().trim().max(1000).nullable().optional(),
  contactName: z.string().trim().max(120).nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  items: z.array(workOrderItemSchema).max(100).optional(),
});

export const updateWorkOrderSchema = createWorkOrderSchema.partial().extend({
  status: z.enum(WORK_ORDER_STATUSES).optional(),
  blockedReason: z.string().trim().max(500).nullable().optional(),
  completionNotes: z.string().trim().max(4000).nullable().optional(),
  signedByName: z.string().trim().max(120).nullable().optional(),
  signatureUrl: z.string().url().nullable().optional(),
  customerRating: z.number().int().min(1).max(5).nullable().optional(),
  itemProgress: z
    .array(z.object({ id: z.string().uuid(), completedQuantity: z.number().finite().min(0) }))
    .max(100)
    .optional(),
});

/**
 * The `status` query parameter, as statuses.
 *
 * Comma-separated because the register's own filter is a multi-select — "show
 * me blocked and on-site" is one question, not two requests. Unknown names are
 * dropped rather than refused: a stale bookmark should narrow to what it can
 * still name, not 400.
 */
export function parseWorkOrderStatuses(value: string | null): CrmWorkOrderStatus[] {
  if (!value) return [];
  const known = new Set<string>(WORK_ORDER_STATUSES);
  const wanted = value
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => known.has(entry)) as CrmWorkOrderStatus[];
  return [...new Set(wanted)];
}

export type WorkOrderQueue = "TODAY" | "SCHEDULED" | "IN_PROGRESS" | "BLOCKED" | "MINE" | "DONE";

export const WORK_ORDER_QUEUE_LABELS: Record<WorkOrderQueue, string> = {
  TODAY: "Today",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "On site",
  BLOCKED: "Blocked",
  MINE: "Mine",
  DONE: "Completed",
};

/**
 * Quote lines become a job checklist.
 *
 * Only what has to be done on site: a delivery charge is on the invoice but
 * isn't a thing a crew ticks off, so anything with no quantity to install is
 * left out rather than cluttering the sheet.
 */
export function quoteLinesToWorkItems(
  lines: { description: string; quantity: number }[],
): { description: string; quantity: number }[] {
  return lines
    .filter((line) => line.quantity > 0)
    .map((line) => ({ description: line.description, quantity: line.quantity }));
}

/**
 * What a repeated action should do.
 *
 * The moves are pressed on a phone, on a site, on a signal that comes and
 * goes, so "Start" gets tapped twice. Refusing the second tap with a 409 tells
 * a crew their job is broken when it is in exactly the state they asked for.
 * `SAME` is the answer that lets a route return the job untouched instead.
 */
export type TransitionOutcome = "SAME" | "ALLOWED" | "REFUSED";

export function transitionOutcome(
  from: CrmWorkOrderStatus,
  to: CrmWorkOrderStatus,
): TransitionOutcome {
  if (from === to) return "SAME";
  return canTransition(from, to) ? "ALLOWED" : "REFUSED";
}

/**
 * The counts a tab badge asks for.
 *
 * Deliberately one pass over rows the caller already has rather than six
 * `count` queries: a record page showing "Jobs 3" has already loaded the three.
 */
export type WorkOrderCounts = {
  total: number;
  open: number;
  scheduled: number;
  inProgress: number;
  blocked: number;
  completed: number;
  cancelled: number;
  overdue: number;
};

export function workOrderCounts(
  orders: { status: CrmWorkOrderStatus; scheduledStart: Date | string | null }[],
  now: Date = new Date(),
): WorkOrderCounts {
  const counts: WorkOrderCounts = {
    total: orders.length,
    open: 0,
    scheduled: 0,
    inProgress: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0,
    overdue: 0,
  };

  for (const order of orders) {
    if (order.status === "SCHEDULED") counts.scheduled += 1;
    if (order.status === "IN_PROGRESS") counts.inProgress += 1;
    if (order.status === "BLOCKED") counts.blocked += 1;
    if (order.status === "COMPLETED") counts.completed += 1;
    if (order.status === "CANCELLED") counts.cancelled += 1;
    // A draft is open too: it is work somebody has written down and not yet
    // booked, which is precisely the thing a badge should keep in front of them.
    if (order.status !== "COMPLETED" && order.status !== "CANCELLED") counts.open += 1;
    if (isOverdueToStart(order, now)) counts.overdue += 1;
  }

  return counts;
}

/**
 * The same tallies, from what the database counted rather than from rows.
 *
 * A badge that reads its number off a page of rows is a badge that lies as
 * soon as a customer has more jobs than the page holds — and it lies quietly,
 * because an undercount looks exactly like a small customer. The grouping is
 * the database's job; `overdue` comes separately because it is a comparison
 * against the clock rather than a value it can group on.
 */
export function workOrderCountsFromGroups(
  groups: { status: CrmWorkOrderStatus; count: number }[],
  overdue: number,
): WorkOrderCounts {
  const counts: WorkOrderCounts = {
    total: 0,
    open: 0,
    scheduled: 0,
    inProgress: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0,
    overdue,
  };

  for (const { status, count } of groups) {
    counts.total += count;
    if (status === "SCHEDULED") counts.scheduled += count;
    if (status === "IN_PROGRESS") counts.inProgress += count;
    if (status === "BLOCKED") counts.blocked += count;
    if (status === "COMPLETED") counts.completed += count;
    if (status === "CANCELLED") counts.cancelled += count;
    if (status !== "COMPLETED" && status !== "CANCELLED") counts.open += count;
  }

  return counts;
}

/**
 * What an invoice raised from a job says it is for.
 *
 * The number leads the note whatever else it carries, and that is not
 * presentation: it is the only part of the invoice written inside the
 * accounting transaction that ties the money back to the job. `CrmWorkOrder`
 * has no column for the link, so the link itself lands in `customFields` in a
 * second write — and if the process dies in between, this prefix is what the
 * next attempt finds instead of billing the customer twice.
 *
 * It reads well on the document too. A customer looking at an invoice should
 * be able to see which visit it is for without being asked to remember.
 */
export function invoiceNotePrefix(workOrderNo: string): string {
  return `Work order ${workOrderNo}: `;
}

export function invoiceNoteFor(workOrderNo: string, body: string): string {
  return `${invoiceNotePrefix(workOrderNo)}${body}`;
}

/**
 * The invoice a finished job is owed.
 *
 * Prices are not on the job — a checklist is a list of things to do, not a
 * price list — so they come back off the quote the checklist was lifted from,
 * matched on the description that was copied across.
 */
export type WorkOrderInvoiceItem = {
  description: string;
  quantity: number;
  completedQuantity: number;
};

export type PricedQuoteLine = {
  description: string;
  unitPrice: number;
  taxRate?: number;
};

export type InvoiceLineDraft = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

export type WorkOrderInvoiceDraft = {
  lines: InvoiceLineDraft[];
  /** Done on site but with no price behind it — named rather than billed at nothing. */
  unpriced: string[];
};

function priceKey(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

export function workOrderInvoiceLines(
  items: WorkOrderInvoiceItem[],
  quoteLines: PricedQuoteLine[] = [],
): WorkOrderInvoiceDraft {
  const prices = new Map<string, PricedQuoteLine>();
  for (const line of quoteLines) {
    // First price wins. A quote that lists the same thing twice priced it twice
    // deliberately, and the line the customer read first is the one they agreed.
    const key = priceKey(line.description);
    if (!prices.has(key)) prices.set(key, line);
  }

  const lines: InvoiceLineDraft[] = [];
  const unpriced: string[] = [];

  for (const item of items) {
    // Bill what was done, never more than what was agreed. A crew that reports
    // five of a quoted four has miscounted or done extra; either way the extra
    // needs a quote of its own before it becomes money somebody owes.
    const done = Math.min(item.completedQuantity, item.quantity);
    if (done <= 0) continue;

    const priced = prices.get(priceKey(item.description));
    if (!priced) {
      // A line at zero disappears into the total as a silent discount, so the
      // caller is told about it and has to decide.
      unpriced.push(item.description);
      continue;
    }

    lines.push({
      description: item.description,
      quantity: done,
      unitPrice: priced.unitPrice,
      taxRate: priced.taxRate ?? 0,
    });
  }

  return { lines, unpriced };
}

/** Why this job can't be billed yet, in the words somebody can act on. */
export function workOrderInvoiceBlockers(order: {
  status: CrmWorkOrderStatus;
  dealId: string | null;
  items: { quantity: number; completedQuantity: number }[];
}): string[] {
  const blockers: string[] = [];

  if (order.status !== "COMPLETED") {
    blockers.push("Only a completed job can be invoiced");
  }
  // The accounting bridge bills against a lead or a deal, because that is what
  // carries the customer and the stage. A job floating free of both has nobody
  // to send the invoice to.
  if (!order.dealId) {
    blockers.push("This job isn't attached to a deal, so there's nothing to bill it against");
  }
  if (!order.items.some((item) => Math.min(item.completedQuantity, item.quantity) > 0)) {
    blockers.push("Nothing on this job was completed, so there is nothing to bill");
  }

  return blockers;
}

/**
 * Where a job records the invoice it produced.
 *
 * `CrmWorkOrder` has no column for it and `prisma/schema.prisma` is not ours to
 * change, so the link sits in the job's `customFields` under a key a person
 * cannot make: `normalizeFieldKey` strips leading underscores, so no custom
 * field will ever be called `__invoice` and collide with this.
 */
export const WORK_ORDER_INVOICE_KEY = "__invoice";

export type WorkOrderInvoiceLink = {
  documentId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoicedAt: string;
};

export function readInvoiceLink(customFields: unknown): WorkOrderInvoiceLink | null {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) return null;
  const link = (customFields as Record<string, unknown>)[WORK_ORDER_INVOICE_KEY];
  if (!link || typeof link !== "object" || Array.isArray(link)) return null;

  const { documentId, invoiceId, invoiceNumber, invoicedAt } = link as Record<string, unknown>;
  if (typeof documentId !== "string" || typeof invoiceId !== "string") return null;

  return {
    documentId,
    invoiceId,
    invoiceNumber: typeof invoiceNumber === "string" ? invoiceNumber : "",
    invoicedAt: typeof invoicedAt === "string" ? invoicedAt : "",
  };
}

function asRecord(customFields: unknown): Record<string, unknown> {
  return customFields && typeof customFields === "object" && !Array.isArray(customFields)
    ? (customFields as Record<string, unknown>)
    : {};
}

export function writeInvoiceLink(
  customFields: unknown,
  link: WorkOrderInvoiceLink,
): Record<string, unknown> {
  const existing = { ...asRecord(customFields) };
  // The claim has done its job the moment the real link exists.
  delete existing[WORK_ORDER_INVOICE_CLAIM_KEY];
  return { ...existing, [WORK_ORDER_INVOICE_KEY]: link };
}

/**
 * "Somebody is billing this job right now."
 *
 * Raising the invoice is two steps that cannot be one — the accounting bridge
 * writes the invoice in its own transaction, and only then can the link be
 * filed against the job. Between those two steps a second press read a job
 * with no invoice on it and billed the customer again. So the job is claimed
 * first, in a conditional update that only one of two racing requests can win.
 *
 * The claim expires because a process that dies mid-bill would otherwise leave
 * a job nobody can ever invoice, which is a worse failure than the one being
 * prevented.
 */
export const WORK_ORDER_INVOICE_CLAIM_KEY = "__invoiceClaim";

export const INVOICE_CLAIM_TTL_MS = 2 * 60_000;

export type WorkOrderInvoiceClaim = { claimedAt: string; userId: string | null };

export function readInvoiceClaim(customFields: unknown): WorkOrderInvoiceClaim | null {
  const claim = asRecord(customFields)[WORK_ORDER_INVOICE_CLAIM_KEY];
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) return null;
  const { claimedAt, userId } = claim as Record<string, unknown>;
  if (typeof claimedAt !== "string") return null;
  return { claimedAt, userId: typeof userId === "string" ? userId : null };
}

export function writeInvoiceClaim(
  customFields: unknown,
  claim: WorkOrderInvoiceClaim,
): Record<string, unknown> {
  return { ...asRecord(customFields), [WORK_ORDER_INVOICE_CLAIM_KEY]: claim };
}

export function clearInvoiceClaim(customFields: unknown): Record<string, unknown> {
  const existing = { ...asRecord(customFields) };
  delete existing[WORK_ORDER_INVOICE_CLAIM_KEY];
  return existing;
}

/** Whether a claim still stands, or has been abandoned long enough to ignore. */
export function isClaimHeld(
  claim: WorkOrderInvoiceClaim | null,
  now: Date = new Date(),
): boolean {
  if (!claim) return false;
  const at = new Date(claim.claimedAt).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < INVOICE_CLAIM_TTL_MS;
}

/**
 * The refusals the accounting bridge raises on purpose.
 *
 * It answers a deal it will not bill by throwing a sentence written for the
 * person who pressed the button, and those deserve to reach them as a 400.
 * Everything else that can come out of a `catch` is a database error or a
 * programming mistake whose text is meaningless to a user and unwise to put
 * in front of one, so it is matched by name rather than assumed.
 */
const BILLING_REFUSALS = new Set([
  "CRM client not found",
  "Deal not found",
  "This deal is marked lost — reopen it before creating documents",
  "This deal has no company; attach one before quoting or invoicing",
  "Source quotation does not belong to this lead",
  "Source quotation not found",
  "Invoice needs at least one line",
]);

export function isBillingRefusal(message: unknown): message is string {
  return typeof message === "string" && BILLING_REFUSALS.has(message);
}

export const scheduleWorkOrderSchema = z.object({
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  crewIds: z.array(z.string().uuid()).max(20).optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const startWorkOrderSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
});

export const blockWorkOrderSchema = z.object({
  /** The whole point of blocking. "Blocked" with no reason is just "stopped". */
  reason: z.string().trim().min(1).max(500),
});

export const cancelWorkOrderSchema = z.object({
  /**
   * Why it isn't happening. A cancelled job with no reason is indistinguishable
   * from one somebody cancelled by accident, and the register keeps it forever.
   */
  reason: z.string().trim().min(1).max(500),
});

export const completeWorkOrderSchema = z.object({
  signedByName: z.string().trim().min(2).max(120).optional(),
  signatureUrl: z.string().url().nullable().optional(),
  completionNotes: z.string().trim().max(4000).nullable().optional(),
  customerRating: z.number().int().min(1).max(5).nullable().optional(),
  itemProgress: z
    .array(z.object({ id: z.string().uuid(), completedQuantity: z.number().finite().min(0) }))
    .max(100)
    .optional(),
});

export const invoiceWorkOrderSchema = z.object({
  /** Prices the quote can't supply, rather than billing those lines at nothing. */
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(300),
        quantity: z.number().finite().positive(),
        unitPrice: z.number().finite().nonnegative(),
        taxRate: z.number().finite().min(0).max(100).optional(),
      }),
    )
    .max(100)
    .optional(),
  currency: z.string().trim().max(10).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  renderTemplateId: z.string().uuid().nullable().optional(),
});
