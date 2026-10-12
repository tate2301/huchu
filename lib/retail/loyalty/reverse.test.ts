import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { balance } from "./ledger";
import { reversePoints } from "./reverse";
import { dropLoyaltyShops, ledgerRow, loyaltyShop, testSale } from "./test-fixtures";

const made: string[] = [];
afterAll(() => dropLoyaltyShops(made));

const refund = (shop: Parameters<typeof testSale>[0], saleId: string, total: string, customerId: string) =>
  testSale(shop, { total, saleType: "REFUND", sourceSaleId: saleId, customerId });

describe("points back on a refund or a void", () => {
  it("takes back all 32 a fully refunded US$21.40 sale earned", async () => {
    const shop = await loyaltyShop("Points full refund");
    made.push(shop.companyId);
    const saleId = await testSale(shop, { total: "21.40", customerId: shop.customerId });
    await ledgerRow(shop, { customerId: shop.customerId, kind: "EARNED", points: 32, saleId, value: "0.32" });
    await ledgerRow(shop, { customerId: shop.customerId, kind: "EARNED", points: 100 });
    const refundId = await refund(shop, saleId, "-21.40", shop.customerId);
    await prisma.$transaction((tx) => reversePoints(tx, { saleId, reversalSaleId: refundId, share: 1 }));
    const rows = await prisma.retailPointsEntry.findMany({ where: { saleId: refundId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "REVERSED", points: -32, note: null });
    expect(await balance(prisma, shop.customerId)).toBe(100);
  });

  it("rounds a part refund's share and never reverses more than the sale earned", async () => {
    const shop = await loyaltyShop("Points part refund");
    made.push(shop.companyId);
    const saleId = await testSale(shop, { total: "17.60", customerId: shop.customerId });
    await ledgerRow(shop, { customerId: shop.customerId, kind: "EARNED", points: 17, saleId });
    await ledgerRow(shop, { customerId: shop.customerId, kind: "EARNED", points: 100 });
    // US$2.80 of US$17.60 back: 17 × 0.159 = 2.7, so 3.
    const first = await refund(shop, saleId, "-2.80", shop.customerId);
    await prisma.$transaction((tx) => reversePoints(tx, { saleId, reversalSaleId: first, share: 2.8 / 17.6 }));
    expect(await prisma.retailPointsEntry.findFirst({ where: { saleId: first }, select: { points: true } })).toEqual({ points: -3 });
    // The rest back: what is left of the 17, not 17 again.
    const second = await refund(shop, saleId, "-14.80", shop.customerId);
    await prisma.$transaction((tx) => reversePoints(tx, { saleId, reversalSaleId: second, share: 1 }));
    expect(await prisma.retailPointsEntry.findFirst({ where: { saleId: second }, select: { points: true } })).toEqual({ points: -14 });
    expect(await balance(prisma, shop.customerId)).toBe(100);
  });

  it("gives back points the sale spent, and never takes the balance below nothing", async () => {
    const shop = await loyaltyShop("Points below zero");
    made.push(shop.companyId);
    const saleId = await testSale(shop, { total: "21.40", customerId: shop.customerId });
    await ledgerRow(shop, { customerId: shop.customerId, kind: "EARNED", points: 32, saleId });
    // They spent most of it since on another sale: 12 left.
    await ledgerRow(shop, { customerId: shop.customerId, kind: "SPENT", points: -20 });
    const voidId = await testSale(shop, { total: "-21.40", saleType: "VOID", sourceSaleId: saleId, customerId: shop.customerId });
    await prisma.$transaction((tx) => reversePoints(tx, { saleId, reversalSaleId: voidId, share: 1 }));
    const row = await prisma.retailPointsEntry.findFirstOrThrow({ where: { saleId: voidId } });
    expect(row).toMatchObject({ kind: "REVERSED", points: -12, note: "Only 12 could be taken back." });
    expect(await balance(prisma, shop.customerId)).toBe(0);

    // A sale that spent 500 and is voided gives the 500 back.
    const spentSale = await testSale(shop, { total: "5.00", customerId: shop.customerId });
    await ledgerRow(shop, { customerId: shop.customerId, kind: "EARNED", points: 500 });
    await ledgerRow(shop, { customerId: shop.customerId, kind: "SPENT", points: -500, saleId: spentSale, value: "5.00" });
    const spentVoid = await testSale(shop, { total: "-5.00", saleType: "VOID", sourceSaleId: spentSale, customerId: shop.customerId });
    await prisma.$transaction((tx) => reversePoints(tx, { saleId: spentSale, reversalSaleId: spentVoid, share: 1 }));
    const back = await prisma.retailPointsEntry.findFirstOrThrow({ where: { saleId: spentVoid } });
    expect(back).toMatchObject({ kind: "REVERSED", points: 500 });
    expect(back.value.toFixed(2)).toBe("5.00");
    expect(await balance(prisma, shop.customerId)).toBe(500);
  });
});
