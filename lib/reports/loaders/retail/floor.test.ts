/**
 * Shifts against a real Postgres: the list reads takings and sales only, and
 * Reports' Till shifts face also reads refunds, voids and no-sale opens (the
 * list never pays for them).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";

import { FLOOR_LOADERS } from "./floor";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let userId: string;
let shiftId: string;

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Floor ${stamp}`, slug: `floor-${stamp}` }, select: { id: true } })).id;
  userId = (await prisma.user.create({ data: { email: `chipo-${stamp}@shop.test`, name: "Chipo Dube", role: "CASHIER", companyId }, select: { id: true } })).id;
  const siteId = (await prisma.site.create({ data: { companyId, code: `H-${stamp}`, name: "Harare Main Branch" }, select: { id: true } })).id;
  const registerId = (await prisma.retailRegister.create({ data: { companyId, code: `T1-${stamp}`, name: "Front till", siteId }, select: { id: true } })).id;
  shiftId = (
    await prisma.retailShift.create({
      data: {
        companyId,
        shiftNo: `SH-${stamp}`,
        registerCode: `T1-${stamp}`,
        registerName: "Front till",
        registerId,
        siteId,
        cashierId: userId,
        cashierName: "Chipo Dube",
        openingFloat: 50,
      },
      select: { id: true },
    })
  ).id;
  const sale = (saleNo: string, saleType: "SALE" | "REFUND", status: "POSTED" | "VOIDED", baseAmount: number) =>
    prisma.retailSale.create({
      data: { companyId, saleNo: `${saleNo}-${stamp}`, saleType, status, siteId, registerId, shiftId, cashierId: userId, cashierName: "Chipo Dube", totalAmount: baseAmount, baseAmount },
    });
  await sale("S-1", "SALE", "POSTED", 20);
  await sale("S-2", "SALE", "VOIDED", 7);
  await sale("R-1", "REFUND", "POSTED", -3.5);
  for (const index of [1, 2]) {
    await prisma.platformAuditEvent.create({
      data: { companyId, eventType: RETAIL_AUDIT_EVENTS.drawerOpened, payloadJson: JSON.stringify({ shiftId }), eventHash: `drawer-${index}-${stamp}` },
    });
  }
});

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

const owner = () => ({ companyId, userId, role: "SUPERADMIN" });

describe("the shifts source", () => {
  it("reads refunds, voids and no-sale opens for the report face only", async () => {
    const face = (await FLOOR_LOADERS["retail-shifts"]!.load(owner(), {}, "report")).rows[0]!;
    expect(face).toMatchObject({ sales: 1, takings: 23.5, refunds: 3.5, voids: 7, noSaleOpens: 2 });
    const list = (await FLOOR_LOADERS["retail-shifts"]!.load(owner(), {}, "list")).rows[0]!;
    expect(list).toMatchObject({ sales: 1, takings: 23.5, refunds: 0, voids: 0, noSaleOpens: 0 });
  });
});
