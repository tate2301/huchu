import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { prisma } from "@/lib/prisma";
import { addTestProduct } from "@/lib/retail/products/test-fixtures";
import { addTestSale, destroySalesShop, makeSalesShop, type SalesShop } from "@/lib/retail/floor/test-fixtures";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { EMPTIES_LOADERS } from "@/lib/reports/loaders/retail/empties";
import { resolveListQuery } from "@/lib/reports/list-query";
import { EMPTIES_REPORTS } from "@/lib/reports/definitions/retail/empties";

import {
  bookEmptiesReturn,
  EMPTIES_OFF,
  emptiesBalances,
  EmptiesRefusal,
  inStore,
  payBottlesBack,
  recordEmptiesCredit,
  recordEmptiesEntry,
  recordRefundEmpties,
  recordSaleEmpties,
} from "./empties";

/**
 * The Empties ledger (30-stock W-27, STK-09) against the test database: the
 * running balance per site, two writes at once, the tabs' balances, the
 * refusals in the sheet's words, the sale hooks `_services.ts` calls, and the
 * till's bottles-back payout with its journal.
 */

let shop: SalesShop;
let deltaId: string;
let castle: { productId: string; itemId: string };

const actor = () => ({ ...shop.manager(), userName: "Tafara Nyathi" });

async function refusal(work: Promise<unknown>): Promise<EmptiesRefusal> {
  try {
    await work;
  } catch (error) {
    if (error instanceof EmptiesRefusal) return error;
    throw error;
  }
  throw new Error("Expected a refusal");
}

/** Customers' empties brought back at the main site, written through the service as the seed does. */
async function bringBack(bottles: number, crates: number) {
  const shift = await openShift();
  return payBottlesBack({ actor: { companyId: shop.companyId, userId: shop.chipo, userName: "Chipo Dube", userRole: "CASHIER" }, shiftId: shift, bottles, crates });
}

let shiftId: string | null = null;
async function openShift(): Promise<string> {
  if (shiftId) return shiftId;
  shiftId = (
    await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: `SH-E-${Date.now()}`,
        registerId: shop.frontTill,
        registerCode: "FRONT",
        registerName: "Front till",
        siteId: shop.mainId,
        cashierId: shop.chipo,
        cashierName: "Chipo Dube",
        openingFloat: "100.00",
        expectedCash: "500.00",
      },
      select: { id: true },
    })
  ).id;
  return shiftId;
}

beforeAll(async () => {
  shop = await makeSalesShop("Empties");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  deltaId = (await prisma.vendor.create({ data: { companyId: shop.companyId, name: "Delta Beverages" }, select: { id: true } })).id;
  castle = await addTestProduct(
    shop.companyId,
    { name: "Castle Lager 340ml", price: "1.20", cost: "0.86", returnable: true, depositAmount: "0.10" },
    { onHand: 200 },
  );
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.retailEmptiesEntry.deleteMany({ where: { companyId, returnId: { not: null } } });
  await prisma.retailEmptiesEntry.deleteMany({ where: { companyId } });
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.retailCashMovement.deleteMany({ where: { companyId } });
  await prisma.retailShift.updateMany({ where: { companyId }, data: { status: "CLOSED" } });
  await prisma.retailSale.updateMany({ where: { companyId }, data: { shiftId: null } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await destroySalesShop(shop);
});

describe("the running balance", () => {
  it("adds bottles back and takes a return off, site by site", async () => {
    await bringBack(400, 30);
    await bringBack(12, 1);
    expect(await inStore(prisma, shop.mainId)).toEqual({ bottles: 412, crates: 31 });

    const booked = await prisma.$transaction((tx) =>
      bookEmptiesReturn(tx, { actor: actor(), supplierId: deltaId, bottles: 240, crates: 20, note: "The next delivery, 7 October" }),
    );
    expect(booked.deposit.toFixed(2)).toBe("84.00");
    expect(await inStore(prisma, shop.mainId)).toEqual({ bottles: 172, crates: 11 });
    const entry = await prisma.retailEmptiesEntry.findUniqueOrThrow({ where: { id: booked.id } });
    expect(entry).toMatchObject({ kind: "RETURNED_TO_SUPPLIER", bottles: -240, crates: -20, bottlesAfter: 172, cratesAfter: 11, supplierName: "Delta Beverages" });
  });

  it("keeps two writes at once consistent: no lost update", async () => {
    const before = await inStore(prisma, shop.mainId);
    await Promise.all([bringBack(5, 0), bringBack(7, 1)]);
    expect(await inStore(prisma, shop.mainId)).toEqual({ bottles: before.bottles + 12, crates: before.crates + 1 });
    const last = await prisma.retailEmptiesEntry.findMany({
      where: { siteId: shop.mainId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 2,
    });
    const afters = last.map((entry) => entry.bottlesAfter).sort((a, b) => a - b);
    expect(afters[1]! - afters[0]!).toBe(last.find((entry) => entry.bottlesAfter === afters[1])!.bottles);
  });

  it("refuses an entry dated after now, which would hide every live write", async () => {
    const before = await inStore(prisma, shop.mainId);
    await expect(
      prisma.$transaction((tx) =>
        recordEmptiesEntry(tx, { companyId: shop.companyId, siteId: shop.mainId, kind: "BOTTLES_BACK", bottles: 1, deposit: new Prisma.Decimal("-0.10"), at: new Date(Date.now() + 60 * 60 * 1000) }),
      ),
    ).rejects.toThrow("after now");
    expect(await inStore(prisma, shop.mainId)).toEqual(before);
  });

  it("refuses more than is in the store, under the field", async () => {
    const now = await inStore(prisma, shop.mainId);
    const refused = await refusal(
      prisma.$transaction((tx) => bookEmptiesReturn(tx, { actor: actor(), supplierId: deltaId, bottles: now.bottles + 1, crates: 0, note: "x" })),
    );
    expect(refused.status).toBe(400);
    expect(refused.fieldErrors).toEqual({ bottles: `Only ${now.bottles} bottles in the store.` });
    const none = await refusal(prisma.$transaction((tx) => bookEmptiesReturn(tx, { actor: actor(), supplierId: deltaId, bottles: 0, crates: 0, note: "x" })));
    expect(none.fieldErrors).toEqual({ bottles: "Say how many bottles or crates." });
  });
});

describe("credits", () => {
  it("lowers what is owed, and refuses more than is owed with the sentence", async () => {
    const booked = await prisma.$transaction((tx) => bookEmptiesReturn(tx, { actor: actor(), supplierId: deltaId, bottles: 120, crates: 10, reference: "GRN-0005", note: "x" }));
    const owedBefore = (await emptiesBalances(prisma, shop.companyId)).owed;
    const over = await refusal(prisma.$transaction((tx) => recordEmptiesCredit(tx, { actor: actor(), returnId: booked.id, creditNote: "CN-2211", amount: "50.00" })));
    expect(over.fieldErrors).toEqual({ amount: "Delta Beverages owes US$42.00 on this return." });
    expect(booked.deposit.toFixed(2)).toBe("42.00");
    await prisma.$transaction((tx) => recordEmptiesCredit(tx, { actor: actor(), returnId: booked.id, creditNote: "CN-2211", amount: "42.00" }));
    expect((await emptiesBalances(prisma, shop.companyId)).owed.toFixed(2)).toBe(owedBefore.minus(42).toFixed(2));
    const again = await refusal(prisma.$transaction((tx) => recordEmptiesCredit(tx, { actor: actor(), returnId: booked.id, creditNote: "CN-2212", amount: "0.01" })));
    expect(again.fieldErrors).toEqual({ amount: "Delta Beverages owes US$0.00 on this return." });
  });
});

describe("the sale hooks _services.ts calls", () => {
  it("writes a sale's deposit with its number, and the empties it took back", async () => {
    const sale = await addTestSale(shop, {
      saleNo: `SALE-E${Date.now()}`,
      at: new Date(),
      lines: [{ item: castle, name: "Castle Lager 340ml", quantity: 24, price: "1.20", cost: "0.86", deposit: "1.20" }],
      deposit: "1.20",
    });
    const saleNo = (await prisma.retailSale.findUniqueOrThrow({ where: { id: sale.id } })).saleNo;
    const before = await inStore(prisma, shop.mainId);
    await prisma.$transaction((tx) =>
      recordSaleEmpties(tx, {
        companyId: shop.companyId,
        siteId: shop.mainId,
        saleId: sale.id,
        saleNo,
        depositAmount: "1.20",
        lines: [{ productId: castle.productId, emptiesBack: 12 }],
      }),
    );
    const entries = await prisma.retailEmptiesEntry.findMany({ where: { saleId: sale.id }, orderBy: { kind: "asc" } });
    const charged = entries.find((entry) => entry.kind === "DEPOSIT_CHARGED")!;
    const back = entries.find((entry) => entry.kind === "BOTTLES_BACK")!;
    // Gross: the 1.20 the sale kept plus the 1.20 its twelve empties took off.
    expect(charged).toMatchObject({ reference: saleNo, bottles: 0, crates: 0 });
    expect(charged.deposit.toFixed(2)).toBe("2.40");
    expect(back).toMatchObject({ reference: saleNo, bottles: 12 });
    expect(back.deposit.toFixed(2)).toBe("-1.20");
    expect(await inStore(prisma, shop.mainId)).toEqual({ bottles: before.bottles + 12, crates: before.crates });
  });

  it("writes a refund's deposit handed back", async () => {
    const refund = await addTestSale(shop, {
      saleNo: `RFD-E${Date.now()}`,
      at: new Date(),
      saleType: "REFUND",
      lines: [{ item: castle, name: "Castle Lager 340ml", quantity: 6, price: "-1.20", cost: "0.86", deposit: "-0.60" }],
      deposit: "-0.60",
    });
    await prisma.$transaction((tx) =>
      recordRefundEmpties(tx, { companyId: shop.companyId, siteId: shop.mainId, saleId: refund.id, saleNo: "RFD-1", depositAmount: "-0.60" }),
    );
    const [entry] = await prisma.retailEmptiesEntry.findMany({ where: { saleId: refund.id } });
    expect(entry).toMatchObject({ kind: "DEPOSIT_REFUNDED", bottles: 0 });
    expect(entry!.deposit.toFixed(2)).toBe("-0.60");
  });
});

describe("the tabs", () => {
  it("badge the held and owed balances, over the whole ledger", async () => {
    const list = EMPTIES_REPORTS[0]!.list!;
    const query = resolveListQuery(list, { page: 1, size: 50, filters: {} }, {}, { role: "MANAGER", seeCost: true });
    const page = await EMPTIES_LOADERS["retail-empties"]!.page!(
      { companyId: shop.companyId, role: "MANAGER", userId: shop.managerId } as never,
      { ...query, tab: "held" },
    );
    const balances = await emptiesBalances(prisma, shop.companyId);
    expect(page.tabSums?.held.toFixed(2)).toBe(balances.held.toFixed(2));
    expect(page.tabSums?.owed.toFixed(2)).toBe(balances.owed.toFixed(2));
    expect(page.rows.every((row) => ["DEPOSIT_CHARGED", "DEPOSIT_REFUNDED", "BOTTLES_BACK"].includes(String(row.kindCode)))).toBe(true);
  });

  it("say when as Today 18:14, and leave a deposit's empties blank", async () => {
    const list = EMPTIES_REPORTS[0]!.list!;
    const query = resolveListQuery(list, { page: 1, size: 50, filters: {} }, {}, { role: "MANAGER", seeCost: true });
    const page = await EMPTIES_LOADERS["retail-empties"]!.page!({ companyId: shop.companyId, role: "MANAGER", userId: shop.managerId } as never, query);
    const back = page.rows.find((row) => row.kindCode === "BOTTLES_BACK")!;
    expect(back.whenText).toBe(`Today ${back.time}`);
    expect(back.items).toMatch(/^\+\d+/);
    const charged = page.rows.find((row) => row.kindCode === "DEPOSIT_CHARGED")!;
    expect(charged.bottles).toBeNull();
    const columns = Object.fromEntries(list.columns.map((column) => [column.key, column]));
    expect(columns.bottles).toMatchObject({ empty: "blank" });
    expect(columns.at).toMatchObject({ cell: "date", dayFormat: "relative", timeKey: "time" });
    expect(columns[list.card!.figure2!]).toBeDefined();
  });
});

describe("bottles back without a sale", () => {
  it("pays the deposit out of the drawer, writes the entry and posts Dr 2240 / Cr 1000", async () => {
    const shift = await openShift();
    const expectedBefore = Number((await prisma.retailShift.findUniqueOrThrow({ where: { id: shift } })).expectedCash);
    const paid = await bringBack(24, 2);
    expect(paid.paid.toFixed(2)).toBe("8.40");
    const movement = await prisma.retailCashMovement.findUniqueOrThrow({ where: { id: paid.movementId } });
    expect(movement).toMatchObject({ type: "PAYOUT", reasonCode: "BOTTLES_BACK", reason: "Bottles back", shiftId: shift });
    const entry = await prisma.retailEmptiesEntry.findUniqueOrThrow({ where: { id: paid.entryId } });
    expect(entry).toMatchObject({ kind: "BOTTLES_BACK", bottles: 24, crates: 2 });
    expect(entry.deposit.toFixed(2)).toBe("-8.40");
    expect(Number((await prisma.retailShift.findUniqueOrThrow({ where: { id: shift } })).expectedCash)).toBeCloseTo(expectedBefore - 8.4, 2);

    await runRetailPosting(shop.companyId, "BY_HAND", null);
    const [journal] = await prisma.journalEntry.findMany({
      where: { companyId: shop.companyId, sourceType: "RETAIL_BOTTLES_BACK", sourceId: paid.movementId },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });
    const lines = (journal?.lines ?? []).map((line) => ({ code: line.account.code, debit: Number(line.debit), credit: Number(line.credit) }));
    expect(lines).toEqual(
      expect.arrayContaining([
        { code: "2240", debit: 8.4, credit: 0 },
        { code: "1000", debit: 0, credit: 8.4 },
      ]),
    );
  });

  it("refuses a shift that is not the caller's", async () => {
    const shift = await openShift();
    const refused = await refusal(payBottlesBack({ actor: { ...actor() }, shiftId: shift, bottles: 1, crates: 0 }));
    expect(refused).toMatchObject({ status: 409, message: "Open a shift to pay out." });
  });
});

describe("the switch", () => {
  it("refuses every write while empties and deposits is off", async () => {
    await prisma.retailShopProfile.update({ where: { companyId: shop.companyId }, data: { emptiesAndDeposits: false } });
    try {
      const refused = await refusal(prisma.$transaction((tx) => bookEmptiesReturn(tx, { actor: actor(), supplierId: deltaId, bottles: 1, crates: 0, note: "x" })));
      expect(refused).toMatchObject({ status: 409, message: EMPTIES_OFF });
    } finally {
      await prisma.retailShopProfile.update({ where: { companyId: shop.companyId }, data: { emptiesAndDeposits: true } });
    }
  });
});
