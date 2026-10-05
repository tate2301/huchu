/**
 * The bin, against a real database (W-63): a product, promotion and category
 * move in through their own services with a `RETAIL_RECORD.BINNED` event, are
 * listed newest first, and come back with `RESTORED` as they stood — refused
 * twice, refused for another company, and refused after 30 days with 410.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { binState, BinRefusal, listBin, moveToBin, restoreFromBin } from "./bin";
import { loadShelfListing, upsertShelfListing } from "./shelf-listing";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let productId: string;
let promotionId: string;
let categoryId: string;

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Bin ${stamp}`, slug: `bin-${stamp}` }, select: { id: true } })).id;
  const siteId = (await prisma.site.create({ data: { companyId, code: `B-${stamp}`, name: "Borrowdale" }, select: { id: true } })).id;
  const locationId = (
    await prisma.stockLocation.create({ data: { siteId, code: `F-${stamp}`, name: "Shop floor" }, select: { id: true } })
  ).id;
  const item = await prisma.inventoryItem.create({
    data: { itemCode: `BIN-${stamp}`, name: "Gin", category: "OTHER", unit: "bottle", siteId, locationId, currentStock: quantity(4) },
    select: { id: true },
  });
  productId = await upsertShelfListing({
    companyId, productId: null, sku: `GIN-${stamp}`, name: "Gordon's Gin 750ml", inventoryItemId: item.id, unitPrice: 16.4, taxPercent: 15,
  });
  promotionId = (
    await prisma.retailPromotion.create({
      data: { companyId, promoCode: `P-${stamp}`, name: "Case of Castle 5% off", type: "PERCENT", value: money(5) },
      select: { id: true },
    })
  ).id;
  categoryId = (await prisma.retailCategory.create({ data: { companyId, name: "Craft gin" }, select: { id: true } })).id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.productPrice.deleteMany({ where: { companyId } });
  await prisma.priceList.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.retailPromotion.deleteMany({ where: { companyId } });
  await prisma.retailCategory.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

const actor = () => ({ companyId, userId: "00000000-0000-0000-0000-0000000000aa", userName: "Tafara Nyathi", userRole: "MANAGER" });

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BinRefusal) return { status: error.status, message: error.message };
    throw error;
  }
  return null;
}

async function events(entityId: string) {
  return prisma.platformAuditEvent.findMany({
    where: { companyId, entityId },
    orderBy: { createdAt: "asc" },
    select: { eventType: true, entityType: true, payloadJson: true },
  });
}

describe("the bin", () => {
  it("moves each kind in, with its event, and lists what was moved", async () => {
    expect(await listBin(companyId)).toEqual([]);
    const moved = await moveToBin(actor(), { kind: "product", id: productId }, new Date("2026-10-03T12:52:00Z"));
    expect(moved).toEqual({ binnedAt: "2026-10-03T12:52:00.000Z", keptUntil: "2026-11-02T12:52:00.000Z" });
    await moveToBin(actor(), { kind: "promotion", id: promotionId });
    await moveToBin(actor(), { kind: "category", id: categoryId });

    const entries = await listBin(companyId);
    expect(entries.map((entry) => entry.kind).sort()).toEqual(["category", "product", "promotion"]);
    expect(entries.find((entry) => entry.kind === "product")?.detail).toBe(`GIN-${stamp} · last priced 16.40`);

    expect(await loadShelfListing(companyId, productId)).toBeNull();
    // Its record still reads the shelf's terms: VAT inside the price.
    expect(await loadShelfListing(companyId, productId, { includeBinned: true })).toMatchObject({
      unitPrice: 16.4,
      taxInclusive: true,
      binnedAt: "2026-10-03T12:52:00.000Z",
    });
    const [binned] = await events(productId);
    expect(binned).toMatchObject({ eventType: "RETAIL_RECORD.BINNED", entityType: "Product" });
    expect(JSON.parse(binned!.payloadJson!)).toMatchObject({ kind: "product", name: "Gordon's Gin 750ml", actorName: "Tafara Nyathi" });

    const state = await binState(companyId, "Product", productId, "2026-10-03T12:52:00Z", new Date("2026-10-04T00:00:00Z"));
    expect(state).toMatchObject({ keptUntil: "2026-11-02T12:52:00.000Z", restorable: true, by: { name: "Tafara Nyathi" } });
  });

  it("refuses to move a record twice, or another company's", async () => {
    expect(await refusal(moveToBin(actor(), { kind: "product", id: productId }))).toEqual({
      status: 409,
      message: "It is already in the bin",
    });
    expect(
      await refusal(
        moveToBin({ ...actor(), companyId: "00000000-0000-0000-0000-000000000000" }, { kind: "promotion", id: promotionId }),
      ),
    ).toEqual({ status: 404, message: "That is not this shop's" });
  });

  it("refuses a restore after 30 days with 410", async () => {
    expect(
      await refusal(restoreFromBin(actor(), { kind: "product", id: productId }, new Date("2026-11-03T12:53:00Z"))),
    ).toEqual({ status: 410, message: "It has been in the bin more than 30 days" });
  });

  it("brings a product back on sale at its price, with its event", async () => {
    expect(await restoreFromBin(actor(), { kind: "product", id: productId }, new Date("2026-10-04T08:00:00Z"))).toEqual({
      restored: true,
    });
    expect(await loadShelfListing(companyId, productId)).toMatchObject({
      status: "ACTIVE",
      unitPrice: 16.4,
      priceSource: "PRICE_LIST",
      binnedAt: null,
    });
    expect((await events(productId)).map((event) => event.eventType)).toEqual([
      "RETAIL_RECORD.BINNED",
      "RETAIL_RECORD.RESTORED",
    ]);
  });

  it("brings a promotion back inactive, and a category back in use", async () => {
    await restoreFromBin(actor(), { kind: "promotion", id: promotionId });
    expect(await prisma.retailPromotion.findUniqueOrThrow({ where: { id: promotionId } })).toMatchObject({
      archivedAt: null,
      status: "INACTIVE",
    });
    await restoreFromBin(actor(), { kind: "category", id: categoryId });
    expect(await listBin(companyId)).toEqual([]);
  });

  it("restores nothing that is not in the bin, and nothing of another company's", async () => {
    expect(await refusal(restoreFromBin(actor(), { kind: "product", id: productId }))).toEqual({
      status: 404,
      message: "That is not in the bin",
    });
    await moveToBin(actor(), { kind: "product", id: productId });
    expect(
      await refusal(
        restoreFromBin({ ...actor(), companyId: "00000000-0000-0000-0000-000000000000" }, { kind: "product", id: productId }),
      ),
    ).toEqual({ status: 404, message: "That is not in the bin" });
  });
});
