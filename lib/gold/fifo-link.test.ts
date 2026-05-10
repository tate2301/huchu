import { describe, it, expect, vi } from "vitest";
import { linkFifoSale, planFifoSale } from "@/lib/gold/fifo-link";

// $queryRaw is called as a tagged template literal:
//   db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
// The spy receives: ([strings, ...], interpolatedKey)
// So calls[0][0] is the TemplateStringsArray and calls[0][1] is the key string.

describe("linkFifoSale — FIFO concurrency lock", () => {
  it("acquires pg_advisory_xact_lock keyed by siteId before reading the pool", async () => {
    const queryRawSpy = vi.fn().mockResolvedValue([]);
    const findManySpy = vi.fn().mockResolvedValue([]);
    const fakeDb = {
      $queryRaw: queryRawSpy,
      goldPour: { findMany: findManySpy },
    };

    await linkFifoSale(fakeDb as any, {
      companyId: "co-1",
      siteId: "site-abc",
      saleGrams: 5,
      saleDate: new Date(),
    });

    expect(queryRawSpy).toHaveBeenCalled();
    // Template strings array (first arg) contains the SQL fragment
    const strings = queryRawSpy.mock.calls[0]?.[0] as string[];
    const sqlFragment = Array.isArray(strings) ? strings.join("") : String(strings);
    expect(sqlFragment).toContain("pg_advisory_xact_lock");
    // Interpolated key (second arg) encodes the siteId
    const lockKey = queryRawSpy.mock.calls[0]?.[1] as string;
    expect(lockKey).toBe("gold-fifo:site-abc");
    // Lock acquired before pool read
    expect(queryRawSpy.mock.invocationCallOrder[0]).toBeLessThan(
      findManySpy.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it("includes siteId in the lock key (different sites get different locks)", async () => {
    const queryRawSpy = vi.fn().mockResolvedValue([]);
    const fakeDb = {
      $queryRaw: queryRawSpy,
      goldPour: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await linkFifoSale(fakeDb as any, {
      companyId: "co-1",
      siteId: "site-abc",
      saleGrams: 5,
      saleDate: new Date(),
    });
    await linkFifoSale(fakeDb as any, {
      companyId: "co-1",
      siteId: "site-xyz",
      saleGrams: 5,
      saleDate: new Date(),
    });

    const lockKeys = queryRawSpy.mock.calls.map((c) => c[1] as string);
    expect(lockKeys).toContain("gold-fifo:site-abc");
    expect(lockKeys).toContain("gold-fifo:site-xyz");
  });
});

// Stub snapshotGoldUsdValue so planFifoSale tests don't need a real DB.
vi.mock("@/lib/gold/valuation", () => ({
  snapshotGoldUsdValue: vi.fn().mockResolvedValue({
    priceId: "price-1",
    valuationDate: new Date("2024-01-01"),
    goldPriceUsdPerGram: 80,
    grams: 10,
    valueUsd: 800,
  }),
}));

describe("planFifoSale", () => {
  function makePour(id: string, grossWeight: number, siteId = "site-1", pourBarId = id) {
    return {
      id,
      grossWeight,
      pourDate: new Date("2024-01-01"),
      pourBarId,
      siteId,
      site: { name: "Site One" },
    };
  }

  type PlanDb = Parameters<typeof planFifoSale>[0];

  function fakeDb(pours: ReturnType<typeof makePour>[]): PlanDb {
    return {
      goldPour: {
        findMany: vi.fn().mockResolvedValue(pours),
      },
    } as unknown as PlanDb;
  }

  it("returns empty plan when saleGrams <= 0", async () => {
    const db = fakeDb([makePour("p1", 10)]);
    const plan = await planFifoSale(db, {
      companyId: "co-1",
      siteId: "site-1",
      saleGrams: 0,
      saleDate: new Date(),
    });
    expect(plan.consumedGrams).toBe(0);
    expect(plan.plannedBatches).toHaveLength(0);
    expect(plan.isAnomaly).toBe(false);
  });

  it("plans a single pour that fully covers the sale", async () => {
    const db = fakeDb([makePour("p1", 10)]);
    const plan = await planFifoSale(db, {
      companyId: "co-1",
      siteId: "site-1",
      saleGrams: 8,
      saleDate: new Date(),
    });
    expect(plan.consumedGrams).toBe(8);
    expect(plan.remainingGrams).toBe(0);
    expect(plan.isAnomaly).toBe(false);
    expect(plan.plannedBatches).toHaveLength(1);
    expect(plan.plannedBatches[0].grams).toBe(8);
  });

  it("plans multiple pours (FIFO) when one is insufficient", async () => {
    const db = fakeDb([makePour("p1", 5), makePour("p2", 8)]);
    const plan = await planFifoSale(db, {
      companyId: "co-1",
      siteId: "site-1",
      saleGrams: 10,
      saleDate: new Date(),
    });
    expect(plan.consumedGrams).toBe(10);
    expect(plan.plannedBatches).toHaveLength(2);
    expect(plan.plannedBatches[0].pourId).toBe("p1");
    expect(plan.plannedBatches[0].grams).toBe(5);
    expect(plan.plannedBatches[1].pourId).toBe("p2");
    expect(plan.plannedBatches[1].grams).toBe(5);
    expect(plan.isAnomaly).toBe(false);
  });

  it("sets isAnomaly=true when pool is insufficient", async () => {
    const db = fakeDb([makePour("p1", 3)]);
    const plan = await planFifoSale(db, {
      companyId: "co-1",
      siteId: "site-1",
      saleGrams: 10,
      saleDate: new Date(),
    });
    expect(plan.isAnomaly).toBe(true);
    expect(plan.consumedGrams).toBe(3);
    expect(plan.remainingGrams).toBeCloseTo(7, 3);
  });

  it("detects cross-site when pours span multiple sites", async () => {
    const pours = [
      { ...makePour("p1", 5, "site-1"), site: { name: "Site A" } },
      { ...makePour("p2", 5, "site-2"), site: { name: "Site B" } },
    ];
    const db = { goldPour: { findMany: vi.fn().mockResolvedValue(pours) } } as unknown as PlanDb;
    const plan = await planFifoSale(db, {
      companyId: "co-1",
      siteId: "site-1",
      saleGrams: 8,
      saleDate: new Date(),
    });
    expect(plan.isCrossSite).toBe(true);
  });

  it("uses directPourIds when provided instead of FIFO pool", async () => {
    const pours = [makePour("p2", 10)];
    const findMany = vi.fn().mockResolvedValue(pours);
    const db = { goldPour: { findMany } } as unknown as PlanDb;
    const plan = await planFifoSale(db, {
      companyId: "co-1",
      siteId: "site-1",
      saleGrams: 5,
      saleDate: new Date(),
      directPourIds: ["p2"],
    });
    const call = findMany.mock.calls[0][0];
    // Should query by id filter, not siteId filter
    expect(call.where.id).toEqual({ in: ["p2"] });
    expect(plan.plannedBatches[0].pourId).toBe("p2");
  });

  it("computes valueUsd per batch using price snapshot", async () => {
    const db = fakeDb([makePour("p1", 10)]);
    const plan = await planFifoSale(db, {
      companyId: "co-1",
      siteId: "site-1",
      saleGrams: 5,
      saleDate: new Date(),
    });
    // price is 80 USD/g from mock
    expect(plan.priceUsdPerGram).toBe(80);
    expect(plan.plannedBatches[0].valueUsd).toBeCloseTo(400, 2);
    expect(plan.totalUsd).toBeCloseTo(400, 2);
  });
});
