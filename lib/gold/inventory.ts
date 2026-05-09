import type { GoldInventoryEvent, Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { snapshotGoldUsdValue } from "@/lib/gold/valuation";

type Db = PrismaClient | Prisma.TransactionClient;

export class OversoldError extends Error {
  constructor(public readonly deficitGrams: number) {
    super(`Gold inventory deficit: ${deficitGrams.toFixed(4)} g`);
    this.name = 'OversoldError';
  }
}

export type RecordInventoryEventInput = {
  companyId: string;
  siteId: string;
  eventDate: Date | string;
  direction: "IN" | "OUT";
  grams: number;
  sourceType: "POUR" | "RECEIPT" | "ADJUSTMENT" | "SHIFT_ALLOCATION" | "REVERSAL" | "DISPATCH" | "PURCHASE";
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sourceType: input.sourceType as any,
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
 *
 * Throws {@link OversoldError} if the balance is more than 0.0001 g negative
 * (real deficit, not Float drift). Returns the raw balance — including small
 * negative values within the ±0.0001 tolerance — so callers see real data.
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

  // Post Epic-6 Float→Decimal: row._sum.grams may be a Prisma.Decimal.
  // Coerce to number for the JS arithmetic. Aggregates of 0.001 g rows
  // are bounded enough that toNumber() is safe (Decimal precision < 17 digits).
  let inGrams = 0;
  let outGrams = 0;
  for (const row of aggregates) {
    const grams = row._sum.grams == null ? 0 : Number(row._sum.grams);
    if (row.direction === "IN") inGrams += grams;
    else if (row.direction === "OUT") outGrams += grams;
  }
  const balance = +(inGrams - outGrams).toFixed(4);
  if (balance < -0.0001) {
    throw new OversoldError(Math.abs(balance));
  }
  return balance;
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
    const grams = row._sum.grams == null ? 0 : Number(row._sum.grams);
    if (row.direction === "IN") entry.in += grams;
    else entry.out += grams;
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

/**
 * Inserts a compensating (reversal) inventory event for a prior event.
 *
 * The original event must belong to the given companyId + siteId. The
 * compensating event carries the opposite direction and the same absolute
 * grams, with sourceType "REVERSAL" and sourceId pointing back at the
 * original event.
 *
 * Append-only: never deletes GoldInventoryEvent rows (see §4.4 C-4).
 */
export async function recordReversalEvent(
  db: PrismaClient | Prisma.TransactionClient,
  args: {
    companyId: string;
    siteId: string;
    originalEventId: string;
    createdById?: string | null;
    notes?: string | null;
  },
): Promise<GoldInventoryEvent> {
  const original = await db.goldInventoryEvent.findUnique({
    where: { id: args.originalEventId },
  });

  if (!original) {
    throw new Error(
      `recordReversalEvent: original event not found (id=${args.originalEventId})`,
    );
  }
  if (
    original.companyId !== args.companyId ||
    original.siteId !== args.siteId
  ) {
    throw new Error(
      `recordReversalEvent: event ${args.originalEventId} does not belong to companyId=${args.companyId} siteId=${args.siteId}`,
    );
  }

  const oppositeDirection: "IN" | "OUT" =
    original.direction === "IN" ? "OUT" : "IN";

  return db.goldInventoryEvent.create({
    data: {
      companyId: original.companyId,
      siteId: original.siteId,
      eventDate: original.eventDate,
      direction: oppositeDirection,
      grams: original.grams,
      goldPriceUsdPerGram: original.goldPriceUsdPerGram,
      valueUsd: original.valueUsd,
      // Cast required until schema teammate lands the REVERSAL enum member
      // in GoldInventorySourceType.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sourceType: "REVERSAL" as any,
      sourceId: args.originalEventId,
      notes: args.notes ?? null,
      createdById: args.createdById ?? null,
    },
  });
}
