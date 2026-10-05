/**
 * A record's Activity (W-60) against a real database: its own events and its
 * shift's sales and cash movements, newest first, in words, with who did it
 * ("Automatic" when nobody), paged; another company's events are not read.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { auditCashMoved, auditRecordEdited, auditSalePosted, auditShiftOpened } from "./audit";
import { readRecordActivity, recordActivityType } from "./record-activity";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let otherId: string;
let shiftId: string;
let saleId: string;
let movementId: string;
let userId: string;

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Act ${stamp}`, slug: `act-${stamp}` }, select: { id: true } })).id;
  otherId = (await prisma.company.create({ data: { name: `Other ${stamp}`, slug: `oth-${stamp}` }, select: { id: true } })).id;
  userId = (
    await prisma.user.create({
      data: { email: `act-${stamp}@test.local`, name: "Chipo Dube", role: "CASHIER", companyId, password: "x" },
      select: { id: true },
    })
  ).id;
  const siteId = (await prisma.site.create({ data: { companyId, code: `A-${stamp}`, name: "Main" }, select: { id: true } })).id;
  const registerId = (await prisma.retailRegister.create({ data: { companyId, siteId, code: "TILL-1", name: "Front till" }, select: { id: true } })).id;
  shiftId = (
    await prisma.retailShift.create({
      data: {
        companyId,
        shiftNo: `SH-${stamp}`,
        registerCode: "TILL-1",
        registerName: "Front till",
        registerId,
        siteId,
        cashierId: userId,
        cashierName: "Chipo Dube",
        openingFloat: money(200),
      },
      select: { id: true },
    })
  ).id;
  saleId = (
    await prisma.retailSale.create({
      data: {
        companyId,
        saleNo: `SALE-${stamp}`,
        shiftId,
        siteId,
        cashierId: userId,
        cashierName: "Chipo Dube",
        subtotal: money(11.3),
        taxAmount: money(1.7),
        totalAmount: money(13),
        baseAmount: money(13),
      },
      select: { id: true },
    })
  ).id;
  movementId = (
    await prisma.retailCashMovement.create({
      data: { companyId, shiftId, type: "DROP_TO_SAFE", amount: money(20), baseAmount: money(20) },
      select: { id: true },
    })
  ).id;

  const actor = { companyId, userId, userName: "Chipo Dube", userRole: "CASHIER" };
  await auditShiftOpened(prisma, { actor, shiftId, shiftNo: "SH-1", siteId, registerCode: "TILL-1", cashierId: userId, openingFloat: "200" });
  await auditSalePosted(prisma, { actor, saleId, saleNo: "SALE-31862", shiftId, siteId, totalAmount: "13", currency: "USD", baseAmount: "13", lineCount: 2 });
  await auditCashMoved(prisma, {
    actor: { companyId, userId: null as unknown as string },
    movementId,
    shiftId,
    type: "DROP_TO_SAFE",
    reasonCode: "OTHER",
    amount: "20",
    currency: "USD",
    baseAmount: "20",
  });
  // Someone else's company, the same entity id: never read.
  await auditRecordEdited(prisma, {
    actor: { companyId: otherId, userId, userName: "Intruder" },
    entityType: "RetailShift",
    entityId: shiftId,
    field: "x",
    label: "X",
    from: "1",
    to: "2",
  });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: { in: [companyId, otherId] } } });
  await prisma.retailCashMovement.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherId] } } });
});

describe("a record's Activity", () => {
  it("reads the shift's own events and those of its sales and cash, newest first", async () => {
    const spec = recordActivityType("RetailShift")!;
    expect(await spec.exists(companyId, shiftId)).toBe(true);
    expect(await spec.exists(otherId, shiftId)).toBe(false);
    const page = await readRecordActivity(companyId, "RetailShift", shiftId, spec, { page: 1, size: 10 });
    expect(page.total).toBe(3);
    expect(page.rows.map((row) => row.what)).toEqual([
      "Dropped US$20.00 to the safe",
      "Sold SALE-31862 for US$13.00",
      "Opened with a float of US$200.00",
    ]);
    expect(page.rows[0]!.actor).toEqual({ id: null, name: "Automatic" });
    expect(page.rows[2]!.actor).toEqual({ id: userId, name: "Chipo Dube" });
    expect(page.rows[1]!.tone).toBe("ok");
  });

  it("pages", async () => {
    const spec = recordActivityType("RetailShift")!;
    const second = await readRecordActivity(companyId, "RetailShift", shiftId, spec, { page: 2, size: 2 });
    expect(second.total).toBe(3);
    expect(second.rows.map((row) => row.what)).toEqual(["Opened with a float of US$200.00"]);
  });

  it("knows only the types registered", () => {
    expect(recordActivityType("Product")?.read).toEqual(["retail.catalog", "view"]);
    expect(recordActivityType("toString")).toBeNull();
    expect(recordActivityType("Nope")).toBeNull();
  });
});
