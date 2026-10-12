import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { DRAWER_CLOSED, DrawerClosed, drawerHint, noDrawer, resolveDrawer } from "./drawer";
import { destroySalesShop, makeSalesShop, type SalesShop } from "./test-fixtures";

/**
 * Which drawer a back-office cash act uses (decision 2, FLR-02): the drawer
 * picked, the sale's own shift, the open shift on its till, the person's own,
 * the only one, else the person is asked (stale drawers last), else none.
 * Against the test database.
 */

let shop: SalesShop;
let sideTill = "";
let n = 0;

async function open(input: { till: string; cashier: string; name: string; hoursAgo?: number }) {
  n += 1;
  return (
    await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: `SH-D${n}-${shop.companyId.slice(0, 6)}`,
        registerId: input.till,
        registerCode: `${input.name}-${n}`,
        registerName: input.name,
        siteId: shop.mainId,
        cashierId: input.cashier,
        cashierName: input.cashier === shop.chipo ? "Chipo Dube" : "Farai Moyo",
        openedAt: new Date(Date.now() - (input.hoursAgo ?? 1) * 60 * 60 * 1000),
      },
      select: { id: true },
    })
  ).id;
}

const ask = (input: Partial<Parameters<typeof resolveDrawer>[1]> = {}) =>
  resolveDrawer(prisma, { companyId: shop.companyId, siteId: shop.mainId, actorId: shop.managerId, ...input });

beforeAll(async () => {
  shop = await makeSalesShop("Drawers");
  sideTill = (
    await prisma.retailRegister.create({ data: { companyId: shop.companyId, code: `SIDE-${shop.companyId.slice(0, 6)}`, name: "Bar till", siteId: shop.mainId }, select: { id: true } })
  ).id;
});

beforeEach(async () => {
  await prisma.retailShift.deleteMany({ where: { companyId: shop.companyId } });
});

afterAll(async () => {
  await prisma.retailShift.deleteMany({ where: { companyId: shop?.companyId } });
  await destroySalesShop(shop);
});

describe("resolveDrawer", () => {
  it("says none when no drawer is open at the site", async () => {
    expect(await ask()).toEqual({ none: true });
  });

  it("takes the only open drawer at the site", async () => {
    const front = await open({ till: shop.frontTill, cashier: shop.chipo, name: "Front till" });
    const choice = await ask();
    expect("shift" in choice && choice.shift.id).toBe(front);
  });

  it("goes in order: the drawer picked, the sale's shift, its till, the person's own", async () => {
    const front = await open({ till: shop.frontTill, cashier: shop.chipo, name: "Front till" });
    const bar = await open({ till: sideTill, cashier: shop.farai, name: "Bar till" });
    const pick = async (input: Partial<Parameters<typeof resolveDrawer>[1]>) => {
      const choice = await ask(input);
      return "shift" in choice ? choice.shift.id : null;
    };
    expect(await pick({ chosenShiftId: bar, saleShiftId: front })).toBe(bar);
    expect(await pick({ saleShiftId: front, registerId: sideTill })).toBe(front);
    expect(await pick({ registerId: sideTill, actorId: shop.chipo })).toBe(bar);
    expect(await pick({ actorId: shop.farai })).toBe(bar);
  });

  it("refuses a picked drawer that has closed", async () => {
    const front = await open({ till: shop.frontTill, cashier: shop.chipo, name: "Front till" });
    await prisma.retailShift.update({ where: { id: front }, data: { status: "CLOSED", closedAt: new Date() } });
    await expect(ask({ chosenShiftId: front })).rejects.toBeInstanceOf(DrawerClosed);
    await expect(ask({ chosenShiftId: front })).rejects.toThrow(DRAWER_CLOSED);
  });

  it("asks when several are open, stale drawers last, then by till name", async () => {
    const front = await open({ till: shop.frontTill, cashier: shop.chipo, name: "Front till", hoursAgo: 52 });
    const bar = await open({ till: sideTill, cashier: shop.farai, name: "Bar till" });
    const choice = await ask();
    expect("choose" in choice && choice.choose).toEqual([
      { shiftId: bar, label: "Bar till · Farai Moyo", stale: false },
      { shiftId: front, label: "Front till · Chipo Dube", stale: true },
    ]);
  });
});

describe("the drawer's words", () => {
  it("say where the cash comes from, or where to open a shift", () => {
    expect(drawerHint({ registerName: "Front till", cashierName: "Chipo Dube" })).toBe("Cash comes out of the front till’s drawer (Chipo Dube).");
    expect(noDrawer("Harare Main Branch", "hand cash back")).toBe("Open a shift at Harare Main Branch to hand cash back.");
    expect(noDrawer("Harare Main Branch", "take cash")).toBe("Open a shift at Harare Main Branch to take cash.");
  });
});
