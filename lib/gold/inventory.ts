import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { snapshotGoldUsdValue } from "@/lib/gold/valuation";

type Db = PrismaClient | Prisma.TransactionClient;

export type RecordInventoryEventInput = {
  companyId: string;
  siteId: string;
  eventDate: Date | string;
  direction: "IN" | "OUT";
  grams: number;
  sourceType: "POUR" | "RECEIPT" | "ADJUSTMENT" | "SHIFT_ALLOCATION";
  sourceId?: string | null;
  notes?: string | null;
  createdById?: string | null;
  /** Optional precomputed valuation. If absent and skipValuation is false, snapshot is fetched. */
  goldPriceUsdPerGram?: number | null;
  valueUsd?: number | null;
  /** When true, valuation snapshot is skipped (use whatever the caller passed). */
  skipValuation?: boolean;
};

export async function recordInventoryEvent(
  db: Db,
  input: RecordInventoryEventInput,
) {
  const eventDate =
    input.eventDate instanceof Date ? input.eventDate : new Date(input.eventDate);

  let goldPriceUsdPerGram: number | null = input.goldPriceUsdPerGram ?? null;
  let valueUsd: number | null = input.valueUsd ?? null;
  if (!input.skipValuation && input.grams > 0 && goldPriceUsdPerGram == null) {
    const snapshot = await snapshotGoldUsdValue({
      companyId: input.companyId,
      businessDate: eventDate,
      grams: input.grams,
    });
    if (snapshot) {
      goldPriceUsdPerGram = snapshot.goldPriceUsdPerGram;
      valueUsd = snapshot.valueUsd;
    }
  }

  return db.goldInventoryEvent.create({
    data: {
      companyId: input.companyId,
      siteId: input.siteId,
      eventDate,
      direction: input.direction,
      grams: input.grams,
      goldPriceUsdPerGram,
      valueUsd,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

export type OnHandQuery = {
  companyId: string;
  siteId?: string;
  asOf?: Date | string;
};

/**
 * Returns the running on-hand gold balance in grams.
 *
 * Sums IN events minus OUT events from {@link GoldInventoryEvent}, optionally
 * scoped to a single site or to a point in time.
 */
export async function getOnHandGrams(
  query: OnHandQuery,
  db: Db = prisma,
): Promise<number> {
  const where: Prisma.GoldInventoryEventWhereInput = {
    companyId: query.companyId,
  };
  if (query.siteId) where.siteId = query.siteId;
  if (query.asOf) {
    where.eventDate = {
      lte: query.asOf instanceof Date ? query.asOf : new Date(query.asOf),
    };
  }

  const aggregates = await db.goldInventoryEvent.groupBy({
    by: ["direction"],
    where,
    _sum: { grams: true },
  });

  let inGrams = 0;
  let outGrams = 0;
  for (const row of aggregates) {
    if (row.direction === "IN") inGrams += row._sum.grams ?? 0;
    else if (row.direction === "OUT") outGrams += row._sum.grams ?? 0;
  }
  return Math.max(0, +(inGrams - outGrams).toFixed(4));
}

export async function getOnHandBySite(
  companyId: string,
  db: Db = prisma,
): Promise<Array<{ siteId: string; grams: number }>> {
  const aggregates = await db.goldInventoryEvent.groupBy({
    by: ["siteId", "direction"],
    where: { companyId },
    _sum: { grams: true },
  });

  const tally = new Map<string, { in: number; out: number }>();
  for (const row of aggregates) {
    const entry = tally.get(row.siteId) ?? { in: 0, out: 0 };
    if (row.direction === "IN") entry.in += row._sum.grams ?? 0;
    else entry.out += row._sum.grams ?? 0;
    tally.set(row.siteId, entry);
  }

  return Array.from(tally.entries()).map(([siteId, totals]) => ({
    siteId,
    grams: +(totals.in - totals.out).toFixed(4),
  }));
}

/**
 * Convenience: would the proposed OUT event drive the balance below zero?
 * Returns the projected post-event balance (negative => deficit).
 */
export async function projectBalanceAfterOut(
  query: OnHandQuery & { grams: number },
  db: Db = prisma,
): Promise<number> {
  const current = await getOnHandGrams(query, db);
  return +(current - query.grams).toFixed(4);
}
