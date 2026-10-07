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

import type { Prisma } from "@prisma/client";

import { money, type MoneyLike } from "@/lib/money";
import { type AuditClient, writePlatformAuditEvent } from "@/lib/audit/platform";

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
  /** A manager's decision on a drawer that closed out: accepted, to recover from the cashier, or being looked into (FLR-05). */
  shiftSignedOff: "RETAIL_SHIFT.SIGNED_OFF",
  /** A site's trading day closed: its figures frozen, its Z-reports taken, the cash banked (FLR-07). */
  dayClosed: "RETAIL_DAY.CLOSED",
  /** Cash to the safe, a float top-up, or a payout. */
  cashMoved: "RETAIL_CASH.MOVED",
  /** A delivery booked in against a purchase order. */
  goodsReceived: "RETAIL_GOODS.RECEIVED",
  /**
   * Movements put back by a movement the other way (W-28). One event per
   * product, entity `Product`; carries the references reversed.
   */
  movementsReversed: "RETAIL_STOCK.MOVEMENTS_REVERSED",
  /**
   * Stock taken off or put on by hand (W-23): broken, own use, found more or
   * a fixed mistake. Entity `Product`; carries the reference, why, the signed
   * change, its value at cost, the site and who approved it.
   */
  stockAdjusted: "RETAIL_STOCK.ADJUSTED",
  /** Cases opened into singles (W-26). Entity the case `Product`; carries the reference, cases, singles and site. */
  caseBroken: "RETAIL_STOCK.CASE_BROKEN",
  /**
   * The shop stopped waiting for the rest of an order, or started waiting
   * again. Carries what was still owed, because a supplier who short-delivers
   * every month is a conversation the owner needs the figures for.
   */
  orderClosed: "RETAIL_PURCHASE_ORDER.CLOSED",
  orderReopened: "RETAIL_PURCHASE_ORDER.REOPENED",
  /**
   * The shop's business type or one of its features changed. Carries the type
   * before and after and the categories the change added, because "who turned
   * the age check off" is a question a licence inspector will ask.
   */
  shopProfileChanged: "RETAIL_SHOP.PROFILE_CHANGED",
  /**
   * A list or report left the building as a file. Carries the source, the
   * format and how many rows, so an owner can see who took the customer list
   * home. Entity `ReportSource`, id = the source key.
   */
  exportDownloaded: "RETAIL_EXPORT.DOWNLOADED",
  /**
   * One value in a record's details changed (W-62). Carries the field, its
   * label and the value before and after as text (money through
   * `auditAmount`), and `kind` so Activity can print the money as money.
   */
  recordEdited: "RETAIL_RECORD.EDITED",
  /** A record moved to the bin (W-63). Carries the bin kind and its name. */
  recordBinned: "RETAIL_RECORD.BINNED",
  /** A record came back out of the bin (W-63). */
  recordRestored: "RETAIL_RECORD.RESTORED",
  /**
   * A record gone from the bin for good (W-63): deleted when nothing refers to
   * it, else kept for history and never listed or restored again. Carries
   * how, and whether the nightly purge did it (then nobody is the actor).
   */
  recordPurged: "RETAIL_RECORD.PURGED",
  /**
   * A settings page saved (C-14). Entity `RetailSettings`, id the page;
   * carries every field changed in the one save.
   */
  settingsChanged: "RETAIL_SETTINGS.CHANGED",
  /** A product taken off every till ("Stop selling it"), its stock kept. Carries its name. */
  productArchived: "RETAIL_PRODUCT.ARCHIVED",
  /** A product put back on sale. Carries its name. */
  productUnarchived: "RETAIL_PRODUCT.UNARCHIVED",
  /**
   * A product added (W-09, PRD-03): New product, the product lookup's quick
   * add, an import. Carries its code, name, price, category, opening stock and
   * the site it is kept at.
   */
  productCreated: "RETAIL_PRODUCT.CREATED",
  /**
   * A spreadsheet of products imported (W-08, SET-11). Entity `RetailImport`;
   * carries how many were added, updated and skipped, and the file's name.
   */
  productsImported: "RETAIL_PRODUCTS.IMPORTED",
  /**
   * A price on a list changed (PRD-03; W-14, W-15): typed, many at once, or a
   * scheduled change coming due. Entity `Product`; carries the list, the price
   * before and after (money as a string) and how.
   */
  priceChanged: "RETAIL_PRICE.CHANGED",
  /** A category added (W-19). Carries its name, VAT and target margin. */
  categoryCreated: "RETAIL_CATEGORY.CREATED",
  /**
   * A category changed, alone or in a bulk change. Carries each change and
   * how many products took a new VAT with it.
   */
  categoryChanged: "RETAIL_CATEGORY.CHANGED",
  /** A category deleted: its products moved first. Carries how many and where to. */
  categoryDeleted: "RETAIL_CATEGORY.DELETED",
  /** A site added (W-03). Carries its name, code, places and price list. */
  siteCreated: "RETAIL_SITE.CREATED",
  /**
   * A site changed (W-66): each field before and after, made the default,
   * the places added and removed, and how many stock lines moved with them.
   */
  siteChanged: "RETAIL_SITE.CHANGED",
  /** A site closed. Carries its name and how many tills stopped. */
  siteClosed: "RETAIL_SITE.CLOSED",
  /** A price list added (New price list, or a copy from the Price list field's quick add). Carries its name, its rule or what it copied, and how many products. */
  priceListCreated: "RETAIL_PRICE_LIST.CREATED",
  /** A price list's rules changed (PRD-05): `changes` names each field's label, before and after. */
  priceListChanged: "RETAIL_PRICE_LIST.CHANGED",
  /** A price list paused: tills stop charging it. */
  priceListPaused: "RETAIL_PRICE_LIST.PAUSED",
  /** A paused or draft price list switched on. */
  priceListResumed: "RETAIL_PRICE_LIST.RESUMED",
  /** A till made on Pair a till, recorded when Done first saves it (Cancel leaves nothing). Carries its name, site and device. */
  tillCreated: "RETAIL_TILL.CREATED",
  /** A till changed: each field before and after. */
  tillChanged: "RETAIL_TILL.CHANGED",
  /** A till's device unpaired from the back office. Carries the device and why. */
  deviceUnpaired: "RETAIL_DEVICE.UNPAIRED",
  /** A device paired to a till with a code (W-04). Entity `RetailRegister`; carries the device, never the code or key. */
  devicePaired: "RETAIL_DEVICE.PAIRED",
  /** The till's old device stopped because a new one paired with a replace code (W-76). Carries both devices. */
  deviceReplaced: "RETAIL_DEVICE.REPLACED",
  /** "Send a message" to a till. Carries the words. */
  tillMessageSent: "RETAIL_TILL.MESSAGE_SENT",
  /** Stock sent to another site (W-24). Entity `RetailStockTransfer`; carries lines, units and value (money as a string). */
  transferSent: "RETAIL_STOCK_TRANSFER.SENT",
  /** A transfer called off: what was still on the way went back to the site it left. Carries the units returned. */
  transferCancelled: "RETAIL_STOCK_TRANSFER.CANCELLED",
  /** A transfer's lines changed while on the way. Carries the units now on the way. */
  transferChanged: "RETAIL_STOCK_TRANSFER.CHANGED",
  /** Some or all of a transfer counted in at the site it went to. Carries received, lost and still to come. */
  transferReceived: "RETAIL_STOCK_TRANSFER.RECEIVED",
  /** A count started (W-22). Entity `RetailStockCount`; carries the number, lines, counter and the blind and keep-selling choices. */
  countStarted: "RETAIL_STOCK_COUNT.STARTED",
  /** A count sent for review from the phone. Carries the lines and how many differ. */
  countSubmitted: "RETAIL_STOCK_COUNT.SUBMITTED",
  /** A new ZiG rate (W-05), typed in on Payments. Entity `RetailSettings`, id `payments`; carries the rate and the one it replaced. */
  zigRateSet: "RETAIL_ZIG_RATE.SET",
  /**
   * A posting run (SET-09): the 23:00 run or "Post now". Entity
   * `RetailSettings`, id `posting`; carries the run, its trigger and what it posted.
   */
  postingRun: "RETAIL_POSTING.RUN",
  /** An account added from an account field on Posting to the books (SET-09). Entity `RetailSettings`, id `posting`; carries its code, name and type. */
  postingAccountAdded: "RETAIL_POSTING.ACCOUNT_ADDED",
  /** The drawer opened without a sale (SET-06). Entity `RetailRegister`; carries the till, the shift and who approved it. */
  drawerOpened: "RETAIL_DRAWER.OPENED",
  /** The fiscal device registered with ZIMRA from Setup › Fiscal device (SET-08). Entity `RetailSettings`, id `fiscal`; carries the device and serial, never the key. */
  fiscalConnected: "RETAIL_FISCAL.CONNECTED",
  /** A fiscal day closed and its Z-report taken by ZIMRA (SET-08): by hand, or with the last shift. Entity `RetailSettings`, id `fiscal`; carries the day, its total and how. */
  fiscalDayClosed: "RETAIL_FISCAL.DAY_CLOSED",
  /**
   * Someone added to the shop from People (ADM-02), or sent their invite
   * again (`again`). Entity `User`; carries their name, role, sites and
   * whether a PIN and an email went with it — never the PIN or the link.
   */
  personInvited: "RETAIL_PERSON.INVITED",
  /** They came in: by their link, their first till PIN, or their first sign-in. Entity `User`. */
  personJoined: "RETAIL_PERSON.JOINED",
  /** Their name, phone, role or sites changed. Entity `User`; carries each change before and after. */
  personChanged: "RETAIL_PERSON.CHANGED",
  /** A new till PIN sent to them. Entity `User`; carries whether the old one was locked and whether WhatsApp took it. */
  personPinSent: "RETAIL_PERSON.PIN_SENT",
  /** Their access removed. Entity `User`; carries the shifts closed without a count first. */
  personAccessRemoved: "RETAIL_PERSON.ACCESS_REMOVED",
  /** Their access given back. Entity `User`; carries whether a new PIN went with it. */
  personAccessRestored: "RETAIL_PERSON.ACCESS_RESTORED",
  /** They chose their own till PIN in place of the one they were sent (ADM-03). Entity `User`; carries nothing. */
  pinChosen: "RETAIL_PERSON.PIN_CHOSEN",
  /** The fifth wrong till PIN in a row locked theirs until a new one is sent (ADM-03). Entity `User`; carries the till and the source. */
  pinLocked: "RETAIL_PIN.LOCKED",
  /** A supplier added (W-29): Suppliers, a supplier field's inline add, an import. Entity `Vendor`; carries its code and name. */
  supplierCreated: "RETAIL_SUPPLIER.CREATED",
  /** Someone at a supplier added. Entity `Vendor`; carries their name, role and what they are sent. */
  supplierContactAdded: "RETAIL_SUPPLIER.CONTACT_ADDED",
  /** Someone at a supplier removed. Entity `Vendor`; carries their name. */
  supplierContactRemoved: "RETAIL_SUPPLIER.CONTACT_REMOVED",
  /** "Stop buying from them": the supplier leaves the list and every supplier field. Entity `Vendor`. */
  supplierStopped: "RETAIL_SUPPLIER.STOPPED",
  /** "Buy from them again". Entity `Vendor`. */
  supplierResumed: "RETAIL_SUPPLIER.RESUMED",
  /** A message to a supplier queued on WhatsApp. Entity `Vendor`; carries the number it goes to. */
  suppliersMessaged: "RETAIL_SUPPLIER.MESSAGED",
  /** A copy of a sale's receipt printed from the back office (FLR-01). Entity `RetailSale`; carries `copy: true`. */
  saleReprinted: "RETAIL_SALE.REPRINTED",
  /** A sale's receipt queued on WhatsApp (FLR-01). Entity `RetailSale`; carries the number as shown ("••• 3388"). */
  saleSent: "RETAIL_SALE.SENT",
  /** A flagged sale looked at by a manager (W-44). Entity `RetailSale`; carries why it was flagged. */
  saleReviewed: "RETAIL_SALE.REVIEWED",
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
    /** The manager whose PIN approved the discount or price (SET-06), when the till rules asked for one. */
    approvedBy?: { id: string; name: string } | null;
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
      approvedById: input.approvedBy?.id ?? null,
      approvedByName: input.approvedBy?.name ?? null,
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
     * The manager who stood at the till and typed their PIN, when the
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
    /** The ZiG counted in, and the rate it was valued at (FLR-03); none for a dollars-only drawer. */
    openingFloatZig?: MoneyLike;
    rate?: MoneyLike | null;
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
      openingFloatZig: auditAmount(input.openingFloatZig ?? 0),
      rate: input.rate === undefined || input.rate === null ? null : String(input.rate),
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
    /** The count by note (FLR-04): each currency, the rate that added them, the float left and what went to the safe. */
    count?: { countedUsd: string; countedZig: string; rate: string | null; floatLeft: string; toSafe: string };
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
      ...(input.count ?? {}),
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
    /** The sheet's why (`DROP`, `PETTY`, `TOP_UP`) and who approved it (FLR-03). */
    why?: string | null;
    approvedBy?: { id: string; name: string } | null;
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
      why: input.why ?? null,
      approvedBy: input.approvedBy ?? null,
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

export async function auditExportDownloaded(
  client: AuditClient,
  input: {
    actor: RetailAuditActor;
    key: string;
    format: "xlsx" | "csv" | "pdf";
    rows: number;
  },
): Promise<void> {
  await writeRetailAuditEvent(client, {
    actor: input.actor,
    eventType: RETAIL_AUDIT_EVENTS.exportDownloaded,
    entityType: "ReportSource",
    entityId: input.key,
    payload: { key: input.key, format: input.format, rows: input.rows },
  });
}

/** How a changed value is printed in Activity. */
export type RecordValueKind = "text" | "money" | "count" | "percent";

/** One value in a record's details, changed (W-62). */
export async function auditRecordEdited(
  client: AuditClient,
  input: {
    actor: RetailAuditActor;
    entityType: string;
    entityId: string;
    field: string;
    label: string;
    from: string | null;
    to: string | null;
    kind?: RecordValueKind;
  },
): Promise<void> {
  await writeRetailAuditEvent(client, {
    actor: input.actor,
    eventType: RETAIL_AUDIT_EVENTS.recordEdited,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: {
      entityType: input.entityType,
      field: input.field,
      label: input.label,
      from: input.from,
      to: input.to,
      kind: input.kind ?? "text",
    },
  });
}

/** A record into the bin, or back out of it (W-63). */
export async function auditRecordBin(
  client: AuditClient,
  input: {
    actor: RetailAuditActor;
    action: "binned" | "restored";
    entityType: string;
    entityId: string;
    kind: string;
    name: string;
  },
): Promise<void> {
  await writeRetailAuditEvent(client, {
    actor: input.actor,
    eventType: input.action === "binned" ? RETAIL_AUDIT_EVENTS.recordBinned : RETAIL_AUDIT_EVENTS.recordRestored,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: { kind: input.kind, name: input.name },
  });
}

/**
 * A record gone from the bin for good (W-63). `actor` is null for the nightly
 * purge, which nobody did: the event's actor is empty and it says `automatic`.
 */
export async function auditRecordPurged(
  client: AuditClient,
  input: {
    companyId: string;
    actor: RetailAuditActor | null;
    entityType: string;
    entityId: string;
    kind: string;
    name: string;
    how: "deleted" | "kept";
  },
): Promise<void> {
  const payload = { kind: input.kind, name: input.name, how: input.how, automatic: input.actor === null };
  if (input.actor) {
    await writeRetailAuditEvent(client, {
      actor: input.actor,
      eventType: RETAIL_AUDIT_EVENTS.recordPurged,
      entityType: input.entityType,
      entityId: input.entityId,
      payload,
    });
    return;
  }
  await writePlatformAuditEvent(
    {
      companyId: input.companyId,
      actorId: null,
      eventType: RETAIL_AUDIT_EVENTS.recordPurged,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: { actorRole: null, actorName: null, ...payload },
    },
    client,
  );
}

/**
 * A price on a list changed. A scheduled change coming due is written under
 * whoever scheduled it; with nobody to name, under nobody.
 */
export async function auditPriceChanged(
  client: AuditClient,
  input: {
    companyId: string;
    actor: RetailAuditActor | null;
    productId: string;
    payload: { list: string; from: string | null; to: string | null; how: string; effectiveAt?: string };
  },
): Promise<void> {
  if (input.actor) {
    await writeRetailAuditEvent(client, {
      actor: input.actor,
      eventType: RETAIL_AUDIT_EVENTS.priceChanged,
      entityType: "Product",
      entityId: input.productId,
      payload: input.payload,
    });
    return;
  }
  await writePlatformAuditEvent(
    {
      companyId: input.companyId,
      actorId: null,
      eventType: RETAIL_AUDIT_EVENTS.priceChanged,
      entityType: "Product",
      entityId: input.productId,
      payload: { actorRole: null, actorName: null, ...input.payload },
    },
    client,
  );
}

/** Narrower than `Prisma.TransactionClient`, and enough for every call above. */
export type RetailAuditClient = Pick<Prisma.TransactionClient, "platformAuditEvent">;
