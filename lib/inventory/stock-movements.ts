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

import type { AccountingSourceType, Prisma, StockMovement } from "@prisma/client";

import { reserveIdentifier } from "@/lib/id-generator";
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
  /** Signed for `ADJUSTMENT`; magnitude is used for everything else. */
  quantity: number;
  /** Must match the item's unit — a movement in the wrong unit is a wrong count. */
  unit: string;
  unitCost?: number | null;
  notes?: string | null;
  /** Required for `TRANSFER`, recorded but inert for the rest. */
  toLocationId?: string | null;
  /**
   * A caller-supplied reference. Left off, one is reserved from the
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
  previousStock: number;
  nextStock: number;
  /** Where the line sits afterwards. Only a `TRANSFER` changes it. */
  locationId: string;
};

/** Float on-hand against a typed-in decimal: compare at a sane precision. */
function sameQuantity(a: number, b: number) {
  return Number(a.toFixed(6)) === Number(b.toFixed(6));
}

export async function recordStockMovement(
  input: RecordStockMovementInput,
): Promise<RecordStockMovementResult> {
  const db = input.tx ?? prisma;

  const item = await db.inventoryItem.findUnique({
    where: { id: input.itemId },
    include: { site: { select: { companyId: true } } },
  });

  if (!item || item.site.companyId !== input.companyId) {
    throw new Error("Invalid inventory item.");
  }

  if (item.unit !== input.unit) {
    throw new Error("Stock unit mismatch.");
  }

  const absoluteQuantity = Math.abs(input.quantity);
  if (input.movementType === "ISSUE" && item.currentStock < absoluteQuantity) {
    throw new Error("Insufficient stock.");
  }

  let nextStock = item.currentStock;
  let nextLocationId = item.locationId;

  if (input.movementType === "RECEIPT") {
    nextStock += absoluteQuantity;
  } else if (input.movementType === "ISSUE") {
    nextStock -= absoluteQuantity;
  } else if (input.movementType === "ADJUSTMENT") {
    nextStock += input.quantity;
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

    const destination = await db.stockLocation.findUnique({
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
    if (!sameQuantity(absoluteQuantity, item.currentStock)) {
      throw new Error(
        `A transfer moves the whole stock line, because on-hand is held per site and not ` +
          `per location: ${item.currentStock} ${item.unit} on hand, ${absoluteQuantity} requested.`,
      );
    }

    nextLocationId = destination.id;
  }

  if (nextStock < 0) {
    throw new Error("Stock cannot be negative.");
  }

  const createdAt = input.entryDate ?? new Date();

  const writeMovement = async (tx: Prisma.TransactionClient) => {
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

    const created = await tx.stockMovement.create({
      data: {
        referenceId,
        itemId: input.itemId,
        toLocationId: input.toLocationId ?? undefined,
        movementType: input.movementType,
        quantity: input.movementType === "ADJUSTMENT" ? input.quantity : absoluteQuantity,
        unit: input.unit,
        notes: input.notes ?? undefined,
        issuedTo: input.issuedTo ?? undefined,
        requestedBy: input.requestedBy ?? undefined,
        approvedBy: input.approvedBy ?? undefined,
        photoUrl: input.photoUrl ?? undefined,
        issuedById: input.userId,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? undefined,
        createdAt,
      },
    });

    await tx.inventoryItem.update({
      where: { id: input.itemId },
      data: {
        currentStock: nextStock,
        ...(nextLocationId !== item.locationId ? { locationId: nextLocationId } : {}),
        ...(input.unitCost !== undefined && input.unitCost !== null ? { unitCost: input.unitCost } : {}),
      },
    });

    return created;
  };

  const movement = input.tx ? await writeMovement(input.tx) : await prisma.$transaction(writeMovement);

  return {
    movement,
    previousStock: item.currentStock,
    nextStock,
    locationId: nextLocationId,
  };
}
