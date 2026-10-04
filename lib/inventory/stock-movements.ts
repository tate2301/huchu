/**
 * The one way stock moves.
 *
 * S-2. This began as `recordRetailInventoryMovement` in
 * `app/api/v2/retail/_helpers.ts`, which was the better of the repository's two
 * stock writers — it took an optional transaction client, reserved its reference
 * atomically, and checked the tenant, the unit and the resulting balance. The
 * other writer was hand-rolled inline in `app/api/inventory/movements/route.ts`
 * POST and did the same job worse. Two writers meant two sets of rules, and the
 * rules had already drifted.
 *
 * So it moves into core, loses the retail prefix, and becomes the only function
 * that is allowed to change `InventoryItem.currentStock`. Every module posts
 * through it.
 */

import { randomUUID } from "node:crypto";

import type { AccountingSourceType, Prisma, StockMovement, StockMovementReason } from "@prisma/client";

import { reserveIdentifier } from "@/lib/id-generator";
import { money, quantity as toQuantity, type MoneyLike, ZERO } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export type StockMovementType = "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "TRANSFER";

/**
 * What caused the movement.
 *
 * Deliberately the whole `AccountingSourceType` vocabulary rather than a private
 * union. These values were always being handed straight to
 * `createJournalEntryFromSource`, so a second enum would be the same list under
 * another name — and every module that wants to post stock (schools, gold, CRM,
 * scrap) already has its kinds in there. The retail values that this function
 * was born with are all still in it; an audit trail may gain a value and must
 * never lose one.
 */
export type StockMovementSourceType = AccountingSourceType;

export type RecordStockMovementInput = {
  companyId: string;
  userId: string;
  itemId: string;
  movementType: StockMovementType;
  /**
   * Signed for `ADJUSTMENT`; magnitude is used for everything else.
   *
   * S-1 — `MoneyLike`, not `number`. Callers hold on-hand as `Decimal` now, and
   * a signature that took `number` forced every one of them to convert on the
   * way in and back on the way out. Two conversions per call is two chances to
   * put a double between a count and the column it lands in.
   */
  quantity: MoneyLike;
  /** Must match the item's unit — a movement in the wrong unit is a wrong count. */
  unit: string;
  /** Money, at `Decimal(14,2)`. What the shop paid for one of these. */
  unitCost?: MoneyLike;
  notes?: string | null;
  /** Required for `TRANSFER`, recorded but inert for the rest. */
  toLocationId?: string | null;
  /**
   * Why it moved, in the shop's words. Required, so no retail caller can
   * forget it: retail always says, and the stores module — whose movements are
   * typed by hand and carry no reason a shop would read — passes null.
   */
  reason: StockMovementReason | null;
  /**
   * The document number a person reads (SALE-31862, GRN-0004, ADJ-0031),
   * shared by every movement that document made. Null when there is none: the
   * stores module, a move between places.
   */
  reference: string | null;
  /** On a reversal, the movement it puts back. A movement is reversed at most once. */
  reversesId?: string | null;
  /**
   * This row's own identifier. Left off, one is reserved from the
   * `STOCK_MOVEMENT` sequence.
   */
  referenceId?: string | null;
  issuedTo?: string | null;
  requestedBy?: string | null;
  approvedBy?: string | null;
  photoUrl?: string | null;
  sourceType: StockMovementSourceType;
  /**
   * The causing document. Null for a movement posted by hand, which has no
   * upstream document — the movement is the document.
   */
  sourceId?: string | null;
  entryDate?: Date;
  tx?: Prisma.TransactionClient;
};

export type RecordStockMovementResult = {
  movement: StockMovement;
  /*
    S-1 — `Decimal`, matching the column.

    These were `number`, which meant every caller that reported an on-hand
    figure took it back out of a double after the row had gone in as `numeric`.
    A caller that wants a number says so with `toNumberOrZero`; a caller that
    is about to do arithmetic no longer has to.
  */
  previousStock: Prisma.Decimal;
  nextStock: Prisma.Decimal;
  /** Where the line sits afterwards. Only a `TRANSFER` changes it. */
  locationId: string;
};

/*
  S-1. This was `Number(a.toFixed(6)) === Number(b.toFixed(6))` — an epsilon
  comparison, the exact pattern R-1.1 retired from retail, surviving here because
  on-hand was a double and `===` on two doubles is a coin toss. With both sides
  `Decimal` the comparison is exact and the helper is gone; `.equals()` says it
  better than a named function could.
*/

/**
 * Moves stock on one line and writes the movement that says so.
 *
 * STK-01. Every movement now carries its own story: `reason`, `reference`, the
 * signed `change` and the line's `balanceAfter`, so a balance can be shown
 * without replaying history.
 *
 * It runs in one transaction — the caller's, or its own — and takes three
 * steps in a fixed order:
 *
 *  1. Reserve the row's `referenceId` (unless the caller brought one). That
 *     sequence row is global, so every movement-writing transaction queues on
 *     it here, before it holds anything else. Taking it first is what keeps a
 *     sale of [A, B] and a sale of [B, A] from deadlocking on the line locks.
 *  2. Lock the line (`SELECT … FOR UPDATE`) and only then read on hand. This
 *     used to read and write `currentStock` with no lock, so two sales at once
 *     could each read 1, each sell it, and leave 0 where −1 was refused.
 *  3. Write the movement and the new on hand.
 *
 * Balances follow (createdAt, id) order, the order every ledger screen reads.
 * A movement dated earlier than ones already written (the stores module's
 * back-dated entries, or a sale whose `postedAt` was stamped a moment before a
 * sale that committed first) slots in where its date puts it: its balance is
 * today's on hand less what the later rows changed, and those later rows each
 * move by this one's change. The newest row therefore always holds on hand.
 */
export async function recordStockMovement(
  input: RecordStockMovementInput,
): Promise<RecordStockMovementResult> {
  return input.tx ? writeMovement(input.tx, input) : prisma.$transaction((tx) => writeMovement(tx, input));
}

async function writeMovement(
  tx: Prisma.TransactionClient,
  input: RecordStockMovementInput,
): Promise<RecordStockMovementResult> {
  // No retry loop here: reserveIdentifier uses an atomic sequence increment so
  // P2002 collisions on stockMovement.create are not expected. A retry loop that
  // catches P2002 and continues inside a PostgreSQL transaction would leave the
  // transaction in an "aborted" state, causing every subsequent query to fail with
  // "current transaction is aborted". Let any error propagate cleanly — a caller
  // that supplied its own `referenceId` and wants to retry must do so outside.
  const referenceId =
    input.referenceId ??
    (await reserveIdentifier(tx, {
      companyId: input.companyId,
      entity: "STOCK_MOVEMENT",
    }));

  await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${input.itemId} FOR UPDATE`;

  const item = await tx.inventoryItem.findUnique({
    where: { id: input.itemId },
    include: { site: { select: { companyId: true } } },
  });

  if (!item || item.site.companyId !== input.companyId) {
    throw new Error("Invalid inventory item.");
  }

  if (item.unit !== input.unit) {
    throw new Error("Stock unit mismatch.");
  }

  if (input.reversesId) {
    const original = await tx.stockMovement.findUnique({
      where: { id: input.reversesId },
      select: { itemId: true },
    });
    if (!original || original.itemId !== item.id) {
      throw new Error("A reversal puts back a movement on the same stock line.");
    }
  }

  const requested = toQuantity(input.quantity);
  const absoluteQuantity = requested.abs();
  if (input.movementType === "ISSUE" && item.currentStock.lessThan(absoluteQuantity)) {
    throw new Error("Insufficient stock.");
  }

  let change = ZERO;
  let nextLocationId = item.locationId;

  if (input.movementType === "RECEIPT") {
    change = absoluteQuantity;
  } else if (input.movementType === "ISSUE") {
    change = absoluteQuantity.negated();
  } else if (input.movementType === "ADJUSTMENT") {
    // Signed on purpose: an adjustment is the one movement that can go either
    // way, and `requested` keeps the sign `absoluteQuantity` threw away.
    change = requested;
  } else {
    // TRANSFER — the one movement that changes a location and not a quantity.
    //
    // `InventoryItem` holds **one** on-hand figure per (site, itemCode). There is
    // no per-location or per-bin quantity anywhere in the schema, and inventing
    // one is out of scope (`retail-stock-consolidation-plan-2026-08-13.md` §4 —
    // a bottle store with one shop does not need it; a second branch would).
    // Every rule below follows from that single fact:
    //
    //  - Same site, different location: the only transfer the model can honestly
    //    represent. What moves is `InventoryItem.locationId` — the line is
    //    reclassified from the storeroom to the shop floor. The quantity is
    //    untouched, because the site still holds exactly as many bottles.
    //
    //  - Part of the line: refused. Moving 5 of 20 would have to leave 15 behind
    //    at the old location and there is no field that can hold "15 here, 5
    //    there". The alternatives are to relocate all 20 while the movement row
    //    claims 5, or to write a row and move nothing — which is precisely the
    //    bug this replaces. Refusing loudly, naming the on-hand figure, is the
    //    only answer that does not put a false fact in the ledger. When
    //    per-location quantity lands, this is the restriction that lifts.
    //
    //  - Across sites: refused. That is not a reclassification; it is stock
    //    leaving one site's balance and joining another's, and no single row can
    //    express both halves. Issue at the sender, receive at the receiver — two
    //    facts, two rows, both true.
    if (!input.toLocationId) {
      throw new Error("A transfer needs a destination location.");
    }

    const destination = await tx.stockLocation.findUnique({
      where: { id: input.toLocationId },
      select: { id: true, siteId: true, isActive: true },
    });

    if (!destination || !destination.isActive) {
      throw new Error("Invalid transfer destination location.");
    }
    if (destination.siteId !== item.siteId) {
      throw new Error(
        "Stock cannot be transferred between sites: on-hand is held per site, so one row " +
          "cannot leave one balance and join another. Issue it at the sending site and " +
          "receive it at the receiving one.",
      );
    }
    if (destination.id === item.locationId) {
      throw new Error("Transfer destination must differ from the source location.");
    }
    if (!absoluteQuantity.equals(item.currentStock)) {
      throw new Error(
        `A transfer moves the whole stock line, because on-hand is held per site and not ` +
          `per location: ${item.currentStock} ${item.unit} on hand, ${absoluteQuantity} requested.`,
      );
    }

    nextLocationId = destination.id;
  }

  const nextStock = item.currentStock.plus(change);
  if (nextStock.lessThan(ZERO)) {
    throw new Error("Stock cannot be negative.");
  }

  const id = randomUUID();
  const createdAt = input.entryDate ?? new Date();

  // Rows already later than this one in (createdAt, id) order.
  const later: Prisma.StockMovementWhereInput = {
    itemId: item.id,
    OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }],
  };
  const after = await tx.stockMovement.aggregate({ where: later, _sum: { change: true }, _count: true });
  const balanceAfter = nextStock.minus(after._sum.change ?? ZERO);
  if (after._count > 0 && !change.isZero()) {
    await tx.stockMovement.updateMany({ where: later, data: { balanceAfter: { increment: change } } });
  }

  const movement = await tx.stockMovement.create({
    data: {
      id,
      referenceId,
      itemId: item.id,
      toLocationId: input.toLocationId ?? undefined,
      movementType: input.movementType,
      // `requested` is `input.quantity` already through `quantity()`, so the row
      // and the on-hand figure it moves are rounded by the same rule.
      quantity: input.movementType === "ADJUSTMENT" ? requested : absoluteQuantity,
      unit: input.unit,
      notes: input.notes ?? undefined,
      issuedTo: input.issuedTo ?? undefined,
      requestedBy: input.requestedBy ?? undefined,
      approvedBy: input.approvedBy ?? undefined,
      photoUrl: input.photoUrl ?? undefined,
      issuedById: input.userId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? undefined,
      reason: input.reason,
      reference: input.reference,
      change,
      balanceAfter,
      reversesId: input.reversesId ?? null,
      createdAt,
    },
  });

  await tx.inventoryItem.update({
    where: { id: item.id },
    data: {
      currentStock: nextStock,
      ...(nextLocationId !== item.locationId ? { locationId: nextLocationId } : {}),
      ...(input.unitCost !== undefined && input.unitCost !== null ? { unitCost: money(input.unitCost) } : {}),
    },
  });

  return {
    movement,
    previousStock: item.currentStock,
    nextStock,
    locationId: nextLocationId,
  };
}
