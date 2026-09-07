/**
 * Retail's tamper-evident record of who did what at the till.
 *
 * R-3.3. Until this file existed, nothing under `app/api/v2/retail/**` or
 * `lib/retail/**` wrote a `PlatformAuditEvent`. Payroll, disbursements and gold
 * all do; retail — the module that handles physical cash, hourly, in a shop
 * where the owner is not always in the room — did not.
 *
 * ## What retail already had, and why it was not enough
 *
 * A good deal, which is why this went unnoticed:
 *
 *  - every reversal is a **new posted sale** carrying `sourceSaleId` and an
 *    `overrideReason`, so the ledger already shows what was reversed and why;
 *  - `RetailShift` records who opened a drawer, who closed it, and the variance;
 *  - `RetailCashMovement` records every drop and payout;
 *  - `lib/retail/till-activity.ts` reads all of that back for the activity
 *    screen, and says in its own header that it is *not* an audit trail.
 *
 * All of it is **mutable**. Those are ordinary rows: a `RetailSale` can be
 * updated, a `RetailCashMovement` deleted, and nothing anywhere would show it
 * had happened. The chain in `lib/audit/platform.ts` is the difference — each
 * row's hash covers the previous row's hash, so altering or removing one breaks
 * every event after it. For a shop floor that is the whole point: the question
 * is never "what does the database say now", it is "can I trust that this is
 * what it said on Friday".
 *
 * ## Written inside the transaction
 *
 * Every call here passes the transaction client. A refund and its audit event
 * commit together or they do not commit — an audit trail that can be missing
 * the row for a refund that went through is worse than none, because it invites
 * the conclusion that the refund did not happen.
 *
 * That is also why this module does not catch. `writeGoldAuditEvent` swallows
 * and logs, which is right for a background import and wrong for money crossing
 * a counter.
 *
 * ## The payload
 *
 * Amounts go in as strings — `Decimal.toFixed(2)` — not numbers. The payload is
 * hashed as JSON, and a float that serialises as `2.4000000000000004` on one
 * runtime and `2.4` on another would produce two different hashes for the same
 * event. Beyond that the payloads are deliberately small: the audit row says
 * *what was done*, and the sale, shift and movement rows it names say the rest.
 */

import type { Prisma } from "@corelithzw/db";

import { money, type MoneyLike } from "@corelithzw/platform/money";
import { type AuditClient, writePlatformAuditEvent } from "@corelithzw/platform/audit/platform";

/**
 * The events retail appends.
 *
 * `RETAIL_` prefixed and dotted the way the rest of the platform's event types
 * are, so a company's chain reads as one sequence rather than as several
 * modules' logs interleaved. Adding one is a deliberate act: it goes here, and
 * `lib/retail/audit.test.ts` asserts the list is exactly what the module emits.
 */
export const RETAIL_AUDIT_EVENTS = {
  /** A sale posted at the counter or replayed off the offline queue. */
  salePosted: "RETAIL_SALE.POSTED",
  /** A refund against a posted sale. Carries the approver when one was needed. */
  saleRefunded: "RETAIL_SALE.REFUNDED",
  /** A void against a posted sale. */
  saleVoided: "RETAIL_SALE.VOIDED",
  /** A drawer opened, with its float. */
  shiftOpened: "RETAIL_SHIFT.OPENED",
  /** A drawer cashed up. Carries expected, counted and the variance between. */
  shiftClosed: "RETAIL_SHIFT.CLOSED",
  /** Cash to the safe, a float top-up, or a payout. */
  cashMoved: "RETAIL_CASH.MOVED",
  /** A delivery booked in against a purchase order. */
  goodsReceived: "RETAIL_GOODS.RECEIVED",
} as const;

export type RetailAuditEvent =
  (typeof RETAIL_AUDIT_EVENTS)[keyof typeof RETAIL_AUDIT_EVENTS];

/** Who is acting, in the shape `_services.ts` already threads around. */
export type RetailAuditActor = {
  companyId: string;
  userId: string;
  userName?: string | null;
  userRole?: string | null;
};

/**
 * Money, as a string that hashes the same everywhere.
 *
 * `Decimal` does not survive `JSON.stringify` as a number anybody would want to
 * hash, and a plain `number` reintroduces exactly the float drift `lib/money.ts`
 * exists to keep out of retail.
 */
export function auditAmount(value: MoneyLike | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return money(value).toFixed(2);
}

/**
 * Append one retail event.
 *
 * `client` is required rather than defaulting to the global `prisma`, because
 * every caller in this module is inside a transaction and a default would make
 * it easy to write one that quietly is not.
 */
export async function writeRetailAuditEvent(
  client: AuditClient,
  input: {
    actor: RetailAuditActor;
    eventType: RetailAuditEvent;
    entityType: string;
    entityId: string;
    /** The shop's own words — an override reason, a cash-up note. */
    reason?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await writePlatformAuditEvent(
    {
      companyId: input.actor.companyId,
      actorId: input.actor.userId,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason?.trim() || undefined,
      payload: {
        // The role is on the event because the matrix can change: a refusal
        // that was correct in August has to stay legible in December, and
        // "CASHIER, with an approver" is the fact that makes it so.
        actorRole: input.actor.userRole ?? null,
        actorName: input.actor.userName ?? null,
        ...(input.payload ?? {}),
      },
    },
    client,
  );
}

/* ── The seven, each with the fields its reader will ask for ─────────────── */

export async function auditSalePosted(
  client: AuditClient,
  input: {
    actor: RetailAuditActor;
    saleId: string;
    saleNo: string;
    shiftId: string | null;
    siteId: string | null;
    totalAmount: MoneyLike;
    currency: string;
    baseAmount: MoneyLike;
    lineCount: number;
    /** A discount taken at the counter needs a reason and sometimes an approver. */
    overrideReason?: string | null;
  },
): Promise<void> {
  await writeRetailAuditEvent(client, {
    actor: input.actor,
    eventType: RETAIL_AUDIT_EVENTS.salePosted,
    entityType: "RetailSale",
    entityId: input.saleId,
    reason: input.overrideReason,
    payload: {
      saleNo: input.saleNo,
      shiftId: input.shiftId,
      siteId: input.siteId,
      totalAmount: auditAmount(input.totalAmount),
      currency: input.currency,
      baseAmount: auditAmount(input.baseAmount),
      lineCount: input.lineCount,
    },
  });
}

export async function auditSaleReversed(
  client: AuditClient,
  input: {
    actor: RetailAuditActor;
    kind: "refund" | "void";
    saleId: string;
    saleNo: string;
    sourceSaleId: string;
    sourceSaleNo: string;
    shiftId: string | null;
    totalAmount: MoneyLike;
    currency: string;
    reason: string | null;
    /**
     * The manager who stood at the till and typed their password, when the
     * person doing the reversing could not do it on their own authority.
     *
     * This is the single most important field in the module. A reversal is how
     * a till is stolen from, and "who allowed it" is the question asked
     * afterwards — by which time the approver's name inside `overrideReason`
     * on a mutable sale row is not evidence of anything.
     */
    approvedBy?: { id: string; name: string } | null;
  },
): Promise<void> {
  await writeRetailAuditEvent(client, {
    actor: input.actor,
    eventType:
      input.kind === "refund"
        ? RETAIL_AUDIT_EVENTS.saleRefunded
        : RETAIL_AUDIT_EVENTS.saleVoided,
    entityType: "RetailSale",
    entityId: input.saleId,
    reason: input.reason,
    payload: {
      saleNo: input.saleNo,
      sourceSaleId: input.sourceSaleId,
      sourceSaleNo: input.sourceSaleNo,
      shiftId: input.shiftId,
      totalAmount: auditAmount(input.totalAmount),
      currency: input.currency,
      approvedById: input.approvedBy?.id ?? null,
      approvedByName: input.approvedBy?.name ?? null,
      // A cashier reversing on a manager's approval and a manager reversing on
      // their own are different acts, and the row should not need the matrix
      // re-read months later to tell them apart.
      selfAuthorised: !input.approvedBy,
    },
  });
}

export async function auditShiftOpened(
  client: AuditClient,
  input: {
    actor: RetailAuditActor;
    shiftId: string;
    shiftNo: string;
    siteId: string | null;
    registerCode: string | null;
    cashierId: string;
    openingFloat: MoneyLike;
  },
): Promise<void> {
  await writeRetailAuditEvent(client, {
    actor: input.actor,
    eventType: RETAIL_AUDIT_EVENTS.shiftOpened,
    entityType: "RetailShift",
    entityId: input.shiftId,
    payload: {
      shiftNo: input.shiftNo,
      siteId: input.siteId,
      registerCode: input.registerCode,
      cashierId: input.cashierId,
      openingFloat: auditAmount(input.openingFloat),
    },
  });
}

export async function auditShiftClosed(
  client: AuditClient,
  input: {
    actor: RetailAuditActor;
    shiftId: string;
    shiftNo: string;
    cashierId: string;
    expectedCash: MoneyLike;
    countedCash: MoneyLike;
    variance: MoneyLike;
    notes?: string | null;
  },
): Promise<void> {
  await writeRetailAuditEvent(client, {
    actor: input.actor,
    eventType: RETAIL_AUDIT_EVENTS.shiftClosed,
    entityType: "RetailShift",
    entityId: input.shiftId,
    reason: input.notes,
    payload: {
      shiftNo: input.shiftNo,
      cashierId: input.cashierId,
      expectedCash: auditAmount(input.expectedCash),
      countedCash: auditAmount(input.countedCash),
      variance: auditAmount(input.variance),
      // Whether the drawer was cashed up by the person who worked it. A manager
      // closing somebody else's till is legitimate and routine; it is also the
      // shape of a drawer being closed before its cashier can count it.
      closedByOwner: input.actor.userId === input.cashierId,
    },
  });
}

export async function auditCashMoved(
  client: AuditClient,
  input: {
    actor: RetailAuditActor;
    movementId: string;
    shiftId: string;
    type: string;
    reasonCode: string | null;
    amount: MoneyLike;
    currency: string;
    baseAmount: MoneyLike;
    note?: string | null;
  },
): Promise<void> {
  await writeRetailAuditEvent(client, {
    actor: input.actor,
    eventType: RETAIL_AUDIT_EVENTS.cashMoved,
    entityType: "RetailCashMovement",
    entityId: input.movementId,
    reason: input.note,
    payload: {
      shiftId: input.shiftId,
      type: input.type,
      reasonCode: input.reasonCode,
      amount: auditAmount(input.amount),
      currency: input.currency,
      baseAmount: auditAmount(input.baseAmount),
    },
  });
}

export async function auditGoodsReceived(
  client: AuditClient,
  input: {
    actor: RetailAuditActor;
    receiptId: string;
    receiptNo: string;
    purchaseOrderId: string | null;
    siteId: string | null;
    supplier: string | null;
    totalValue: MoneyLike;
    lineCount: number;
  },
): Promise<void> {
  await writeRetailAuditEvent(client, {
    actor: input.actor,
    eventType: RETAIL_AUDIT_EVENTS.goodsReceived,
    entityType: "RetailGoodsReceipt",
    entityId: input.receiptId,
    payload: {
      receiptNo: input.receiptNo,
      purchaseOrderId: input.purchaseOrderId,
      siteId: input.siteId,
      supplier: input.supplier,
      totalValue: auditAmount(input.totalValue),
      lineCount: input.lineCount,
    },
  });
}

/** Narrower than `Prisma.TransactionClient`, and enough for every call above. */
export type RetailAuditClient = Pick<Prisma.TransactionClient, "platformAuditEvent">;
