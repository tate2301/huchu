import type { Prisma, PrismaClient } from "@prisma/client";

import { reserveIdentifier } from "@/lib/id-generator";
import { snapshotGoldUsdValue } from "@/lib/gold/valuation";
import { recordInventoryEvent } from "@/lib/gold/inventory";

type Db = PrismaClient | Prisma.TransactionClient;

export type FifoSaleResult = {
  consumedGrams: number;
  remainingGrams: number;
  receiptIds: string[];
  consumedPourIds: string[];
  isAnomaly: boolean;
};

/**
 * Walks unsold pours for a site (oldest first), creating one BuyerReceipt
 * per consumed pour to cover up to {@link saleGrams}.
 *
 * If the pool is too thin, returns isAnomaly=true with the deficit; the caller
 * is expected to record a GoldException to surface the gap.
 */
export async function linkFifoSale(
  db: Db,
  input: {
    companyId: string;
    siteId: string;
    saleGrams: number;
    saleDate: Date;
    paymentMethod?: string;
    notes?: string;
    sourceLabel?: string; // e.g., "ledger import line 17"
    createdById?: string;
  },
): Promise<FifoSaleResult> {
  const result: FifoSaleResult = {
    consumedGrams: 0,
    remainingGrams: input.saleGrams,
    receiptIds: [],
    consumedPourIds: [],
    isAnomaly: false,
  };

  if (input.saleGrams <= 0) return result;

  // Pool of pours not yet receipted, oldest first.
  //
  // `pour.receipts` is the back-relation of BuyerReceipt.goldPourId, so
  // `receipts: { none: {} }` means "no BuyerReceipt covers this specific
  // pour" — which is the per-pour check we want for both direct sales
  // AND for dispatch-routed sales where the batch-receipt endpoint sets
  // goldPourId on every item.
  //
  // For multi-batch dispatches, this naturally allows an unsold sibling
  // batch to remain in the pool even when other batches in the same
  // dispatch have already been sold. (The previous "every dispatch has
  // no receipts" filter incorrectly excluded these.)
  //
  // Edge case: legacy receipts created with goldDispatchId set but
  // goldPourId null — those are excluded by also rejecting any pour that
  // shares a dispatch with such a "whole-dispatch" receipt.
  const candidates = await db.goldPour.findMany({
    where: {
      siteId: input.siteId,
      site: { companyId: input.companyId },
      receipts: { none: {} },
      NOT: {
        dispatches: {
          some: {
            buyerReceipts: {
              some: { goldPourId: null },
            },
          },
        },
      },
    },
    orderBy: { pourDate: "asc" },
    select: { id: true, grossWeight: true, pourDate: true, pourBarId: true },
  });

  for (const pour of candidates) {
    if (result.remainingGrams <= 0) break;
    const take = Math.min(pour.grossWeight, result.remainingGrams);
    if (take <= 0) continue;

    const valuation = await snapshotGoldUsdValue({
      companyId: input.companyId,
      businessDate: input.saleDate,
      grams: take,
    });
    const paidValueUsd = valuation?.valueUsd ?? null;

    const receiptNumber = await reserveIdentifier(db, {
      companyId: input.companyId,
      entity: "GOLD_RECEIPT",
    });

    const receipt = await db.buyerReceipt.create({
      data: {
        goldPourId: pour.id,
        receiptNumber,
        receiptDate: input.saleDate,
        paidAmount: paidValueUsd ?? 0,
        paidValueUsd,
        goldPriceUsdPerGram: valuation?.goldPriceUsdPerGram,
        valuationDate: valuation?.valuationDate,
        paymentMethod: input.paymentMethod ?? "CASH",
        notes: [
          input.sourceLabel ? `Auto-linked from ${input.sourceLabel}` : null,
          input.notes ?? null,
          `Consumed ${take.toFixed(3)} g of pour ${pour.pourBarId}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
      select: { id: true },
    });

    await recordInventoryEvent(db, {
      companyId: input.companyId,
      siteId: input.siteId,
      eventDate: input.saleDate,
      direction: "OUT",
      grams: take,
      sourceType: "RECEIPT",
      sourceId: receipt.id,
      notes: `FIFO sale link: ${input.sourceLabel ?? "ledger"} (pour ${pour.pourBarId})`,
      createdById: input.createdById ?? null,
      goldPriceUsdPerGram: valuation?.goldPriceUsdPerGram ?? null,
      valueUsd: paidValueUsd,
      skipValuation: true,
    });

    result.consumedGrams += take;
    result.remainingGrams -= take;
    result.receiptIds.push(receipt.id);
    result.consumedPourIds.push(pour.id);
  }

  if (result.remainingGrams > 0.0001) {
    result.isAnomaly = true;
  } else {
    result.remainingGrams = 0;
  }

  return result;
}
