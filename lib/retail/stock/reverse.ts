import type { AccountingSourceType, Prisma, StockMovementReason } from "@prisma/client";

import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { formatCount } from "@/lib/workspace/format";

import { POSTED_REASONS as POSTED, skipReason, type Skipped } from "./reverse-words";

export { POSTED_REASONS, REVERSIBLE_REASONS } from "./reverse-words";

/**
 * Putting movements back (30-stock W-28 step 3, 4.3).
 *
 * Only what was typed by hand is undone here: breakage, own use, found more,
 * a fixed mistake and a broken case. Each goes back with a movement the other
 * way — reason REVERSAL, the same reference, `reversesId` the original, which
 * is unique, so a movement is put back at most once. A case break is one
 * document of two legs; reversing either puts both back.
 *
 * Sales, deliveries, counts and transfers are documents with their own undo
 * (a refund, a supplier return, another count, cancelling the transfer), so
 * they are skipped, with why.
 */

type Original = {
  id: string;
  itemId: string;
  reason: StockMovementReason | null;
  reference: string | null;
  change: Prisma.Decimal;
  sourceType: AccountingSourceType | null;
  sourceId: string | null;
  notes: string | null;
  createdAt: Date;
  reversedBy: { id: string } | null;
  item: {
    unit: string;
    unitCost: Prisma.Decimal | null;
    currentStock: Prisma.Decimal;
    name: string;
    siteId: string;
    productId: string | null;
    product: { name: string } | null;
  };
};

const ORIGINAL_SELECT = {
  id: true,
  itemId: true,
  reason: true,
  reference: true,
  change: true,
  sourceType: true,
  sourceId: true,
  notes: true,
  createdAt: true,
  reversedBy: { select: { id: true } },
  item: {
    select: {
      unit: true,
      unitCost: true,
      currentStock: true,
      name: true,
      siteId: true,
      productId: true,
      product: { select: { name: true } },
    },
  },
} satisfies Prisma.StockMovementSelect;

/** Both legs of a case break: one reference, or (before breaks were numbered) one source and moment. */
async function caseLegs(companyId: string, leg: Original): Promise<Original[]> {
  const near = 5_000;
  const legs = await prisma.stockMovement.findMany({
    where: {
      reason: "CASE_BROKEN",
      item: { site: { companyId } },
      ...(leg.reference
        ? { reference: leg.reference }
        : {
            reference: null,
            sourceId: leg.sourceId,
            createdAt: { gte: new Date(leg.createdAt.getTime() - near), lte: new Date(leg.createdAt.getTime() + near) },
          }),
    },
    select: ORIGINAL_SELECT,
  });
  return legs.length ? legs : [leg];
}

export type ReversedMovement = {
  id: string;
  reference: string | null;
  /** The movement that put it back. */
  reversalId: string;
  reason: StockMovementReason;
  /** The reversal's own change: +2 for a reversed −2. */
  change: number;
  itemId: string;
  itemName: string;
  siteId: string;
  unitCost: number;
};

export type ReverseResult = { reversed: ReversedMovement[]; skipped: Skipped[] };

export class ReverseRefused extends Error {}

/**
 * Reverses what can be, in one transaction with one audit event per product.
 * Posting the books is the caller's: it follows the stock, outside the lock.
 */
export async function reverseMovements(input: { actor: RetailAuditActor; ids: string[] }): Promise<ReverseResult> {
  const { companyId } = input.actor;
  const ids = [...new Set(input.ids)];
  const found = await prisma.stockMovement.findMany({
    where: { id: { in: ids }, item: { site: { companyId }, productId: { not: null } } },
    select: ORIGINAL_SELECT,
  });
  const byId = new Map(found.map((movement) => [movement.id, movement]));

  const skipped: Skipped[] = [];
  const todo = new Map<string, Original>();
  for (const id of ids) {
    const movement = byId.get(id);
    if (!movement) {
      skipped.push({ id, reference: null, kind: "other", why: "That movement is not this shop's." });
      continue;
    }
    const skip = skipReason({ ...movement, reversed: Boolean(movement.reversedBy) });
    if (skip) {
      skipped.push(skip);
      continue;
    }
    const legs = movement.reason === "CASE_BROKEN" ? await caseLegs(companyId, movement) : [movement];
    for (const leg of legs) if (!leg.reversedBy) todo.set(leg.id, leg);
  }

  // Putting back stock that has since been sold would leave the line below
  // nothing; say so in words rather than as the ledger's refusal.
  const need = new Map<string, { total: Prisma.Decimal; leg: Original }>();
  for (const leg of todo.values()) {
    if (!leg.change.isPositive()) continue;
    const entry = need.get(leg.itemId);
    need.set(leg.itemId, { total: entry ? entry.total.plus(leg.change) : leg.change, leg });
  }
  for (const { total, leg } of need.values()) {
    if (leg.item.currentStock.lessThan(total)) {
      throw new ReverseRefused(
        `Only ${formatCount(leg.item.currentStock.toNumber())} ${leg.item.product?.name ?? leg.item.name} on hand to take back off; ${leg.reference ?? "it"} added ${formatCount(total.toNumber())}.`,
      );
    }
  }

  if (todo.size === 0) return { reversed: [], skipped };

  // Increases first, so a case break's singles go back before the case does.
  const legs = [...todo.values()].sort((a, b) => a.change.comparedTo(b.change));
  const reversed = await prisma.$transaction(async (tx) => {
    const out: ReversedMovement[] = [];
    for (const leg of legs) {
      const { movement } = await recordStockMovement({
        tx,
        companyId,
        userId: input.actor.userId,
        itemId: leg.itemId,
        movementType: "ADJUSTMENT",
        quantity: leg.change.negated(),
        unit: leg.item.unit,
        notes: `Reversed ${leg.reference ?? "a movement"}`,
        sourceType: leg.sourceType ?? "RETAIL_STOCK_ADJUSTMENT",
        sourceId: `reversal:${leg.id}`,
        reason: "REVERSAL",
        reference: leg.reference,
        reversesId: leg.id,
      });
      out.push({
        id: leg.id,
        reference: leg.reference,
        reversalId: movement.id,
        reason: leg.reason!,
        change: leg.change.negated().toNumber(),
        itemId: leg.itemId,
        itemName: leg.item.product?.name ?? leg.item.name,
        siteId: leg.item.siteId,
        unitCost: leg.item.unitCost?.toNumber() ?? 0,
      });
    }

    const byProduct = new Map<string, Set<string>>();
    for (const leg of legs) {
      const productId = leg.item.productId!;
      const refs = byProduct.get(productId) ?? new Set<string>();
      if (leg.reference) refs.add(leg.reference);
      byProduct.set(productId, refs);
    }
    for (const [productId, references] of byProduct) {
      await writeRetailAuditEvent(tx, {
        actor: input.actor,
        eventType: RETAIL_AUDIT_EVENTS.movementsReversed,
        entityType: "Product",
        entityId: productId,
        payload: { references: [...references] },
      });
    }
    return out;
  });

  return { reversed, skipped };
}

/**
 * What the adjustment put on the books: its journal's debits. An adjustment
 * whose posting has not landed is valued as it would have been, at the
 * line's cost.
 */
async function postedValue(movement: ReversedMovement, companyId: string): Promise<number> {
  const entry = await prisma.journalEntry.findFirst({
    where: { companyId, sourceType: "RETAIL_STOCK_ADJUSTMENT", sourceId: movement.id },
    select: { lines: { select: { debit: true } } },
  });
  const posted = entry ? entry.lines.reduce((sum, line) => sum + line.debit, 0) : null;
  return Math.round((posted ?? Math.abs(movement.change) * movement.unitCost) * 100) / 100;
}

/**
 * The books follow an adjustment put back: the opposite of what it posted,
 * found by the original movement's id (STK-04 posts each adjustment under
 * it). Null when there is nothing to post. The caller hands it to
 * `postRetailJournal` after the commit.
 */
export async function reversalJournal(movement: ReversedMovement, actor: { companyId: string; userId: string; role: string | null }) {
  if (!POSTED.has(movement.reason)) return null;
  const value = await postedValue(movement, actor.companyId);
  if (value <= 0) return null;
  const loss = movement.change < 0;
  return {
    companyId: actor.companyId,
    sourceType: "RETAIL_STOCK_ADJUSTMENT" as const,
    sourceId: movement.reversalId,
    sourceSubtype: loss ? "LOSS" : "GAIN",
    siteId: movement.siteId,
    entryDate: new Date(),
    description: `Reversed stock adjustment ${movement.reference ?? ""}`.trim(),
    createdById: actor.userId,
    actorRole: actor.role,
    amount: value,
    netAmount: value,
    taxAmount: 0,
    grossAmount: value,
    invertDirection: loss,
    inventory: {
      lines: [
        {
          inventoryItemId: movement.itemId,
          itemName: movement.itemName,
          quantity: Math.abs(movement.change),
          unitCost: Math.round((value / Math.abs(movement.change)) * 100) / 100,
          totalCost: value,
        },
      ],
      totalCost: value,
    },
  };
}
