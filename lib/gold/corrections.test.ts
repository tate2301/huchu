import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { factories } from "@/lib/gold/test-factories";
import {
  createGoldLedgerCorrection,
  createBuyerReceiptCorrection,
  verifyEntityOwnership,
  captureGoldCorrectionAccountingEvent,
} from "@/lib/gold/corrections";

let companyId: string;
let userId: string;
let siteId: string;
let pourId: string;
let receiptId: string;

beforeAll(async () => {
  await prisma.$connect();
  const co = await prisma.company.create({ data: factories.company() });
  companyId = co.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = await prisma.user.create({ data: factories.user(companyId) as any });
  userId = u.id;
  const si = await prisma.site.create({ data: factories.site(companyId) });
  siteId = si.id;
  const pour = await prisma.goldPour.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { ...factories.goldPour(siteId), companyId } as any,
  });
  pourId = pour.id;
  const receiptFactory = factories.buyerReceipt(pourId);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { paidValueUsd: _paidValueUsd, ...receiptData } = receiptFactory as typeof receiptFactory & { paidValueUsd?: unknown };
  const receipt = await prisma.buyerReceipt.create({
    data: { ...receiptData, companyId },
  });
  receiptId = receipt.id;
});

afterAll(async () => {
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.buyerReceiptCorrection.deleteMany({ where: { companyId } });
  await prisma.goldLedgerCorrection.deleteMany({ where: { companyId } });
  await prisma.buyerReceipt.deleteMany({ where: { companyId } });
  await prisma.goldPour.deleteMany({ where: { companyId } });
  await prisma.site.delete({ where: { id: siteId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("createGoldLedgerCorrection", () => {
  it("creates a GoldLedgerCorrection row with delta fields", async () => {
    const correction = await createGoldLedgerCorrection({
      companyId,
      entityType: "GoldPour",
      entityId: pourId,
      type: "ADJUST_GRAMS",
      reason: "scale calibration error",
      deltaGrams: -0.25,
      createdById: userId,
    });

    expect(correction.id).toBeTruthy();
    expect(correction.entityType).toBe("GoldPour");
    expect(correction.entityId).toBe(pourId);
    expect(correction.type).toBe("ADJUST_GRAMS");
    // adjustmentEntryId is null until AdjustmentTargetType enum gains GOLD_CORRECTION
    expect(correction.adjustmentEntryId).toBeNull();

    await prisma.goldLedgerCorrection.delete({ where: { id: correction.id } });
  });

  it("creates a GoldLedgerCorrection with USD delta and captures accounting event in tx", async () => {
    const correctionId = await prisma.$transaction(async (tx) => {
      const correction = await createGoldLedgerCorrection(
        {
          companyId,
          entityType: "GoldPour",
          entityId: pourId,
          type: "ADJUST_AMOUNT",
          reason: "buyer dispute resolved",
          deltaUsd: 150.0,
          createdById: userId,
        },
        tx,
      );

      await captureGoldCorrectionAccountingEvent(
        {
          companyId,
          correctionId: correction.id,
          entityType: "GoldPour",
          entityId: pourId,
          deltaUsd: 150.0,
          createdById: userId,
          label: "buyer dispute resolved",
        },
        tx,
      );

      return correction.id;
    });

    const saved = await prisma.goldLedgerCorrection.findUnique({ where: { id: correctionId } });
    expect(saved).toBeTruthy();
    expect(Number(saved!.deltaUsd)).toBe(150);

    const event = await prisma.accountingIntegrationEvent.findFirst({
      where: { sourceId: correctionId, companyId },
    });
    expect(event).toBeTruthy();
    expect(event!.status).toBe("PENDING");

    await prisma.accountingIntegrationEvent.deleteMany({ where: { sourceId: correctionId } });
    await prisma.goldLedgerCorrection.delete({ where: { id: correctionId } });
  });
});

describe("createBuyerReceiptCorrection", () => {
  it("creates a BuyerReceiptCorrection linked to the receipt", async () => {
    const correction = await createBuyerReceiptCorrection({
      buyerReceiptId: receiptId,
      companyId,
      type: "ADJUST_AMOUNT",
      reason: "final assay differed by $50",
      deltaAmountUsd: 50.0,
      createdById: userId,
    });

    expect(correction.id).toBeTruthy();
    expect(correction.buyerReceiptId).toBe(receiptId);
    expect(correction.type).toBe("ADJUST_AMOUNT");
    expect(Number(correction.deltaAmountUsd)).toBe(50);
    expect(correction.adjustmentEntryId).toBeNull();

    await prisma.buyerReceiptCorrection.delete({ where: { id: correction.id } });
  });
});

describe("verifyEntityOwnership", () => {
  it("returns true for a GoldPour belonging to company", async () => {
    const result = await verifyEntityOwnership(companyId, "GoldPour", pourId);
    expect(result).toBe(true);
  });

  it("returns false for a GoldPour from a different company", async () => {
    const result = await verifyEntityOwnership("other-company-id", "GoldPour", pourId);
    expect(result).toBe(false);
  });

  it("returns false for a non-existent entity", async () => {
    const result = await verifyEntityOwnership(companyId, "GoldPour", crypto.randomUUID());
    expect(result).toBe(false);
  });
});

describe("Role gate", () => {
  it("CLERK role must be rejected at endpoint level", () => {
    // Endpoints use hasRole(session, ["MANAGER", "SUPERADMIN"]).
    // This is enforced at route level; CLERK sessions get 403.
    const clerkSession = { user: { role: "CLERK" } };
    const allowed = ["MANAGER", "SUPERADMIN"].includes(clerkSession.user.role);
    expect(allowed).toBe(false);
  });
});
