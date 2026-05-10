// MIGRATION WITNESS: fails on current schema, passes after migration 20260510200001_add_correction_models

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { factories } from "@/lib/gold/test-factories";

let companyId: string;
let userId: string;
let siteId: string;
let witness1Id: string;
let witness2Id: string;
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
  // GoldPour requires real Employee FKs for witness1Id/witness2Id — seed two.
  const w1 = await prisma.employee.create({ data: factories.employee(companyId) });
  witness1Id = w1.id;
  const w2 = await prisma.employee.create({ data: factories.employee(companyId) });
  witness2Id = w2.id;
  const pour = await prisma.goldPour.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { ...factories.goldPour(siteId, { witness1Id, witness2Id }), companyId } as any,
  });
  pourId = pour.id;
  // Omit paidValueUsd — dropped in Epic 7; paidAmount is canonical per §8 Q2
  const receiptFactory = factories.buyerReceipt(pourId);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { paidValueUsd: _paidValueUsd, ...receiptData } = receiptFactory as typeof receiptFactory & { paidValueUsd?: unknown };
  const receipt = await prisma.buyerReceipt.create({
    data: { ...receiptData, companyId },
  });
  receiptId = receipt.id;
});

afterAll(async () => {
  await prisma.buyerReceiptCorrection.deleteMany({ where: { companyId } });
  await prisma.goldLedgerCorrection.deleteMany({ where: { companyId } });
  await prisma.buyerReceipt.deleteMany({ where: { companyId } });
  await prisma.goldPour.deleteMany({ where: { companyId } });
  await prisma.employee.deleteMany({ where: { companyId } });
  await prisma.site.delete({ where: { id: siteId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("Correction models — Epic 7 schema", () => {
  it("GoldLedgerCorrection writes and reads", async () => {
    const c = await prisma.goldLedgerCorrection.create({
      data: {
        companyId,
        entityType: "GoldPour",
        entityId: pourId,
        type: "ADJUST_GRAMS",
        reason: "transcription error",
        deltaGrams: -0.5,
        createdById: userId,
      },
    });
    expect(c.id).toBeTruthy();
    expect(c.type).toBe("ADJUST_GRAMS");
  });

  it("BuyerReceiptCorrection writes and is linked to receipt", async () => {
    const c = await prisma.buyerReceiptCorrection.create({
      data: {
        buyerReceiptId: receiptId,
        companyId,
        type: "ADJUST_AMOUNT",
        reason: "buyer disputed",
        deltaAmountUsd: 50.0,
        createdById: userId,
      },
    });
    expect(c.id).toBeTruthy();
    expect(c.type).toBe("ADJUST_AMOUNT");
    await prisma.buyerReceiptCorrection.delete({ where: { id: c.id } });
  });

  it("BuyerReceipt no longer has paidValueUsd", async () => {
    const r = await prisma.buyerReceipt.findUnique({ where: { id: receiptId } });
    expect(r).toBeTruthy();
    // @ts-expect-error — paidValueUsd was dropped in Epic 7
    expect(r!.paidValueUsd).toBeUndefined();
  });
});
