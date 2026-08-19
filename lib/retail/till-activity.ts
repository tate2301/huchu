/**
 * What this till has done, assembled from the rows that already record it.
 *
 * S-7.6. `docs/design-system/portals/pos.html` puts an *Audit log* on the till
 * (`renderAudit`): a filter chip per kind, a row per event with a timestamp, a
 * type badge, a summary, who did it, and a signed amount.
 *
 * ── This is a derived view, and it is not an audit log ─────────────────────
 *
 * The plan's §1.6 said "zero audit events" and that is still true: nothing under
 * `app/api/v2/retail/**` or `lib/retail/**` calls `writePlatformAuditEvent`. The
 * hash-chained `PlatformAuditEvent` writer exists and payroll, disbursements and
 * schools use it; retail does not, and inventing a parallel trail for one screen
 * would be worse than not having one.
 *
 * So this reads the domain rows themselves — `RetailSale`, `RetailCashMovement`,
 * `RetailShift` — each of which already carries an actor and a timestamp, and
 * arranges them into one timeline. The difference matters and the screen says so
 * out loud:
 *
 *  - **It only sees what leaves a row.** A sale, a refund, a void, a cash
 *    movement and a shift boundary each write a durable record, so they appear. A
 *    failed PIN attempt, a cart discarded before tender, a manager override that
 *    was refused, a price *looked at* — none of those write anything, so none of
 *    them can appear here however much a shop would want them to.
 *  - **It is not tamper-evident.** `PlatformAuditEvent` chains each row's hash to
 *    the one before it, so a deletion is detectable. A `RetailSale` deleted
 *    straight out of the database leaves this timeline shorter and no wiser.
 *  - **It is reconstructed, not recorded.** If the shape of a sale changes, this
 *    view changes retroactively. A real audit event is frozen at write time.
 *
 * Making it an audit log is a separate, larger ticket: `writeRetailAuditEvent`
 * alongside `lib/schools/audit.ts`, called inside the same transaction as each
 * write in `_services.ts`, plus the non-row events above gaining a call site.
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

import { money, type MoneyLike } from "@/lib/money";
import {
  RETAIL_CASH_MOVEMENT_LABELS,
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
  type TillActivityEntry,
  type TillActivityKind,
} from "./till-activity-shared";

import {
  TILL_ACTIVITY_KINDS as ACTIVITY_KINDS,
  type TillActivityEntry,
  type TillActivityKind,
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
  postedAt: Date | string | null;
  createdAt: Date | string;
  shiftNo: string | null;
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

const SALE_TITLE: Record<TillActivitySaleRow["saleType"], string> = {
  SALE: "Sale",
  REFUND: "Refund",
  VOID: "Void",
};

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

  const detail = [trimmed(sale.customerName), currencyNote].filter(Boolean).join(" · ") || null;

  const entries: TillActivityEntry[] = [
    {
      id: `sale:${sale.id}`,
      kind: SALE_KIND[sale.saleType],
      at,
      title: `${SALE_TITLE[sale.saleType]} ${sale.saleNo}`,
      // On a reversal `overrideReason` is the reason for the reversal itself, so
      // it belongs here rather than on an override line that never happened.
      detail:
        sale.saleType === "SALE"
          ? detail
          : [trimmed(sale.overrideReason), detail].filter(Boolean).join(" · ") || null,
      actor: trimmed(sale.cashierName),
      amount: signed(baseAmount),
      shiftNo: sale.shiftNo,
    },
  ];

  const override = sale.saleType === "SALE" ? trimmed(sale.overrideReason) : null;
  if (override) {
    entries.push({
      id: `override:${sale.id}`,
      kind: "override",
      at,
      title: `Price override on ${sale.saleNo}`,
      detail: override,
      actor: trimmed(sale.cashierName),
      // The override's own value is not a column anywhere; showing the sale's
      // total beside it would read as the size of the discount, which it is not.
      amount: null,
      shiftNo: sale.shiftNo,
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
    title: RETAIL_CASH_MOVEMENT_LABELS[movement.type],
    detail:
      [RETAIL_CASH_MOVEMENT_REASON_LABELS[movement.reasonCode], trimmed(movement.reason)]
        .filter(Boolean)
        .join(" · ") || null,
    actor: trimmed(movement.recordedByName),
    amount: signed(amount),
    shiftNo: movement.shiftNo,
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
      title: `Till opened · ${shift.shiftNo}`,
      detail: `${shift.registerName} · float counted in`,
      actor: trimmed(shift.cashierName),
      amount: signed(money(shift.openingFloat)),
      shiftNo: shift.shiftNo,
    },
  ];

  if (shift.closedAt) {
    const variance = shift.variance === null ? null : money(shift.variance);
    entries.push({
      id: `shift-close:${shift.id}`,
      kind: "shift",
      at: iso(shift.closedAt),
      title: `Till closed · ${shift.shiftNo}`,
      detail:
        variance === null || variance.isZero()
          ? `${shift.registerName} · drawer agreed`
          : `${shift.registerName} · drawer ${variance.isNegative() ? "short" : "over"} ${variance.abs().toFixed(2)}`,
      actor: trimmed(shift.cashierName),
      amount: shift.countedCash === null ? null : signed(money(shift.countedCash)),
      shiftNo: shift.shiftNo,
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

