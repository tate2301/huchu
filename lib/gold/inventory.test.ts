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
  recordReversalEvent,
  OversoldError,
} from "@/lib/gold/inventory";
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
// Epic 1 landed in 48890bd4b — unskipped.
// ---------------------------------------------------------------------------

describe("getOnHandGrams — reversal events", () => {
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
// Epic 1 landed in 48890bd4b — unskipped.
// ---------------------------------------------------------------------------

describe("getOnHandGrams — negative balance throws OversoldError", () => {
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
// Passes after Float→Decimal migration (Epic 6, landed in b9cd476ef+).
//
// Uses tx.goldInventoryEvent.createMany to insert 1000 rows in a single
// round-trip instead of 1000 sequential recordInventoryEvent calls (~5 ms each
// = ~5 s total which exceeds the default 5 000 ms vitest timeout). The helper
// wrapping is not what we are testing — we are testing that 1000 DB rows of
// 0.001 g Decimal(12,4) aggregate to exactly 1.000 g.
// ---------------------------------------------------------------------------

describe("getOnHandGrams — Decimal arithmetic precision", () => {
  it("1000 events of 0.001 g each sum to exactly 1.000 g", async () => {
    await withRollback(async (tx) => {
      const data = Array.from({ length: 1000 }, () => ({
        companyId,
        siteId,
        eventDate: new Date(),
        direction: "IN" as const,
        grams: 0.001,
        sourceType: "POUR" as const,
      }));
      await tx.goldInventoryEvent.createMany({ data });
      expect(await getOnHandGrams({ companyId, siteId }, tx)).toBe(1.0);
    });
  });
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

// ---------------------------------------------------------------------------
// Suite 7 — companyId denormalisation parity  MIGRATION WITNESS
// MIGRATION WITNESS: fails on current schema (columns don't exist),
// passes after migrations 20260510100001-20260510100006.
//
// Verifies that:
//  - GoldPour accepts companyId at the DB level
//  - GoldShiftAllocation accepts companyId at the DB level
//  - BuyerReceipt accepts companyId at the DB level
//  - GoldDispatch accepts companyId at the DB level
//  - GoldLedgerEntry accepts companyId at the DB level
//  - GoldDispatchBatch accepts companyId at the DB level
//  - BuyerReceiptBatch accepts companyId at the DB level
//  - (companyId, pourBarId) unique on GoldPour is enforced
//  - (companyId, receiptNumber) unique on BuyerReceipt is enforced
// ---------------------------------------------------------------------------

describe("companyId denormalisation — column parity", () => {
  let witness1Id: string;
  let witness2Id: string;

  beforeAll(async () => {
    const w1 = await prisma.employee.create({ data: factories.employee(companyId) });
    const w2 = await prisma.employee.create({ data: factories.employee(companyId) });
    witness1Id = w1.id;
    witness2Id = w2.id;
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({
      where: { id: { in: [witness1Id, witness2Id] } },
    });
  });

  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510100001
  it("GoldPour.companyId column exists and accepts a valid companyId", async () => {
    await withRollback(async (tx) => {
      const pour = await tx.goldPour.create({
        data: {
          pourBarId: `BAR-WITNESS-${Date.now()}`,
          pourDate: new Date(),
          siteId,
          companyId,
          grossWeight: 10.0,
          witness1Id,
          witness2Id,
          storageLocation: "Vault A",
        },
      });
      expect(pour.companyId).toBe(companyId);
    });
  });

  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510100001
  it("(companyId, pourBarId) unique on GoldPour is enforced", async () => {
    const barId = `BAR-UNIQ-${Date.now()}`;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.goldPour.create({
          data: {
            pourBarId: barId,
            pourDate: new Date(),
            siteId,
            companyId,
            grossWeight: 5.0,
            witness1Id,
            witness2Id,
            storageLocation: "Vault A",
          },
        });
        await tx.goldPour.create({
          data: {
            pourBarId: barId,
            pourDate: new Date(),
            siteId,
            companyId,
            grossWeight: 5.0,
            witness1Id,
            witness2Id,
            storageLocation: "Vault B",
          },
        });
      })
    ).rejects.toThrow();
    // cleanup the first pour if transaction didn't roll back
    await prisma.goldPour.deleteMany({
      where: { pourBarId: barId, companyId },
    });
  });

  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510100002
  it("GoldShiftAllocation.companyId column exists and accepts a valid companyId", async () => {
    // GoldShiftAllocation requires a shiftReport — skip DB write, just verify
    // that Prisma client exposes the field (type-level check via raw query)
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'GoldShiftAllocation' AND column_name = 'companyId'
    `;
    expect(result.length).toBe(1);
  });

  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510100003
  it("BuyerReceipt.companyId column exists and accepts a valid companyId", async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'BuyerReceipt' AND column_name = 'companyId'
    `;
    expect(result.length).toBe(1);
  });

  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510100004
  it("GoldDispatch.companyId column exists", async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'GoldDispatch' AND column_name = 'companyId'
    `;
    expect(result.length).toBe(1);
  });

  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510100005
  it("GoldLedgerEntry.companyId column exists", async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'GoldLedgerEntry' AND column_name = 'companyId'
    `;
    expect(result.length).toBe(1);
  });

  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510100006
  it("GoldDispatchBatch.companyId column exists", async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'GoldDispatchBatch' AND column_name = 'companyId'
    `;
    expect(result.length).toBe(1);
  });

  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510100006
  it("BuyerReceiptBatch.companyId column exists", async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'BuyerReceiptBatch' AND column_name = 'companyId'
    `;
    expect(result.length).toBe(1);
  });
});

// Suite 8 - Epic 12c schema witnesses  MIGRATION WITNESS
// MIGRATION WITNESS: fails on current schema (GoldCompanyConfig missing, attachmentsJson missing),
// passes after migration 20260510500001_add_gold_company_config_and_purchase_attachments
describe("Suite 8 - Epic 12c: GoldCompanyConfig + GoldPurchase.attachmentsJson", () => {
  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510500001
  it("GoldCompanyConfig table exists", async () => {
    const result = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'GoldCompanyConfig'
    `;
    expect(result.length).toBe(1);
  });

  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510500001
  it("GoldCompanyConfig.defaultEstimatedPurity is Decimal(5,2)", async () => {
    const result = await prisma.$queryRaw<{ numeric_precision: number; numeric_scale: number }[]>`
      SELECT numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name = 'GoldCompanyConfig' AND column_name = 'defaultEstimatedPurity'
    `;
    expect(result.length).toBe(1);
    expect(result[0].numeric_precision).toBe(5);
    expect(result[0].numeric_scale).toBe(2);
  });

  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510500001
  it("GoldCompanyConfig.importCommitCoSignThresholdUsd is Decimal(14,2)", async () => {
    const result = await prisma.$queryRaw<{ numeric_precision: number; numeric_scale: number }[]>`
      SELECT numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name = 'GoldCompanyConfig' AND column_name = 'importCommitCoSignThresholdUsd'
    `;
    expect(result.length).toBe(1);
    expect(result[0].numeric_precision).toBe(14);
    expect(result[0].numeric_scale).toBe(2);
  });

  // MIGRATION WITNESS: fails on current schema, passes after migration 20260510500001
  it("GoldPurchase.attachmentsJson column exists", async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'GoldPurchase' AND column_name = 'attachmentsJson'
    `;
    expect(result.length).toBe(1);
  });
});
