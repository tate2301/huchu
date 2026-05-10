/**
 * Witness tests for lib/gold/reconcile.ts — Epic 10 (P2.2).
 *
 * Requires a real Postgres test DB with DATABASE_URL_TEST set.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { factories } from "@/lib/gold/test-factories";
import {
  computeVariance,
  computeRollForward,
  findUnsoldPours,
  findAccountingBacklog,
} from "@/lib/gold/reconcile";
import { recordInventoryEvent } from "@/lib/gold/inventory";

let companyId: string;
let siteId: string;
let uploadedById: string;

const PERIOD_START = new Date("2026-01-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-02-01T00:00:00.000Z");

beforeAll(async () => {
  await prisma.$connect();
  const co = await prisma.company.create({ data: factories.company() });
  companyId = co.id;
  const si = await prisma.site.create({ data: factories.site(companyId) });
  siteId = si.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRow = await prisma.user.create({ data: factories.user(companyId) as any });
  uploadedById = userRow.id;
});

afterAll(async () => {
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.goldInventoryEvent.deleteMany({ where: { companyId } });
  await prisma.goldLedgerEntry.deleteMany({ where: { import: { companyId } } });
  await prisma.goldLedgerImport.deleteMany({ where: { companyId } });
  await prisma.goldPour.deleteMany({ where: { siteId } });
  await prisma.user.delete({ where: { id: uploadedById } });
  await prisma.site.delete({ where: { id: siteId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Variance tests
// ---------------------------------------------------------------------------

describe("computeVariance", () => {
  it("returns diffGrams=0 when bookGrams equals systemGrams", async () => {
    await prisma.$transaction(async (tx) => {
      const imp = await tx.goldLedgerImport.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { ...factories.goldLedgerImport(companyId, { siteId, uploadedById } as any), status: "COMMITTED" } as any,
      });
      await tx.goldLedgerEntry.create({
        data: { ...factories.goldLedgerEntry(imp.id, 1, {
          gramsTotal: 10,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: "CREATED" as any,
          parsedDate: new Date("2026-01-15T00:00:00.000Z"),
        }), companyId
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
      await recordInventoryEvent(tx, {
        companyId, siteId, eventDate: new Date("2026-01-15T00:00:00.000Z"),
        direction: "IN", grams: 10, sourceType: "POUR", skipValuation: true,
      });

      const [report] = await computeVariance(tx, {
        companyId, siteId, periodStart: PERIOD_START, periodEnd: PERIOD_END,
      });

      expect(report.bookGrams).toBe(10);
      expect(report.systemGrams).toBe(10);
      expect(report.diffGrams).toBe(0);

      throw new Error("__rollback__");
    }).catch((e) => { if ((e as Error).message !== "__rollback__") throw e; });
  });

  it("returns positive diffGrams when bookGrams > systemGrams", async () => {
    await prisma.$transaction(async (tx) => {
      const imp = await tx.goldLedgerImport.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { ...factories.goldLedgerImport(companyId, { siteId, uploadedById } as any), status: "COMMITTED" } as any,
      });
      await tx.goldLedgerEntry.create({
        data: { ...factories.goldLedgerEntry(imp.id, 1, {
          gramsTotal: 15,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: "CREATED" as any,
          parsedDate: new Date("2026-01-15T00:00:00.000Z"),
        }), companyId
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });
      await recordInventoryEvent(tx, {
        companyId, siteId, eventDate: new Date("2026-01-15T00:00:00.000Z"),
        direction: "IN", grams: 10, sourceType: "POUR", skipValuation: true,
      });

      const [report] = await computeVariance(tx, {
        companyId, siteId, periodStart: PERIOD_START, periodEnd: PERIOD_END,
      });

      expect(report.bookGrams).toBe(15);
      expect(report.systemGrams).toBe(10);
      expect(report.diffGrams).toBe(5);

      throw new Error("__rollback__");
    }).catch((e) => { if ((e as Error).message !== "__rollback__") throw e; });
  });
});

// ---------------------------------------------------------------------------
// Roll-forward tests
// ---------------------------------------------------------------------------

describe("computeRollForward", () => {
  it("opening + in - out = closing arithmetically", async () => {
    await prisma.$transaction(async (tx) => {
      await recordInventoryEvent(tx, {
        companyId, siteId, eventDate: new Date("2025-12-20T00:00:00.000Z"),
        direction: "IN", grams: 20, sourceType: "POUR", skipValuation: true,
      });
      await recordInventoryEvent(tx, {
        companyId, siteId, eventDate: new Date("2026-01-10T00:00:00.000Z"),
        direction: "IN", grams: 10, sourceType: "POUR", skipValuation: true,
      });
      await recordInventoryEvent(tx, {
        companyId, siteId, eventDate: new Date("2026-01-20T00:00:00.000Z"),
        direction: "OUT", grams: 5, sourceType: "RECEIPT", skipValuation: true,
      });

      const rows = await computeRollForward(tx, {
        companyId, siteId, periodStart: PERIOD_START, periodEnd: PERIOD_END, groupBy: "site",
      });

      const row = rows.find((r) => r.scopeId === siteId)!;
      expect(row).toBeDefined();
      expect(row.openingGrams).toBe(20);
      expect(row.inGrams).toBe(10);
      expect(row.outGrams).toBe(5);
      expect(row.closingGrams).toBe(25);

      throw new Error("__rollback__");
    }).catch((e) => { if ((e as Error).message !== "__rollback__") throw e; });
  });
});

// ---------------------------------------------------------------------------
// findUnsoldPours tests
// ---------------------------------------------------------------------------

describe("findUnsoldPours", () => {
  it("excludes pours that have a BuyerReceiptBatch attached", async () => {
    await prisma.$transaction(async (tx) => {
      const e1 = await tx.employee.create({ data: factories.employee(companyId) });
      const e2 = await tx.employee.create({ data: factories.employee(companyId) });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pourBase = (overrides: Record<string, unknown>) => factories.goldPour(siteId, { witness1Id: e1.id, witness2Id: e2.id, companyId, ...overrides } as any) as any;

      const soldPour = await tx.goldPour.create({
        data: pourBase({ grossWeight: 8, pourDate: new Date("2026-01-05T00:00:00.000Z") }),
      });
      const unsoldPour = await tx.goldPour.create({
        data: pourBase({ grossWeight: 6, pourDate: new Date("2026-01-06T00:00:00.000Z") }),
      });

      const receipt = await tx.buyerReceipt.create({
        data: {
          companyId,
          goldPourId: soldPour.id,
          receiptNumber: `RCP-SOLD-${Date.now()}`,
          receiptDate: new Date(),
          paidAmount: 640,
          paymentMethod: "BANK_TRANSFER",
        },
      });
      await tx.buyerReceiptBatch.create({
        data: {
          buyerReceiptId: receipt.id,
          goldPourId: soldPour.id,
          companyId,
          grams: 8,
        },
      });

      const unsold = await findUnsoldPours(tx, { companyId, siteId });
      const ids = unsold.map((p) => p.pourId);

      expect(ids).not.toContain(soldPour.id);
      expect(ids).toContain(unsoldPour.id);

      throw new Error("__rollback__");
    }).catch((e) => { if ((e as Error).message !== "__rollback__") throw e; });
  });
});

// ---------------------------------------------------------------------------
// findAccountingBacklog tests
// ---------------------------------------------------------------------------

describe("findAccountingBacklog", () => {
  it("returns only PENDING rows, not POSTED or FAILED", async () => {
    await prisma.$transaction(async (tx) => {
      const key = (s: string) => `test-backlog-${companyId.slice(0, 8)}-${s}-${Date.now()}`;

      await tx.accountingIntegrationEvent.create({
        data: {
          companyId,
          sourceDomain: "gold",
          sourceAction: "pour-created",
          eventKey: key("pending"),
          status: "PENDING",
        },
      });
      await tx.accountingIntegrationEvent.create({
        data: {
          companyId,
          sourceDomain: "gold",
          sourceAction: "pour-created",
          eventKey: key("posted"),
          status: "POSTED",
        },
      });
      await tx.accountingIntegrationEvent.create({
        data: {
          companyId,
          sourceDomain: "gold",
          sourceAction: "pour-created",
          eventKey: key("failed"),
          status: "FAILED",
        },
      });

      const backlog = await findAccountingBacklog(tx, { companyId });

      expect(backlog.length).toBeGreaterThanOrEqual(1);
      for (const item of backlog) {
        const raw = await tx.accountingIntegrationEvent.findUnique({ where: { id: item.id } });
        expect(raw?.status).toBe("PENDING");
      }

      throw new Error("__rollback__");
    }).catch((e) => { if ((e as Error).message !== "__rollback__") throw e; });
  });
});
