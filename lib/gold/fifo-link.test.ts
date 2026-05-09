import { describe, it, expect, vi } from "vitest";
import { linkFifoSale } from "@/lib/gold/fifo-link";

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
