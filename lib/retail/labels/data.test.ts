import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { defaultListFor } from "@/lib/retail/products/test-fixtures";

import { isEan13, labelBarcode, labelData, nextOpening } from "./data";

/**
 * What a shelf label says (PRD-06), against the test database: the default
 * list's price or the one due before the shop opens, the was price only after
 * a drop in the last 60 days, EAN-13 or Code 128, and the copies.
 */

const DAY = 86_400_000;
const show = { price: true, was: true, barcode: true };
let companyId = "";
let listId = "";
const ids: Record<string, string> = {};

async function product(code: string, name: string, price: string, barcode: string | null) {
  const created = await prisma.product.create({ data: { companyId, code, name, barcode, standardPrice: new Prisma.Decimal(price) }, select: { id: true } });
  await prisma.productPrice.create({ data: { companyId, priceListId: listId, productId: created.id, unitPrice: new Prisma.Decimal(price) } });
  ids[code] = created.id;
  return created.id;
}

async function change(code: string, from: string | null, to: string, effectiveAt: Date, applied: boolean) {
  await prisma.productPriceChange.create({
    data: {
      companyId,
      priceListId: listId,
      productId: ids[code]!,
      fromPrice: from === null ? null : new Prisma.Decimal(from),
      toPrice: new Prisma.Decimal(to),
      source: applied ? "TYPED" : "BULK",
      effectiveAt,
      appliedAt: applied ? effectiveAt : null,
      createdAt: new Date(Math.min(effectiveAt.getTime(), Date.now())),
    },
  });
}

// 18:00 in Harare on 7 October: the shop opens again at 08:00 on the 8th.
const at = new Date("2026-10-07T16:00:00Z");

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  companyId = (await prisma.company.create({ data: { name: `Labels ${stamp}`, slug: `labels-${stamp}` }, select: { id: true } })).id;
  listId = await defaultListFor(companyId);

  await product("COKE-500", "Coca-Cola 500ml", "0.70", "6001586239666");
  await change("COKE-500", null, "0.75", new Date(at.getTime() - 40 * DAY), true);
  await change("COKE-500", "0.75", "0.70", new Date(at.getTime() - 10 * DAY), true);

  await product("AMARULA-750", "Amarula Cream 750ml", "18.25", "600123235259");
  await change("AMARULA-750", "17.50", "18.25", new Date(at.getTime() - 4 * DAY), true);

  await product("OLD-CUT", "Old cut", "5.00", "6001586239667");
  await change("OLD-CUT", "6.00", "5.00", new Date(at.getTime() - 70 * DAY), true);

  // Tonight at 22:00 Harare, before the shop opens: tomorrow's price. Another after the opening is not yet.
  await product("TONIGHT", "Tonight", "2.00", null);
  await change("TONIGHT", "2.00", "1.80", new Date("2026-10-07T20:00:00Z"), false);
  await product("LATER", "Later", "3.00", null);
  await change("LATER", "3.00", "2.50", new Date("2026-10-08T08:00:00Z"), false);
});

afterAll(async () => {
  if (companyId) await destroyProvisionedTenant(companyId);
});

const one = async (code: string, options: { copies?: number; show?: typeof show } = {}) => {
  const { labels } = await labelData(companyId, { productIds: [ids[code]!], show: options.show ?? show, copies: options.copies ?? 1, at });
  return labels[0];
};

describe("the next opening", () => {
  it("is today's 08:00 in Harare while it is still to come, else tomorrow's", () => {
    expect(nextOpening(new Date("2026-10-07T04:30:00Z")).toISOString()).toBe("2026-10-07T06:00:00.000Z");
    expect(nextOpening(at).toISOString()).toBe("2026-10-08T06:00:00.000Z");
    // 01:00 Harare on the 8th is still the night before.
    expect(nextOpening(new Date("2026-10-07T23:00:00Z")).toISOString()).toBe("2026-10-08T06:00:00.000Z");
  });
});

describe("a label's price", () => {
  it("is the default list's, or the one due before the shop opens", async () => {
    expect((await one("AMARULA-750"))?.price).toBe("US$18.25");
    expect(await one("TONIGHT")).toMatchObject({ price: "US$1.80", was: "US$2.00" });
    expect(await one("LATER")).toMatchObject({ price: "US$3.00", was: null });
  });

  it("strikes the was price only after a drop within 60 days", async () => {
    expect(await one("COKE-500")).toMatchObject({ price: "US$0.70", was: "US$0.75" });
    // Amarula rose: no was.
    expect((await one("AMARULA-750"))?.was).toBeNull();
    // A cut 70 days ago is old news.
    expect((await one("OLD-CUT"))?.was).toBeNull();
  });

  it("leaves out what is switched off", async () => {
    expect(await one("COKE-500", { show: { price: false, was: false, barcode: false } })).toMatchObject({
      price: null,
      was: null,
      barcode: null,
      symbology: null,
    });
  });
});

describe("a label's barcode", () => {
  it("is EAN-13 for a 13-digit barcode with its check digit, else Code 128 of the code", async () => {
    expect(await one("COKE-500")).toMatchObject({ barcode: "6001586239666", symbology: "EAN13" });
    expect(await one("AMARULA-750")).toMatchObject({ barcode: "AMARULA-750", symbology: "CODE128" });
    expect(await one("OLD-CUT")).toMatchObject({ barcode: "OLD-CUT", symbology: "CODE128" });
    expect(isEan13("6001586239666")).toBe(true);
    expect(isEan13("6001586239667")).toBe(false);
    expect(labelBarcode({ code: "X", barcode: "600158 6239666" })).toEqual({ barcode: "6001586239666", symbology: "EAN13" });
  });
});

describe("copies", () => {
  it("carries the copies of each, in name order, the company's products only", async () => {
    const { labels } = await labelData(companyId, {
      productIds: [ids["COKE-500"]!, ids["AMARULA-750"]!, "00000000-0000-4000-8000-000000000000"],
      show,
      copies: 3,
      at,
    });
    expect(labels.map((label) => [label.name, label.copies])).toEqual([
      ["Amarula Cream 750ml", 3],
      ["Coca-Cola 500ml", 3],
    ]);
  });
});
