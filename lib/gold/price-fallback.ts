import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type GoldPriceResolution = {
  priceUsdPerGram: number;
  source: "CONFIGURED" | "LIVE" | "FALLBACK";
  valuationDate: Date;
};

export const DEFAULT_GOLD_PRICE_USD_PER_GRAM = 80;
const LIVE_CACHE_TTL_HOURS = 24;

export async function resolveGoldPriceUsdPerGram(
  db: Db,
  args: { companyId: string; asOf: Date; allowLive?: boolean },
): Promise<GoldPriceResolution> {
  const configured = await db.goldPrice.findFirst({
    where: { companyId: args.companyId, effectiveDate: { lte: args.asOf } },
    orderBy: { effectiveDate: "desc" },
  });
  if (configured) {
    return {
      priceUsdPerGram: configured.priceUsdPerGram,
      source: "CONFIGURED",
      valuationDate: configured.effectiveDate,
    };
  }

  if (args.allowLive ?? true) {
    const ttlMs = LIVE_CACHE_TTL_HOURS * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - ttlMs);
    const cached = await db.goldSpotPriceCache.findFirst({
      where: { fetchedAt: { gte: cutoff } },
      orderBy: { fetchedAt: "desc" },
    });
    if (cached) {
      return {
        priceUsdPerGram: cached.priceUsdPerGram,
        source: "LIVE",
        valuationDate: cached.fetchedAt,
      };
    }
    // TODO: implement live fetch via external API (requires API key + rate-limit handling).
  }

  return {
    priceUsdPerGram: DEFAULT_GOLD_PRICE_USD_PER_GRAM,
    source: "FALLBACK",
    valuationDate: args.asOf,
  };
}
