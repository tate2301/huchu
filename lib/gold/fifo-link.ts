import type { Prisma, PrismaClient } from "@prisma/client";

import { reserveIdentifier } from "@/lib/id-generator";
import { snapshotGoldUsdValue } from "@/lib/gold/valuation";
import { recordInventoryEvent } from "@/lib/gold/inventory";

type Db = PrismaClient | Prisma.TransactionClient;

export type PlannedBatch = {
  pourId: string;
  pourBarId: string;
  siteId: string;
  siteName: string;
  pourDate: Date;
  grams: number;
  valueUsd: number | null;
};

export type FifoSalePlan = {
  consumedGrams: number;
  remainingGrams: number;
  isAnomaly: boolean;
  plannedBatches: PlannedBatch[];
  totalUsd: number | null;
  priceUsdPerGram: number | null;
  priceSource: "CONFIGURED" | "LIVE" | "FALLBACK" | null;
  isCrossSite: boolean;
};

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

/** Shared pool query — same filter used by both plan and execute paths. */
async function fetchFifoPool(
  db: Db,
  input: { companyId: string; siteId: string; directPourIds?: string[] },
) {
  if (input.directPourIds && input.directPourIds.length > 0) {
    return db.goldPour.findMany({
      where: {
        id: { in: input.directPourIds },
        companyId: input.companyId,
        receiptBatches: { none: {} },
        receipts: { none: {} },
      },
      orderBy: { pourDate: "asc" },
      select: {
        id: true,
        grossWeight: true,
        pourDate: true,
        pourBarId: true,
        siteId: true,
        site: { select: { name: true } },
      },
    });
  }
  return db.goldPour.findMany({
    where: {
      siteId: input.siteId,
      companyId: input.companyId,
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
    select: {
      id: true,
      grossWeight: true,
      pourDate: true,
      pourBarId: true,
      siteId: true,
      site: { select: { name: true } },
    },
  });
}

/**
 * Read-only projection of what linkFifoSale would consume. Does not write
 * anything. Callers use this for live FIFO preview in the UI.
 */
export async function planFifoSale(
  db: Db,
  input: {
    companyId: string;
    siteId: string;
    saleGrams: number;
    saleDate: Date;
    directPourIds?: string[];
  },
): Promise<FifoSalePlan> {
  const empty: FifoSalePlan = {
    consumedGrams: 0,
    remainingGrams: input.saleGrams,
    isAnomaly: false,
    plannedBatches: [],
    totalUsd: null,
    priceUsdPerGram: null,
    priceSource: null,
    isCrossSite: false,
  };

  if (input.saleGrams <= 0) return empty;

  const candidates = await fetchFifoPool(db, {
    companyId: input.companyId,
    siteId: input.siteId,
    directPourIds: input.directPourIds,
  });

  const plannedBatches: PlannedBatch[] = [];
  let remaining = input.saleGrams;
  for (const pour of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(Number(pour.grossWeight), remaining);
    if (take <= 0) continue;
    plannedBatches.push({
      pourId: pour.id,
      pourBarId: pour.pourBarId,
      siteId: pour.siteId,
      siteName: pour.site.name,
      pourDate: pour.pourDate,
      grams: take,
      valueUsd: null, // filled in after price snapshot
    });
    remaining -= take;
  }

  const consumedGrams = plannedBatches.reduce((s, b) => s + b.grams, 0);
  const remainingGrams = +(input.saleGrams - consumedGrams).toFixed(4);
  const isAnomaly = remainingGrams > 0.0001;

  const valuation = await snapshotGoldUsdValue({
    companyId: input.companyId,
    businessDate: input.saleDate,
    grams: consumedGrams,
  });
  const priceUsdPerGram = valuation?.goldPriceUsdPerGram ?? null;

  for (const batch of plannedBatches) {
    batch.valueUsd =
      priceUsdPerGram != null
        ? Math.round(batch.grams * priceUsdPerGram * 100) / 100
        : null;
  }

  const totalUsd =
    priceUsdPerGram != null
      ? Math.round(consumedGrams * priceUsdPerGram * 100) / 100
      : null;

  const siteIds = new Set(plannedBatches.map((b) => b.siteId));
  const isCrossSite = siteIds.size > 1;

  return {
    consumedGrams,
    remainingGrams: isAnomaly ? remainingGrams : 0,
    isAnomaly,
    plannedBatches,
    totalUsd,
    priceUsdPerGram,
    priceSource: valuation ? "CONFIGURED" : null,
    isCrossSite,
  };
}

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
    directPourIds?: string[];
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

  const candidates = await fetchFifoPool(db, {
    companyId: input.companyId,
    siteId: input.siteId,
    directPourIds: input.directPourIds,
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
    const take = Math.min(Number(pour.grossWeight), remaining);
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
      companyId: input.companyId,
      goldPourId: plan[0].pourId,
      receiptNumber,
      receiptDate: input.saleDate,
      paidAmount: headerPaidValueUsd ?? 0,
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
        companyId: input.companyId,
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
