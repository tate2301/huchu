import type { Prisma, PrismaClient } from "@prisma/client";

import { reserveIdentifier } from "@/lib/id-generator";
import { snapshotGoldUsdValue } from "@/lib/gold/valuation";
import { recordInventoryEvent } from "@/lib/gold/inventory";

type Db = PrismaClient | Prisma.TransactionClient;

export type FifoSaleResult = {
  consumedGrams: number;
  remainingGrams: number;
  /**
   * Receipt ID for the single aggregate BuyerReceipt this call produced (null
   * when no pours were available and no receipt was created — i.e. an
   * unsold/anomalous request with consumedGrams==0).
   */
  receiptId: string | null;
  /** Pour IDs consumed by this receipt (one BuyerReceiptBatch per pour). */
  consumedPourIds: string[];
  isAnomaly: boolean;
};

/**
 * Walks unsold pours for a site (oldest first), creating ONE aggregate
 * BuyerReceipt with N attached BuyerReceiptBatch rows to cover up to
 * {@link saleGrams}.
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
    receiptId: null,
    consumedPourIds: [],
    isAnomaly: false,
  };

  if (input.saleGrams <= 0) return result;

  // Serialise FIFO consumption per site. Concurrent linkFifoSale calls on the
  // same site would otherwise both see the same pour as available and double-
  // consume it. The lock is automatically released when the transaction ends.
  // db MUST be a transaction client for pg_advisory_xact_lock to be effective.
  // See review doc §3.3 P0-1.
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'gold-fifo:' + input.siteId}))`;

  // Pool of pours not yet receipted, oldest first. We now use the new
  // BuyerReceiptBatch join: a pour is "unsold" if no batch row points to
  // it. The legacy single-FK BuyerReceipt.goldPourId is also covered
  // because the backfill script and the receipt creation paths in this
  // codebase always create a BuyerReceiptBatch alongside legacy fields.
  //
  // Edge case: legacy receipts created with goldDispatchId set but
  // goldPourId null — those are excluded by also rejecting any pour that
  // shares a dispatch with such a "whole-dispatch" receipt (either via
  // legacy BuyerReceipt or via the new BuyerReceiptDispatch join).
  const candidates = await db.goldPour.findMany({
    where: {
      siteId: input.siteId,
      site: { companyId: input.companyId },
      receiptBatches: { none: {} },
      receipts: { none: {} },
      NOT: {
        dispatches: {
          some: {
            OR: [
              { buyerReceipts: { some: { goldPourId: null } } },
              { receiptDispatches: { some: {} } },
            ],
          },
        },
      },
    },
    orderBy: { pourDate: "asc" },
    select: { id: true, grossWeight: true, pourDate: true, pourBarId: true },
  });

  // Plan the FIFO walk first so we can size the aggregate receipt before
  // creating it.
  type PlannedTake = {
    pourId: string;
    pourBarId: string;
    take: number;
  };
  const plan: PlannedTake[] = [];
  let remaining = input.saleGrams;
  for (const pour of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(pour.grossWeight, remaining);
    if (take <= 0) continue;
    plan.push({ pourId: pour.id, pourBarId: pour.pourBarId, take });
    remaining -= take;
  }

  if (plan.length === 0) {
    result.isAnomaly = true;
    return result;
  }

  // Snapshot a single price-of-the-day for the entire receipt: gold prices
  // are stored as USD/g (per the team), and a sale that spans multiple
  // pours all closes at the same business-date price. Each batch row gets
  // its own grams * price valueUsd derived from the same snapshot.
  const consumedGrams = plan.reduce((sum, p) => sum + p.take, 0);
  const headerValuation = await snapshotGoldUsdValue({
    companyId: input.companyId,
    businessDate: input.saleDate,
    grams: consumedGrams,
  });
  const headerPaidValueUsd = headerValuation?.valueUsd ?? null;
  const goldPriceUsdPerGram = headerValuation?.goldPriceUsdPerGram ?? null;
  const valuationDate = headerValuation?.valuationDate ?? null;

  const receiptNumber = await reserveIdentifier(db, {
    companyId: input.companyId,
    entity: "GOLD_RECEIPT",
  });

  const sourceLabelLine = input.sourceLabel
    ? `Auto-linked from ${input.sourceLabel}`
    : null;
  const consumedSummary = plan
    .map((p) => `${p.take.toFixed(3)} g of ${p.pourBarId}`)
    .join(", ");

  // Single aggregate header receipt. We populate the legacy goldPourId
  // with the FIRST consumed pour for backward compatibility (existing
  // ledger entry rows already store buyerReceiptId, and existing UI
  // fall-throughs read goldPour). The batches relation is the source of
  // truth going forward.
  const receipt = await db.buyerReceipt.create({
    data: {
      goldPourId: plan[0].pourId,
      receiptNumber,
      receiptDate: input.saleDate,
      paidAmount: headerPaidValueUsd ?? 0,
      paidValueUsd: headerPaidValueUsd,
      goldPriceUsdPerGram,
      valuationDate,
      paymentMethod: input.paymentMethod ?? "CASH",
      notes: [
        sourceLabelLine,
        input.notes ?? null,
        `Consumed ${consumedGrams.toFixed(3)} g across ${plan.length} batch${plan.length === 1 ? "" : "es"} (${consumedSummary})`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    select: { id: true },
  });

  // Per-pour batch rows + per-pour inventory OUT events. One inventory
  // event per consumed pour preserves the receipt → event traceability the
  // rest of the system relies on.
  for (const step of plan) {
    const batchValueUsd =
      goldPriceUsdPerGram != null
        ? Math.round(step.take * goldPriceUsdPerGram * 100) / 100
        : null;

    await db.buyerReceiptBatch.create({
      data: {
        buyerReceiptId: receipt.id,
        goldPourId: step.pourId,
        grams: step.take,
        valueUsd: batchValueUsd,
        goldPriceUsdPerGram,
      },
    });

    await recordInventoryEvent(db, {
      companyId: input.companyId,
      siteId: input.siteId,
      eventDate: input.saleDate,
      direction: "OUT",
      grams: step.take,
      sourceType: "RECEIPT",
      sourceId: receipt.id,
      notes: `FIFO sale link: ${input.sourceLabel ?? "ledger"} (pour ${step.pourBarId})`,
      createdById: input.createdById ?? null,
      goldPriceUsdPerGram,
      valueUsd: batchValueUsd,
      skipValuation: true,
    });

    result.consumedGrams += step.take;
    result.consumedPourIds.push(step.pourId);
  }

  result.receiptId = receipt.id;
  result.remainingGrams = +(input.saleGrams - result.consumedGrams).toFixed(4);
  if (result.remainingGrams > 0.0001) {
    result.isAnomaly = true;
  } else {
    result.remainingGrams = 0;
  }

  return result;
}
