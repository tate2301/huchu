import { prisma } from "@/lib/prisma";

type GoldPriceSnapshot = {
  priceId: string;
  valuationDate: Date;
  goldPriceUsdPerGram: number;
};

function startOfDayUtc(input: Date | string): Date {
  const date = typeof input === "string" ? new Date(input) : new Date(input);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getLatestGoldPriceSnapshot(
  companyId: string,
): Promise<GoldPriceSnapshot | null> {
  const latest = await prisma.goldPrice.findFirst({
    where: { companyId },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      effectiveDate: true,
      priceUsdPerGram: true,
    },
  });
  if (!latest) return null;
  return {
    priceId: latest.id,
    valuationDate: latest.effectiveDate,
    goldPriceUsdPerGram: latest.priceUsdPerGram,
  };
}

export async function getEffectiveGoldPriceSnapshot(input: {
  companyId: string;
  businessDate: Date | string;
}): Promise<GoldPriceSnapshot | null> {
  const businessDate = startOfDayUtc(input.businessDate);
  const effective = await prisma.goldPrice.findFirst({
    where: {
      companyId: input.companyId,
      effectiveDate: { lte: businessDate },
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      effectiveDate: true,
      priceUsdPerGram: true,
    },
  });

  if (effective) {
    return {
      priceId: effective.id,
      valuationDate: effective.effectiveDate,
      goldPriceUsdPerGram: effective.priceUsdPerGram,
    };
  }

  // Backward compatibility: if there is no prior price, use latest configured.
  return getLatestGoldPriceSnapshot(input.companyId);
}

export async function snapshotGoldUsdValue(input: {
  companyId: string;
  businessDate: Date | string;
  grams: number;
}): Promise<{
  priceId: string;
  valuationDate: Date;
  goldPriceUsdPerGram: number;
  grams: number;
  valueUsd: number;
} | null> {
  const snapshot = await getEffectiveGoldPriceSnapshot({
    companyId: input.companyId,
    businessDate: input.businessDate,
  });
  if (!snapshot) return null;

  const grams = Math.max(input.grams, 0);
  return {
    ...snapshot,
    grams,
    valueUsd: roundUsd(grams * snapshot.goldPriceUsdPerGram),
  };
}

export function convertUsdToGrams(input: {
  usd: number;
  goldPriceUsdPerGram: number;
}): number {
  const price = input.goldPriceUsdPerGram;
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.max(input.usd, 0) / price;
}

