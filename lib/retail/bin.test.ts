/**
 * The bin, against a real database (W-63): a product, promotion and category
 * move in through their own services with a `RETAIL_RECORD.BINNED` event, are
 * listed soonest gone first with who moved them, and come back with
 * `RESTORED` as they stood — refused twice, refused for another company, and
 * refused after 30 days with 410. Deleting for good deletes what nothing
 * refers to and keeps the rest, out of the bin for good; the nightly purge
 * does the same, once, with nobody as the actor.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { deleteCategory } from "./categories";
import {
  binState,
  BinRefusal,
  deleteFromBinForGood,
  listBinEntries,
  moveToBin,
  purgeExpiredBin,
  restoreFromBin,
  restoreManyFromBin,
} from "./bin";
import { addTestProduct } from "./products/test-fixtures";
import { loadShelfListing } from "./shelf-listing";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let productId: string;
let productCode: string;
let promotionId: string;
let categoryId: string;

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Bin ${stamp}`, slug: `bin-${stamp}` }, select: { id: true } })).id;
  const siteId = (await prisma.site.create({ data: { companyId, code: `B-${stamp}`, name: "Borrowdale" }, select: { id: true } })).id;
  await prisma.stockLocation.create({ data: { siteId, code: `F-${stamp}`, name: "Shop floor" }, select: { id: true } });
  const gin = await addTestProduct(companyId, { name: "Gordon's Gin 750ml", price: "16.40" }, { siteId, onHand: 4 });
  productId = gin.productId;
  productCode = gin.code;
  // This suite reads the bin's own events.
  await prisma.platformAuditEvent.deleteMany({ where: { companyId, eventType: "RETAIL_PRODUCT.CREATED" } });
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
    expect(await listBinEntries(companyId, new Date("2026-10-04T00:00:00Z"))).toEqual([]);
    const moved = await moveToBin(actor(), { kind: "product", id: productId }, new Date("2026-10-03T12:52:00Z"));
    expect(moved).toEqual({ binnedAt: "2026-10-03T12:52:00.000Z", keptUntil: "2026-11-02T12:52:00.000Z" });
    await moveToBin(actor(), { kind: "promotion", id: promotionId }, new Date("2026-10-03T13:00:00Z"));
    await moveToBin(actor(), { kind: "category", id: categoryId }, new Date("2026-10-03T13:10:00Z"));

    const entries = await listBinEntries(companyId, new Date("2026-10-04T00:00:00Z"));
    // Soonest gone first: the order they went in.
    expect(entries.map((entry) => entry.kind)).toEqual(["product", "promotion", "category"]);
    expect(entries[0]).toMatchObject({
      name: "Gordon's Gin 750ml",
      reference: productCode,
      label: "Product",
      binnedBy: "Tafara Nyathi",
      binnedAt: new Date("2026-10-03T12:52:00Z"),
    });
    expect(entries[1]).toMatchObject({ label: "Promotion", reference: `P-${stamp}` });

    expect(await loadShelfListing(companyId, productId)).toBeNull();
    // Its prices stay: its record still reads the shelf's terms, VAT inside the price.
    expect(await prisma.productPrice.count({ where: { productId } })).toBe(1);
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

  it("brings a product back archived, at its price, with its event", async () => {
    expect(await restoreFromBin(actor(), { kind: "product", id: productId }, new Date("2026-10-04T08:00:00Z"))).toEqual({
      restored: true,
    });
    // Off every till until someone sells it again; its price rows survived the bin.
    expect(await loadShelfListing(companyId, productId)).toMatchObject({
      status: "INACTIVE",
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
    expect(await listBinEntries(companyId)).toEqual([]);
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

  it("takes one of two moves of the same record at once, with one event", async () => {
    const id = (await prisma.retailCategory.create({ data: { companyId, name: "Rum" }, select: { id: true } })).id;
    const outcomes = await Promise.all([
      refusal(moveToBin(actor(), { kind: "category", id })),
      refusal(moveToBin(actor(), { kind: "category", id })),
    ]);
    expect(outcomes.filter((outcome) => outcome === null)).toHaveLength(1);
    expect(outcomes).toContainEqual({ status: 409, message: "It is already in the bin" });
    expect((await events(id)).filter((event) => event.eventType === "RETAIL_RECORD.BINNED")).toHaveLength(1);
  });
});

describe("gone for good", () => {
  const owner = () => ({ companyId, userId: "00000000-0000-0000-0000-0000000000bb", userName: "Tendai Mhlanga", userRole: "SUPERADMIN" });

  it("restores several at once and says why one could not come back", async () => {
    const back = (await prisma.retailCategory.create({ data: { companyId, name: "Brandy" }, select: { id: true } })).id;
    const taken = (await prisma.retailCategory.create({ data: { companyId, name: "Whisky" }, select: { id: true } })).id;
    await moveToBin(actor(), { kind: "category", id: back });
    await moveToBin(actor(), { kind: "category", id: taken });
    await prisma.retailCategory.create({ data: { companyId, name: "Whisky" } });
    const answer = await restoreManyFromBin(actor(), [
      { kind: "category", id: back },
      { kind: "category", id: taken },
    ]);
    expect(answer.restored).toBe(1);
    expect(answer.refused).toEqual([
      {
        kind: "category",
        id: taken,
        name: "Whisky",
        why: "There is already a category called Whisky. Rename it, then restore this one.",
      },
    ]);
  });

  it("names who deleted a category from Products › Categories as who binned it", async () => {
    const id = (await prisma.retailCategory.create({ data: { companyId, name: "Liqueurs" }, select: { id: true } })).id;
    await deleteCategory(actor(), id, null);
    expect((await listBinEntries(companyId)).find((entry) => entry.id === id)).toMatchObject({
      label: "Category",
      binnedBy: "Tafara Nyathi",
    });
  });

  it("deletes a promotion never sold, with one PURGED event by the owner", async () => {
    const id = (
      await prisma.retailPromotion.create({
        data: { companyId, promoCode: `OLD-${stamp}`, name: "Happy hour (old)", type: "PERCENT", value: money(10) },
        select: { id: true },
      })
    ).id;
    await moveToBin(actor(), { kind: "promotion", id });
    expect(await deleteFromBinForGood(owner(), [{ kind: "promotion", id }])).toEqual({ deleted: 1, kept: 0 });
    expect(await prisma.retailPromotion.findUnique({ where: { id } })).toBeNull();
    const purged = (await events(id)).filter((event) => event.eventType === "RETAIL_RECORD.PURGED");
    expect(purged).toHaveLength(1);
    expect(JSON.parse(purged[0]!.payloadJson!)).toMatchObject({
      kind: "promotion",
      name: "Happy hour (old)",
      how: "deleted",
      automatic: false,
      actorName: "Tendai Mhlanga",
    });
    // Gone already: skipped, not counted.
    expect(await deleteFromBinForGood(owner(), [{ kind: "promotion", id }])).toEqual({ deleted: 0, kept: 0 });
  });

  it("keeps a product with stock on its line, out of the bin and past restoring", async () => {
    // The gin went back in the bin above; its line holds 4 bottles.
    expect(await deleteFromBinForGood(owner(), [{ kind: "product", id: productId }])).toEqual({ deleted: 0, kept: 1 });
    expect(await prisma.product.findUnique({ where: { id: productId }, select: { archivedAt: true } })).not.toBeNull();
    expect((await listBinEntries(companyId)).some((entry) => entry.id === productId)).toBe(false);
    expect(await refusal(restoreFromBin(actor(), { kind: "product", id: productId }))).toEqual({
      status: 410,
      message: "It was deleted for good.",
    });
    const state = await binState(companyId, "Product", productId, (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).archivedAt);
    expect(state).toMatchObject({ purged: true, restorable: false });
  });

  it("does not list what went in 31 days ago, and the nightly purge takes it once, by nobody", async () => {
    // Long ago, so the cut-off reaches nothing another test file has in its bin.
    const now = new Date("2020-02-01T00:00:00Z");
    const id = (await prisma.retailCategory.create({ data: { companyId, name: "Cane spirits" }, select: { id: true } })).id;
    await moveToBin(actor(), { kind: "category", id }, new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000));
    expect((await listBinEntries(companyId, now)).some((entry) => entry.id === id)).toBe(false);

    const first = await purgeExpiredBin(now);
    expect(first.deleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.retailCategory.findUnique({ where: { id } })).toBeNull();
    const purged = await prisma.platformAuditEvent.findMany({
      where: { companyId, entityId: id, eventType: "RETAIL_RECORD.PURGED" },
      select: { actor: true, payloadJson: true },
    });
    expect(purged).toHaveLength(1);
    expect(purged[0]!.actor).toBeNull();
    expect(JSON.parse(purged[0]!.payloadJson!)).toMatchObject({ kind: "category", name: "Cane spirits", how: "deleted", automatic: true });

    await purgeExpiredBin(now);
    expect(
      await prisma.platformAuditEvent.count({ where: { companyId, entityId: id, eventType: "RETAIL_RECORD.PURGED" } }),
    ).toBe(1);
  });
});
