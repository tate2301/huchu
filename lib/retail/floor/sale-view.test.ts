/**
 * A sale as its record reads it (`loadSaleView`, 50-floor), against the test
 * database: its state through part and full refunds, its margin on cost,
 * the till's takings by hour with the sale's hour marked, its fiscal state,
 * and a cashier who did not ring it not finding it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { loadSaleView } from "./sale-view";
import { addTestSale, destroySalesShop, makeSalesShop, type SalesShop } from "./test-fixtures";

let shop: SalesShop;
let sale: { id: string; lineIds: string[] };
let both: { id: string; lineIds: string[] };
let voidDoc: { id: string };
const owner = () => ({ userId: shop.ownerId, role: "SUPERADMIN" });
// 11:40 in Harare on Saturday 3 October 2026; the clock stands at 13:30 the same day.
const at = new Date("2026-10-03T09:40:00Z");
const now = new Date("2026-10-03T11:30:00Z");

beforeAll(async () => {
  shop = await makeSalesShop("SaleView");
  sale = await addTestSale(shop, {
    saleNo: "SALE-31866",
    at,
    lines: [
      { item: shop.johnnie, name: "Johnnie Walker Black 750ml", quantity: 1, price: "42.00", cost: "31.00", tax: "5.64" },
      { item: shop.ice, name: "Ice 2kg bag", quantity: 1, price: "2.20", cost: "1.10", tax: "0.30" },
    ],
    payments: [{ tender: "CARD", amount: "44.20", reference: "CBZ 4412 0988" }],
  });
  // The same till earlier: 08:10 and 11:05.
  await addTestSale(shop, { saleNo: "SALE-31800", at: new Date("2026-10-03T06:10:00Z"), lines: [{ item: shop.ice, name: "Ice 2kg bag", quantity: 2, price: "2.20", cost: "1.10" }] });
  await addTestSale(shop, { saleNo: "SALE-31860", at: new Date("2026-10-03T09:05:00Z"), lines: [{ item: shop.ice, name: "Ice 2kg bag", quantity: 1, price: "2.20", cost: "1.10" }] });
  both = await addTestSale(shop, {
    saleNo: "SALE-31870",
    at,
    lines: [
      { item: shop.johnnie, name: "Johnnie Walker Black 750ml", quantity: 2, price: "42.00", cost: "31.00" },
      { item: shop.ice, name: "Ice 2kg bag", quantity: 2, price: "2.20", cost: "1.10" },
    ],
  });
  const voided = await addTestSale(shop, { saleNo: "SALE-31858", at, lines: [{ item: shop.ice, name: "Ice 2kg bag", quantity: 1, price: "2.20", cost: "1.10" }], status: "VOIDED" });
  voidDoc = await addTestSale(shop, { saleNo: "VOID-0001", at, saleType: "VOID", sourceSaleId: voided.id, lines: [{ item: shop.ice, name: "Ice 2kg bag", quantity: -1, price: "2.20", cost: "1.10" }] });
}, 120_000);

afterAll(async () => {
  await destroySalesShop(shop);
}, 60_000);

describe("loadSaleView", () => {
  it("reads a sale as the board does: total, VAT, margin on cost, paid with, its lines", async () => {
    const view = await loadSaleView(shop.companyId, sale.id, owner(), now);
    expect(view).toMatchObject({
      saleNo: "SALE-31866",
      state: "SOLD",
      till: { name: "Front till" },
      cashier: { name: "Chipo Dube" },
      customer: null,
      priceList: "Retail",
      total: "44.20",
      vat: "5.94",
      vatRatePct: 15.5,
      items: 2,
      payments: [{ tender: "CARD", label: "Card", reference: "CBZ 4412 0988", amount: "44.20" }],
    });
    // (44.20 − 5.94) − 32.10 = 6.16, which is 19.2% on what it cost.
    expect(view?.margin).toEqual({ value: "6.16", onCostPct: 19.2 });
    expect(view?.lines.map((line) => [line.name, line.quantity, line.total])).toEqual([
      ["Johnnie Walker Black 750ml", 1, "42.00"],
      ["Ice 2kg bag", 1, "2.20"],
    ]);
  });

  it("hides the margin from a role that may not see cost", async () => {
    const view = await loadSaleView(shop.companyId, sale.id, { userId: shop.chipo, role: "CASHIER" }, now);
    expect(view?.margin).toBeNull();
  });

  it("draws this till's day by hour up to now, the sale's hour marked, and its week by day", async () => {
    const view = await loadSaleView(shop.companyId, sale.id, owner(), now);
    const today = view!.hourly.today;
    expect(today.labels).toEqual(["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00"]);
    expect(today.labels[today.mark]).toBe("11:00");
    expect(today.values[1]).toBe(4.4);
    // 11:00 holds SALE-31866, SALE-31860, SALE-31870 and the voided SALE-31858 with its void (nothing).
    expect(today.values[4]).toBe(44.2 + 2.2 + 88.4);
    expect(view!.hourly.week.labels).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(view!.hourly.week.mark).toBe(5);
  });

  it("is part refunded while a line has some left, refunded once every line is back", async () => {
    const line = (index: 0 | 1, quantity: number) => ({
      item: index === 0 ? shop.johnnie : shop.ice,
      name: index === 0 ? "Johnnie Walker Black 750ml" : "Ice 2kg bag",
      quantity: -quantity,
      price: index === 0 ? "42.00" : "2.20",
      cost: index === 0 ? "31.00" : "1.10",
      sourceLineId: both.lineIds[index],
    });
    await addTestSale(shop, { saleNo: "RFD-0001", at, saleType: "REFUND", sourceSaleId: both.id, lines: [line(0, 1)] });
    expect((await loadSaleView(shop.companyId, both.id, owner(), now))?.state).toBe("PART_REFUNDED");
    await addTestSale(shop, { saleNo: "RFD-0002", at: new Date(at.getTime() + 60_000), saleType: "REFUND", sourceSaleId: both.id, lines: [line(0, 1), line(1, 2)] });
    const view = await loadSaleView(shop.companyId, both.id, owner(), now);
    expect(view?.state).toBe("REFUNDED");
    expect(view?.refunds.map((refund) => refund.saleNo)).toEqual(["RFD-0001", "RFD-0002"]);
    expect(view?.can.refund).toBe(false);
  });

  it("says where the fiscal receipt stands", async () => {
    expect((await loadSaleView(shop.companyId, sale.id, owner(), now))?.fiscal.state).toBe("OFF");
    await prisma.retailSale.update({ where: { id: sale.id }, data: { fiscalWaitsSince: at } });
    expect((await loadSaleView(shop.companyId, sale.id, owner(), now))?.fiscal.state).toBe("WAITING");
    const receipt = await prisma.fiscalReceipt.create({
      data: { companyId: shop.companyId, retailSaleId: sale.id, status: "FAILED", lastError: "ZIMRA refused the receipt." },
    });
    expect((await loadSaleView(shop.companyId, sale.id, owner(), now))?.fiscal).toMatchObject({ state: "FAILED", error: "ZIMRA refused the receipt." });
    await prisma.fiscalReceipt.update({
      where: { id: receipt.id },
      data: { status: "SUCCESS", receiptNumber: "FDMS 0441-2209 / 31866", issuedAt: at, lastError: null },
    });
    await prisma.retailSale.update({ where: { id: sale.id }, data: { fiscalWaitsSince: null } });
    expect((await loadSaleView(shop.companyId, sale.id, owner(), now))?.fiscal).toMatchObject({ state: "SIGNED", receipt: "FDMS 0441-2209 / 31866" });
  });

  it("is missing for a cashier who did not ring it, and a void document is never shown", async () => {
    expect(await loadSaleView(shop.companyId, sale.id, { userId: shop.farai, role: "CASHIER" }, now)).toBeNull();
    expect(await loadSaleView(shop.companyId, sale.id, { userId: shop.chipo, role: "CASHIER" }, now)).not.toBeNull();
    expect(await loadSaleView(shop.companyId, voidDoc.id, owner(), now)).toBeNull();
    const voided = await prisma.retailSale.findFirstOrThrow({ where: { companyId: shop.companyId, saleNo: "SALE-31858" }, select: { id: true } });
    const view = await loadSaleView(shop.companyId, voided.id, owner(), now);
    expect(view?.state).toBe("VOIDED");
    expect(view?.can.update).toBe(false);
  });

});
