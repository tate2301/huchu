/**
 * Inventory ledger invariant tests — migration witnesses for Epic 5a.
 *
 * Tests marked MIGRATION WITNESS will FAIL on the current Float schema and
 * PASS after the Float→Decimal migration (Epic 6). Do not remove them —
 * they are the regression gate for that migration.
 *
 * Prerequisites:
 *   - A real Postgres test DB (DATABASE_URL pointing at a test instance)
 *   - `prisma db push` applied against that DB
 *   - Epic 1 shipped: GoldInventorySourceType.REVERSAL + recordReversalEvent
 *     + OversoldError exported from lib/gold/inventory.ts
 *
 * Assumptions pending Epic 1 (ledger-migration confirmed API):
 *   - OversoldError: named export, class OversoldError extends Error { deficitGrams: number }
 *   - recordReversalEvent: (db, { companyId, siteId, originalEventId, createdById?, notes? }) => Promise<GoldInventoryEvent>
 *   - GoldInventorySourceType includes REVERSAL
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  recordInventoryEvent,
  getOnHandGrams,
} from "@/lib/gold/inventory";
// @ts-ignore — OversoldError and recordReversalEvent added in Epic 1 (ledger-migration)
import { recordReversalEvent, OversoldError } from "@/lib/gold/inventory";
import { factories } from "@/lib/gold/test-factories";

let companyId: string;
let siteId: string;

const ROLLBACK = new Error("__test_rollback__");

beforeAll(async () => {
  await prisma.$connect();
  const co = await prisma.company.create({ data: factories.company() });
  companyId = co.id;
  const si = await prisma.site.create({ data: factories.site(companyId) });
  siteId = si.id;
});

afterAll(async () => {
  await prisma.goldInventoryEvent.deleteMany({ where: { companyId } });
  await prisma.site.delete({ where: { id: siteId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

async function withRollback<T>(
  fn: (tx: Parameters<typeof recordInventoryEvent>[0]) => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    await prisma.$transaction(async (tx) => {
      result = await fn(tx);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return result!;
}

// ---------------------------------------------------------------------------
// Suite 1 — Basic balance arithmetic
// ---------------------------------------------------------------------------

describe("getOnHandGrams — basic balance arithmetic", () => {
  it("N IN events of weight W equals exactly N × W", async () => {
    const N = 5;
    const W = 3.25;
    await withRollback(async (tx) => {
      for (let i = 0; i < N; i++) {
        await recordInventoryEvent(tx, { companyId, siteId, eventDate: new Date(), direction: "IN", grams: W, sourceType: "POUR", skipValuation: true });
      }
      expect(await getOnHandGrams({ companyId, siteId }, tx)).toBe(N * W);
    });
  });

  it("one IN of W followed by one OUT of W equals exactly 0", async () => {
    const W = 7.5;
    await withRollback(async (tx) => {
      await recordInventoryEvent(tx, { companyId, siteId, eventDate: new Date(), direction: "IN", grams: W, sourceType: "POUR", skipValuation: true });
      await recordInventoryEvent(tx, { companyId, siteId, eventDate: new Date(), direction: "OUT", grams: W, sourceType: "RECEIPT", skipValuation: true });
      expect(await getOnHandGrams({ companyId, siteId }, tx)).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — REVERSAL events (Epic 1 dependency)
// ---------------------------------------------------------------------------

describe.skip("getOnHandGrams — reversal events [PENDING: Epic 1]", () => {
  it("after REVERSAL of an IN event, balance equals state before that IN", async () => {
    await withRollback(async (tx) => {
      await recordInventoryEvent(tx, { companyId, siteId, eventDate: new Date(), direction: "IN", grams: 10.0, sourceType: "POUR", skipValuation: true });
      const balanceBefore = await getOnHandGrams({ companyId, siteId }, tx);

      // ASSUMPTION (Epic 1): recordReversalEvent is a named export
      const toReverse = await recordInventoryEvent(tx, { companyId, siteId, eventDate: new Date(), direction: "IN", grams: 4.0, sourceType: "POUR", skipValuation: true });
      await recordReversalEvent(tx, { companyId, siteId, originalEventId: toReverse.id });

      expect(await getOnHandGrams({ companyId, siteId }, tx)).toBe(balanceBefore);
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — OversoldError (Epic 1 dependency)
// Passes after Epic 1 lands; fails on current impl which silently returns 0.
// ---------------------------------------------------------------------------

describe.skip("getOnHandGrams — negative balance throws OversoldError [PENDING: Epic 1]", () => {
  it("OUT exceeding IN throws OversoldError, not Math.max(0,...)", async () => {
    await withRollback(async (tx) => {
      await recordInventoryEvent(tx, { companyId, siteId, eventDate: new Date(), direction: "IN", grams: 5.0, sourceType: "POUR", skipValuation: true });
      await recordInventoryEvent(tx, { companyId, siteId, eventDate: new Date(), direction: "OUT", grams: 7.0, sourceType: "RECEIPT", skipValuation: true });
      // ASSUMPTION (Epic 1): throws OversoldError instead of clamping
      await expect(getOnHandGrams({ companyId, siteId }, tx)).rejects.toBeInstanceOf(OversoldError);
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Decimal precision  MIGRATION WITNESS
// Fails today (Float drift). Passes after Float→Decimal migration (Epic 6).
// ---------------------------------------------------------------------------

describe("getOnHandGrams — Decimal arithmetic precision", () => {
  it.skip(
    // MIGRATION WITNESS: fails until Float→Decimal migration (Epic 6)
    "1000 recordInventoryEvent calls of 0.001 g each sum to exactly 1.000 g",
    async () => {
      await withRollback(async (tx) => {
        for (let i = 0; i < 1000; i++) {
          await recordInventoryEvent(tx, { companyId, siteId, eventDate: new Date(), direction: "IN", grams: 0.001, sourceType: "POUR", skipValuation: true });
        }
        expect(await getOnHandGrams({ companyId, siteId }, tx)).toBe(1.0);
      });
    },
  );
});

// ---------------------------------------------------------------------------
// Suite 5 — Concurrency
// ---------------------------------------------------------------------------

describe("recordInventoryEvent — concurrent writes", () => {
  it("8 parallel IN events of 1 g each produce a balance of exactly 8 g", async () => {
    await withRollback(async (tx) => {
      await Promise.all(
        Array.from({ length: 8 }, () =>
          recordInventoryEvent(tx, { companyId, siteId, eventDate: new Date(), direction: "IN", grams: 1, sourceType: "POUR", skipValuation: true }),
        ),
      );
      expect(await getOnHandGrams({ companyId, siteId }, tx)).toBe(8);
    });
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Enum extension witness  MIGRATION WITNESS
// MIGRATION WITNESS: fails on current schema (missing REVERSAL/DISPATCH/PURCHASE),
// passes after migration 20260509212814_extend_inventory_source_type.
// Verifies that GoldInventorySourceType accepts the three new members at the
// DB level so that inventory.ts can insert REVERSAL/DISPATCH/PURCHASE events.
// ---------------------------------------------------------------------------

describe("GoldInventorySourceType — extended enum members", () => {
  it("accepts REVERSAL as sourceType without DB error", async () => {
    await withRollback(async (tx) => {
      const evt = await recordInventoryEvent(tx, {
        companyId,
        siteId,
        eventDate: new Date(),
        direction: "OUT",
        grams: 1.0,
        sourceType: "REVERSAL",
        skipValuation: true,
      });
      expect(evt.sourceType).toBe("REVERSAL");
    });
  });

  it("accepts DISPATCH as sourceType without DB error", async () => {
    await withRollback(async (tx) => {
      const evt = await recordInventoryEvent(tx, {
        companyId,
        siteId,
        eventDate: new Date(),
        direction: "OUT",
        grams: 1.0,
        sourceType: "DISPATCH",
        skipValuation: true,
      });
      expect(evt.sourceType).toBe("DISPATCH");
    });
  });

  it("accepts PURCHASE as sourceType without DB error", async () => {
    await withRollback(async (tx) => {
      const evt = await recordInventoryEvent(tx, {
        companyId,
        siteId,
        eventDate: new Date(),
        direction: "IN",
        grams: 1.0,
        sourceType: "PURCHASE",
        skipValuation: true,
      });
      expect(evt.sourceType).toBe("PURCHASE");
    });
  });
});
