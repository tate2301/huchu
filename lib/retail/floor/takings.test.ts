/**
 * Takings (decision 10): the one sum every floor page reads. A sale and its
 * void come to nothing, a refund takes off, a deposit is never takings, and
 * cents add up exactly. Checked on the rule and on rows in the test database.
 */
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { sumTakings, takingsWhere } from "./takings";
import { addTestSale, destroySalesShop, makeSalesShop, type SalesShop } from "./test-fixtures";

describe("sumTakings", () => {
  it("adds cents exactly", () => {
    expect(sumTakings([{ baseAmount: "0.1" }, { baseAmount: "0.2" }]).toFixed(2)).toBe("0.30");
    expect(sumTakings([{ baseAmount: "0.1" }, { baseAmount: "0.2" }]).equals(new Prisma.Decimal("0.3"))).toBe(true);
    expect(sumTakings(Array.from({ length: 10 }, () => ({ baseAmount: "0.10" }))).toFixed(2)).toBe("1.00");
  });

  it("nets a sale and its void to nothing, and takes a refund off", () => {
    expect(sumTakings([{ baseAmount: "44.20" }, { baseAmount: "-44.20" }]).toFixed(2)).toBe("0.00");
    expect(sumTakings([{ baseAmount: "27.90" }, { baseAmount: "-27.90" }, { baseAmount: "9.30" }]).toFixed(2)).toBe("9.30");
  });
});

describe("takingsWhere over the tables", () => {
  let shop: SalesShop;
  const at = new Date("2026-10-03T09:40:00Z");

  beforeAll(async () => {
    shop = await makeSalesShop("Takings");
    const line = { item: shop.johnnie, name: "Johnnie Walker Black 750ml", price: "42.00", cost: "31.00" };
    const sold = await addTestSale(shop, { saleNo: "SALE-00001", at, lines: [{ ...line, quantity: 1 }], deposit: "0.50" });
    await addTestSale(shop, { saleNo: "VOID-0001", at, saleType: "VOID", sourceSaleId: sold.id, lines: [{ ...line, quantity: -1, price: "42.00" }] });
    await prisma.retailSale.update({ where: { id: sold.id }, data: { status: "VOIDED" } });
    const kept = await addTestSale(shop, {
      saleNo: "SALE-00002",
      at,
      lines: [{ item: shop.ice, name: "Ice 2kg bag", price: "2.20", cost: "1.10", quantity: 3, deposit: "1.50" }],
      deposit: "1.50",
    });
    await addTestSale(shop, {
      saleNo: "RFD-0001",
      at,
      saleType: "REFUND",
      sourceSaleId: kept.id,
      lines: [{ item: shop.ice, name: "Ice 2kg bag", price: "2.20", cost: "1.10", quantity: -1 }],
    });
    // Another day: outside the range.
    await addTestSale(shop, { saleNo: "SALE-00003", at: new Date("2026-10-04T09:00:00Z"), lines: [{ ...line, quantity: 1 }] });
  }, 120_000);

  afterAll(async () => {
    await destroySalesShop(shop);
  }, 60_000);

  it("keeps the voided sale and its void, which net to nothing; the refund takes off; deposits stay out", async () => {
    const rows = await prisma.retailSale.findMany({
      where: takingsWhere({ companyId: shop.companyId, from: new Date("2026-10-03T00:00:00Z"), to: new Date("2026-10-04T00:00:00Z") }),
      select: { saleNo: true, baseAmount: true, depositAmount: true },
    });
    expect(rows.map((row) => row.saleNo).sort()).toEqual(["RFD-0001", "SALE-00001", "SALE-00002", "VOID-0001"]);
    // 42.00 − 42.00 + 6.60 − 2.20: the 2.00 of deposits is not in it.
    expect(sumTakings(rows).toFixed(2)).toBe("4.40");
  });

  it("scopes by site and by shift", async () => {
    expect(takingsWhere({ companyId: "c", siteId: "s", shiftIds: ["a"] })).toMatchObject({ siteId: "s", shiftId: { in: ["a"] } });
    const elsewhere = await prisma.retailSale.count({ where: takingsWhere({ companyId: shop.companyId, siteId: shop.secondId }) });
    expect(elsewhere).toBe(0);
  });
});
