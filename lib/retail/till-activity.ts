/**
 * What this till has done, assembled from the rows that already record it.
 *
 * S-7.6. `docs/design-system/portals/pos.html` puts an *Audit log* on the till
 * (`renderAudit`): a filter chip per kind, a row per event with a timestamp, a
 * type badge, a summary, who did it, and a signed amount.
 *
 * ── This is a derived view, and it is still not the audit log ──────────────
 *
 * R-3.3 has since built the real one. `lib/retail/audit.ts` writes a chained
 * `PlatformAuditEvent` inside the same transaction as every sale, reversal,
 * shift boundary, cash movement and goods receipt. So the caveat below is
 * narrower than it was — but it has not gone away, and this screen is not that
 * trail.
 *
 * This reads the domain rows themselves — `RetailSale`, `RetailCashMovement`,
 * `RetailShift` — each of which already carries an actor and a timestamp, and
 * arranges them into one timeline. It stays that way on purpose: the till screen
 * wants a cashier's own week in the vocabulary of a shop, and the chain is
 * append-only evidence in the vocabulary of an auditor. Rendering the chain here
 * would give a cashier a worse version of the same information.
 *
 * Three differences, and the screen says them out loud:
 *
 *  - **It only sees what leaves a row.** A sale, a refund, a void, a cash
 *    movement and a shift boundary each write a durable record, so they appear. A
 *    failed PIN attempt, a cart discarded before tender, a manager override that
 *    was refused, a price *looked at* — none of those write anything, so none of
 *    them can appear here however much a shop would want them to. That is still
 *    true after R-3.3: the chain records the same acts, not more of them.
 *  - **It is not tamper-evident.** A `RetailSale` deleted straight out of the
 *    database leaves this timeline shorter and no wiser. The chain is where that
 *    deletion shows, because every event after it stops verifying.
 *  - **It is reconstructed, not recorded.** If the shape of a sale changes, this
 *    view changes retroactively. The audit event is frozen at write time.
 *
 * ── Two sign traps, both pinned by the tests ───────────────────────────────
 *
 * 1. **A reversal is already negative.** `_services.ts` writes `REFUND` and
 *    `VOID` rows with negated `totalAmount` and `baseAmount`. The prototype
 *    negates by hand at the call site — `logAudit('void', …, -sel.total)` — and
 *    copying that would show a void of $46 as +$46. `baseAmount` is taken as it
 *    stands.
 * 2. **`overrideReason` means two different things.** On a `SALE` it is the
 *    manager's justification for a price change or an over-limit discount, and it
 *    is the one thing on this screen a shop actually watches. On a `REFUND` or a
 *    `VOID` the same column holds the *reason for the reversal* — `_services.ts`
 *    assigns `overrideReason: input.reason.trim()` in both — so treating it as an
 *    override there would invent a price override on every single refund.
 */

import type { Prisma } from "@prisma/client";

import { money, toBaseAmount, type MoneyLike } from "@/lib/money";
import {
  RETAIL_CASH_MOVEMENT_REASON_LABELS,
  cashMovementDirection,
  type RetailCashMovementReasonCode,
  type RetailCashMovementTypeName,
} from "./cash-movements";

/**
 * The chips, the entry shape and the filter live in `till-activity-shared.ts`,
 * which has no imports.
 *
 * This module reaches `lib/money`, which reaches `lib/prisma`, which requires
 * `dns` — so a client component importing anything from here fails the build.
 * The screen needs only the pure half; the split is what lets it have it. See
 * that file's header for the exact import trace.
 *
 * Re-exported so server callers and the tests still import one module.
 */
export {
  TILL_ACTIVITY_FILTERS,
  TILL_ACTIVITY_KINDS,
  TILL_ACTIVITY_LABELS,
  filterTillActivity,
  wasApproved,
  type TillActivityEntry,
  type TillActivityKind,
} from "./till-activity-shared";

import {
  TILL_ACTIVITY_KINDS as ACTIVITY_KINDS,
  type TillActivityDiscount,
  type TillActivityEntry,
  type TillActivityKind,
  type TillActivitySale,
} from "./till-activity-shared";

export type TillActivitySaleRow = {
  id: string;
  saleNo: string;
  saleType: "SALE" | "REFUND" | "VOID";
  baseAmount: MoneyLike;
  /** The tendered currency, shown only when it is not the base one. */
  currency: string;
  totalAmount: MoneyLike;
  cashierName: string | null;
  customerName: string | null;
  overrideReason: string | null;
  /** The manager whose PIN let the discount, refund or void through; null when nobody had to. */
  approvedByName: string | null;
  postedAt: Date | string | null;
  createdAt: Date | string;
  shiftNo: string | null;
  /** Quote units per base unit; the lines are priced in the sale's own currency. */
  exchangeRate?: MoneyLike;
  /** The sale a refund or a void reverses. */
  sourceSale?: {
    id: string;
    saleNo: string;
    customerName: string | null;
    baseAmount: MoneyLike;
  } | null;
  /** The lines that came off the shelf price, for the override's sentence. */
  discountLines?: Array<{ itemName: string; discountAmount: MoneyLike }>;
};

export type TillActivityMovementRow = {
  id: string;
  type: RetailCashMovementTypeName;
  baseAmount: MoneyLike;
  reasonCode: RetailCashMovementReasonCode;
  reason: string | null;
  recordedByName: string | null;
  createdAt: Date | string;
  shiftNo: string | null;
};

export type TillActivityShiftRow = {
  id: string;
  shiftNo: string;
  registerName: string;
  cashierName: string;
  openingFloat: MoneyLike;
  countedCash: MoneyLike | null;
  variance: MoneyLike | null;
  openedAt: Date | string;
  closedAt: Date | string | null;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function signed(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

/** Empty and whitespace-only both read as absent. */
function trimmed(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

const SALE_KIND: Record<TillActivitySaleRow["saleType"], TillActivityKind> = {
  SALE: "sale",
  REFUND: "refund",
  VOID: "void",
};

/** The fields each kind of entry leaves empty, so every entry carries the whole shape. */
const NOT_A_SALE: Pick<TillActivityEntry, "saleNo" | "customerName" | "tendered" | "sale" | "discounts" | "approvedBy"> = {
  saleNo: null,
  customerName: null,
  tendered: null,
  sale: null,
  discounts: [],
  approvedBy: null,
};
const NOT_CASH: Pick<TillActivityEntry, "cashType" | "reasonLabel"> = { cashType: null, reasonLabel: null };
const NOT_A_SHIFT: Pick<TillActivityEntry, "shiftEvent" | "registerName" | "variance"> = {
  shiftEvent: null,
  registerName: null,
  variance: null,
};
const NOT_CASH_OR_SHIFT = { ...NOT_CASH, ...NOT_A_SHIFT };

/**
 * The sale an event is about, so the screen can write "of Tapiwa's US$14.30 on
 * S-005078" and link to it. A reversal points at the sale it reversed; an
 * override at the sale it was given on. In base currency, like `amount`.
 */
function subjectOf(sale: TillActivitySaleRow): TillActivitySale | null {
  if (sale.saleType === "SALE") {
    return {
      id: sale.id,
      saleNo: sale.saleNo,
      customerName: trimmed(sale.customerName),
      total: signed(money(sale.baseAmount)),
    };
  }
  if (!sale.sourceSale) return null;
  return {
    id: sale.sourceSale.id,
    saleNo: sale.sourceSale.saleNo,
    customerName: trimmed(sale.sourceSale.customerName) ?? trimmed(sale.customerName),
    total: signed(money(sale.sourceSale.baseAmount).abs()),
  };
}

/** What each discounted line took off, converted to base so it sits beside the total. */
function discountsOf(sale: TillActivitySaleRow): TillActivityDiscount[] {
  return (sale.discountLines ?? [])
    .filter((line) => money(line.discountAmount).greaterThan(0))
    .map((line) => ({
      itemName: line.itemName,
      amount: signed(toBaseAmount(line.discountAmount, sale.exchangeRate ?? 1)),
    }));
}

/**
 * A sale row becomes one entry — or two, when a manager signed off a price on it.
 *
 * The override is a separate line rather than a note on the sale because it is a
 * separate act by a different person, and because the chip that filters to it has
 * to have something to select.
 */
export function saleActivityEntries(sale: TillActivitySaleRow): TillActivityEntry[] {
  const at = iso(sale.postedAt ?? sale.createdAt);
  const baseAmount = money(sale.baseAmount);
  const tendered = money(sale.totalAmount);
  // Only worth saying when the two disagree — a ZWG sale in a USD-based shop.
  const currencyNote =
    tendered.equals(baseAmount) ? null : `${sale.currency} ${tendered.abs().toFixed(2)}`;
  const own = { ...NOT_CASH_OR_SHIFT, saleNo: sale.saleNo, customerName: trimmed(sale.customerName) };

  const entries: TillActivityEntry[] = [
    {
      id: `sale:${sale.id}`,
      kind: SALE_KIND[sale.saleType],
      at,
      actor: trimmed(sale.cashierName),
      amount: signed(baseAmount),
      shiftNo: sale.shiftNo,
      ...own,
      tendered: currencyNote,
      // A plain sale is its own subject; a reversal needs the sale it reversed.
      sale: sale.saleType === "SALE" ? null : subjectOf(sale),
      // On a reversal `overrideReason` is the reason for the reversal itself, so
      // it belongs here rather than on an override line that never happened.
      reason: sale.saleType === "SALE" ? null : trimmed(sale.overrideReason),
      discounts: [],
      // A sale's approver approved its discount, and says so on the override line.
      approvedBy: sale.saleType === "SALE" ? null : trimmed(sale.approvedByName),
    },
  ];

  const override = sale.saleType === "SALE" ? trimmed(sale.overrideReason) : null;
  if (override) {
    entries.push({
      id: `override:${sale.id}`,
      kind: "override",
      at,
      actor: trimmed(sale.cashierName),
      // The override's own value is not a column anywhere; showing the sale's
      // total beside it would read as the size of the discount, which it is not.
      amount: null,
      shiftNo: sale.shiftNo,
      ...own,
      tendered: null,
      sale: subjectOf(sale),
      reason: override,
      discounts: discountsOf(sale),
      approvedBy: trimmed(sale.approvedByName),
    });
  }

  return entries;
}

/** A cash movement, signed the one way the module signs it. */
export function movementActivityEntry(
  movement: TillActivityMovementRow,
): TillActivityEntry {
  const delta = money(movement.baseAmount).abs();
  const amount = cashMovementDirection(movement.type) === -1 ? delta.negated() : delta;
  return {
    id: `cash:${movement.id}`,
    kind: "cash",
    at: iso(movement.createdAt),
    actor: trimmed(movement.recordedByName),
    amount: signed(amount),
    shiftNo: movement.shiftNo,
    ...NOT_A_SALE,
    ...NOT_A_SHIFT,
    reason: trimmed(movement.reason),
    cashType: movement.type,
    reasonLabel: RETAIL_CASH_MOVEMENT_REASON_LABELS[movement.reasonCode],
  };
}

/**
 * A shift becomes one entry when it opens and a second when it closes.
 *
 * The close carries the counted cash and, when the drawer did not agree with the
 * books, the variance in words. No tolerance is applied: a variance is a variance,
 * and the prototype's `Math.abs(variance) > 10` is a float comparison against a
 * number nobody in this shop agreed to.
 */
export function shiftActivityEntries(shift: TillActivityShiftRow): TillActivityEntry[] {
  const entries: TillActivityEntry[] = [
    {
      id: `shift-open:${shift.id}`,
      kind: "shift",
      at: iso(shift.openedAt),
      actor: trimmed(shift.cashierName),
      amount: signed(money(shift.openingFloat)),
      shiftNo: shift.shiftNo,
      ...NOT_A_SALE,
      ...NOT_CASH,
      reason: null,
      shiftEvent: "open",
      registerName: shift.registerName,
      variance: null,
    },
  ];

  if (shift.closedAt) {
    const variance = shift.variance === null ? null : money(shift.variance);
    entries.push({
      id: `shift-close:${shift.id}`,
      kind: "shift",
      at: iso(shift.closedAt),
      actor: trimmed(shift.cashierName),
      amount: shift.countedCash === null ? null : signed(money(shift.countedCash)),
      shiftNo: shift.shiftNo,
      ...NOT_A_SALE,
      ...NOT_CASH,
      reason: null,
      shiftEvent: "close",
      registerName: shift.registerName,
      variance: variance === null ? null : signed(variance),
    });
  }

  return entries;
}

/**
 * Newest first, with a deterministic tie-break.
 *
 * Two events at the same instant are common — a sale and the override that
 * approved it share a `postedAt` to the millisecond — and an unstable order there
 * would make the screen reshuffle itself between refetches.
 */
export function buildTillActivity(input: {
  sales: TillActivitySaleRow[];
  movements: TillActivityMovementRow[];
  shifts: TillActivityShiftRow[];
}): TillActivityEntry[] {
  const entries = [
    ...input.sales.flatMap(saleActivityEntries),
    ...input.movements.map(movementActivityEntry),
    ...input.shifts.flatMap(shiftActivityEntries),
  ];

  return entries.sort((a, b) => {
    if (a.at === b.at) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return a.at < b.at ? 1 : -1;
  });
}

/** How many of each kind, for the chip row. Every kind is present, including zero. */
export function countTillActivity(
  entries: TillActivityEntry[],
): Record<TillActivityKind, number> {
  const counts = Object.fromEntries(
    ACTIVITY_KINDS.map((kind) => [kind, 0]),
  ) as Record<TillActivityKind, number>;
  for (const entry of entries) counts[entry.kind] += 1;
  return counts;
}

