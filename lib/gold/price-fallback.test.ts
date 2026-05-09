import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveGoldPriceUsdPerGram, DEFAULT_GOLD_PRICE_USD_PER_GRAM } from "./price-fallback";
import { prisma } from "@/lib/prisma";

const NOW = new Date("2026-05-10T12:00:00Z");

function makeDb(overrides: {
  goldPriceFindFirst?: unknown;
  goldSpotPriceCacheFindFirst?: unknown;
}) {
  return {
    goldPrice: {
      findFirst: vi.fn().mockResolvedValue(overrides.goldPriceFindFirst ?? null),
    },
    goldSpotPriceCache: {
      findFirst: vi.fn().mockResolvedValue(overrides.goldSpotPriceCacheFindFirst ?? null),
    },
  } as unknown as Parameters<typeof resolveGoldPriceUsdPerGram>[0];
}

describe("resolveGoldPriceUsdPerGram", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it("CONFIGURED: returns the GoldPrice row when one matches", async () => {
    const effectiveDate = new Date("2026-05-09T00:00:00Z");
    const db = makeDb({
      goldPriceFindFirst: { priceUsdPerGram: 95, effectiveDate },
    });

    const result = await resolveGoldPriceUsdPerGram(db, {
      companyId: "co1",
      asOf: NOW,
    });

    expect(result.source).toBe("CONFIGURED");
    expect(result.priceUsdPerGram).toBe(95);
    expect(result.valuationDate).toBe(effectiveDate);
  });

  it("LIVE: returns cache row when no GoldPrice but a row within 24h", async () => {
    const fetchedAt = new Date(NOW.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
    const db = makeDb({
      goldPriceFindFirst: null,
      goldSpotPriceCacheFindFirst: { priceUsdPerGram: 88, fetchedAt },
    });

    const result = await resolveGoldPriceUsdPerGram(db, {
      companyId: "co1",
      asOf: NOW,
    });

    expect(result.source).toBe("LIVE");
    expect(result.priceUsdPerGram).toBe(88);
    expect(result.valuationDate).toBe(fetchedAt);
  });

  it("FALLBACK: returns $80 when neither GoldPrice nor cache row exists", async () => {
    const db = makeDb({
      goldPriceFindFirst: null,
      goldSpotPriceCacheFindFirst: null,
    });

    const result = await resolveGoldPriceUsdPerGram(db, {
      companyId: "co1",
      asOf: NOW,
    });

    expect(result.source).toBe("FALLBACK");
    expect(result.priceUsdPerGram).toBe(DEFAULT_GOLD_PRICE_USD_PER_GRAM);
    expect(result.valuationDate).toBe(NOW);
  });

  it("LIVE cache miss: a row older than 24h is ignored, falls to FALLBACK", async () => {
    const staleAt = new Date(NOW.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago
    const db = makeDb({
      goldPriceFindFirst: null,
      goldSpotPriceCacheFindFirst: null, // mock returns null because cutoff filters it
    });

    // Simulate the query returning null (as DB would with gte cutoff filter)
    const result = await resolveGoldPriceUsdPerGram(db, {
      companyId: "co1",
      asOf: NOW,
    });

    expect(result.source).toBe("FALLBACK");
    expect(result.priceUsdPerGram).toBe(DEFAULT_GOLD_PRICE_USD_PER_GRAM);
    // The cutoff passed to the DB should exclude rows older than 24h
    const cacheCall = (db.goldSpotPriceCache.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const cutoff = cacheCall.where.fetchedAt.gte as Date;
    expect(staleAt.getTime()).toBeLessThan(cutoff.getTime());
  });

  it("allowLive=false skips cache even if row within 24h, falls to FALLBACK", async () => {
    const fetchedAt = new Date(NOW.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago
    const db = makeDb({
      goldPriceFindFirst: null,
      goldSpotPriceCacheFindFirst: { priceUsdPerGram: 88, fetchedAt },
    });

    const result = await resolveGoldPriceUsdPerGram(db, {
      companyId: "co1",
      asOf: NOW,
      allowLive: false,
    });

    expect(result.source).toBe("FALLBACK");
    expect(db.goldSpotPriceCache.findFirst).not.toHaveBeenCalled();
  });
});

// MIGRATION WITNESS: fails on current schema, passes after this migration
// (20260510000003_add_gold_price_source_and_spot_cache)
describe("GoldSpotPriceCache schema (Epic 4 prereq)", () => {
  it("can write and read a spot-price cache row", async () => {
    const row = await prisma.goldSpotPriceCache.create({
      data: { source: "test", priceUsdPerGram: 80.5, rawResponse: '{"test":true}' },
    });
    expect(row.id).toBeTruthy();
    expect(row.priceUsdPerGram).toBe(80.5);
    await prisma.goldSpotPriceCache.delete({ where: { id: row.id } });
  });

  it("GoldPriceSource enum accepts CONFIGURED, LIVE, FALLBACK", async () => {
    const result = await prisma.$queryRaw<{ unnest: string }[]>`
      SELECT unnest(enum_range(NULL::"GoldPriceSource"))::text
    `;
    const values = result.map((r) => r.unnest);
    expect(values).toContain("CONFIGURED");
    expect(values).toContain("LIVE");
    expect(values).toContain("FALLBACK");
  });
});
