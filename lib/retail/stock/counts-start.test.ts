/**
 * Starting a count (30-stock W-22 step 1), against a real Postgres: what a
 * count covers (categories with the ones inside them, a place, the given
 * products at its site only, an archived product only while it holds stock),
 * the name it gets, the refusals (nothing there, lines already being
 * counted), and how the counter is told: a notification and one WhatsApp in
 * the outbox when they have a phone, nothing when they start it themselves.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { countName } from "./count-words";
import { CountRefusal, previewCount, resolveCountLines, startCount, type CountStartInput } from "./counts";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let managerId: string;
let clerkId: string;
let hre: string;
let bdl: string;
let shop: string;
let back: string;
let spirits: string;
let whisky: string;
let beer: string;
const line: Record<string, string> = {};

const actor = () => ({ companyId, userId: managerId, userName: "Tafara Nyathi", userRole: "MANAGER" });

async function place(siteId: string, code: string, name: string) {
  return (await prisma.stockLocation.create({ data: { siteId, code, name }, select: { id: true } })).id;
}

async function stock(key: string, input: { siteId: string; locationId: string; name: string; categoryId: string | null; onHand: number; isActive?: boolean; shelf?: string }) {
  const product = await prisma.product.create({
    data: { companyId, code: `${key}-${stamp}`, name: input.name, categoryId: input.categoryId, isActive: input.isActive ?? true },
    select: { id: true },
  });
  line[key] = (
    await prisma.inventoryItem.create({
      data: {
        itemCode: `${key}-${stamp}`,
        name: input.name,
        category: "OTHER",
        unit: "bottle",
        siteId: input.siteId,
        locationId: input.locationId,
        productId: product.id,
        currentStock: quantity(input.onHand),
        unitCost: money(10),
        shelf: input.shelf ?? null,
      },
      select: { id: true },
    })
  ).id;
}

const input = (over: Partial<CountStartInput> = {}): CountStartInput => ({
  scope: "CATEGORIES",
  categoryIds: [spirits],
  siteId: hre,
  counterId: clerkId,
  blind: true,
  keepSelling: true,
  ...over,
});

async function refusal(promise: Promise<unknown>): Promise<CountRefusal> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CountRefusal) return error;
    throw error;
  }
  throw new Error("It was started.");
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Counts ${stamp}`, slug: `counts-${stamp}` }, select: { id: true } })).id;
  const user = async (name: string, role: "MANAGER" | "STOCK_CLERK", phone: string | null) =>
    (await prisma.user.create({ data: { email: `${role.toLowerCase()}-${stamp}@shop.test`, name, role, companyId, phone }, select: { id: true } })).id;
  managerId = await user("Tafara Nyathi", "MANAGER", null);
  clerkId = await user("Tendai Sibanda", "STOCK_CLERK", "+263776401187");
  hre = (await prisma.site.create({ data: { companyId, code: `HRE-${stamp}`, name: "Harare Main Branch" }, select: { id: true } })).id;
  bdl = (await prisma.site.create({ data: { companyId, code: `BDL-${stamp}`, name: "Borrowdale" }, select: { id: true } })).id;
  shop = await place(hre, "SHOP", "Shop floor");
  back = await place(hre, "BACK", "Back store");
  const bdlShop = await place(bdl, "SHOP", "Shop floor");
  await prisma.retailShopProfile.create({ data: { companyId, defaultSiteId: hre } });
  const category = async (name: string, parentId: string | null = null) =>
    (await prisma.retailCategory.create({ data: { companyId, name, parentId }, select: { id: true } })).id;
  spirits = await category("Spirits");
  whisky = await category("Whisky", spirits);
  beer = await category("Beer");

  await stock("gin", { siteId: hre, locationId: shop, name: "Gordon’s Gin 750ml", categoryId: spirits, onHand: 18, shelf: "Shelf 2, middle" });
  await stock("jameson", { siteId: hre, locationId: shop, name: "Jameson Irish Whiskey 750ml", categoryId: whisky, onHand: 9, shelf: "Shelf 2, top" });
  await stock("bols", { siteId: hre, locationId: shop, name: "Bols Brandy 750ml", categoryId: spirits, onHand: 6, isActive: false });
  await stock("oldgin", { siteId: hre, locationId: shop, name: "Old Gin 750ml", categoryId: spirits, onHand: 0, isActive: false });
  await stock("castle", { siteId: hre, locationId: back, name: "Castle Lager 340ml", categoryId: beer, onHand: 26 });
  await stock("bdlgin", { siteId: bdl, locationId: bdlShop, name: "Gordon’s Gin 750ml", categoryId: spirits, onHand: 4 });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.retailStockCount.deleteMany({ where: { companyId } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId } });
  await prisma.retailCategory.deleteMany({ where: { companyId, parentId: { not: null } } });
  await prisma.retailCategory.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
});

describe("what a count covers", () => {
  it("takes a category with the ones inside it, an archived product only while it holds stock, in shelf order", async () => {
    const lines = await resolveCountLines(prisma, { companyId, siteId: hre, scope: "CATEGORIES", categoryIds: [spirits] });
    expect(lines.map((row) => row.product)).toEqual(["Gordon’s Gin 750ml", "Jameson Irish Whiskey 750ml", "Bols Brandy 750ml"]);
    expect(lines.map((row) => row.id)).not.toContain(line.oldgin);
    expect(lines.map((row) => row.id)).not.toContain(line.bdlgin);
  });

  it("takes a place's lines, and only the given products kept at the site", async () => {
    expect((await resolveCountLines(prisma, { companyId, siteId: hre, scope: "PLACE", placeId: back })).map((row) => row.id)).toEqual([line.castle]);
    const products = await resolveCountLines(prisma, { companyId, siteId: hre, scope: "PRODUCTS", lineIds: [line.gin!, line.bdlgin!] });
    expect(products.map((row) => row.id)).toEqual([line.gin]);
    expect(await previewCount(companyId, { scope: "EVERYTHING" })).toEqual({ products: 4 });
  });

  it("names a count after what it covers", () => {
    expect(countName({ scope: "CATEGORIES", categories: ["Spirits"] })).toBe("Spirits shelf");
    expect(countName({ scope: "CATEGORIES", categories: ["Spirits", "Wine"] })).toBe("Spirits and Wine");
    expect(countName({ scope: "CATEGORIES", categories: ["Spirits", "Wine", "Beer", "Snacks"] })).toBe("Spirits, Wine and 2 more");
    expect(countName({ scope: "PLACE", place: "Cold room" })).toBe("Cold room");
    expect(countName({ scope: "PRODUCTS", products: ["Castle Lager 340ml"] })).toBe("Castle Lager 340ml");
    expect(countName({ scope: "PRODUCTS", products: ["A", "B", "C"] })).toBe("3 products");
    expect(countName({ scope: "EVERYTHING" })).toBe("Everything");
  });
});

describe("starting a count", () => {
  it("refuses a choice with nothing to count, under the field that chose it", async () => {
    const empty = await prisma.retailCategory.create({ data: { companyId, name: "Snacks" }, select: { id: true } });
    const refused = await refusal(startCount(actor(), input({ categoryIds: [empty.id] })));
    expect(refused.status).toBe(400);
    expect(refused.fieldErrors).toEqual({ cats: "Nothing to count there." });
    expect((await refusal(startCount(actor(), input({ counterId: companyId })))).fieldErrors).toMatchObject({ who: "Pick who counts." });
  });

  it("starts the count with on hand as expected, and tells the counter once on WhatsApp and in the app", async () => {
    const started = await startCount(actor(), input());
    expect(started).toMatchObject({ countNo: "CNT-0001", lines: 3, counter: { id: clerkId, name: "Tendai Sibanda" }, messaged: true });
    const count = await prisma.retailStockCount.findUniqueOrThrow({
      where: { id: started.id },
      select: { name: true, status: true, blind: true, lines: { select: { inventoryItemId: true, expected: true, sortKey: true } } },
    });
    expect(count).toMatchObject({ name: "Spirits shelf", status: "COUNTING", blind: true });
    expect(count.lines.find((row) => row.inventoryItemId === line.gin)).toMatchObject({ sortKey: "Shelf 2, middle|Gordon’s Gin 750ml" });
    expect(count.lines.find((row) => row.inventoryItemId === line.gin)!.expected.toNumber()).toBe(18);

    const messages = await prisma.retailMessage.findMany({ where: { companyId } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ status: "QUEUED", to: "+263776401187", template: "count-link", channel: "WHATSAPP" });
    expect(messages[0]!.body).toMatch(/^Tafara Nyathi asked you to count the spirits shelf at Harare Main Branch: .*\/retail\/stock\/counts\/[0-9a-f-]+\/count$/);
    const notice = await prisma.notification.findFirstOrThrow({
      where: { companyId, type: "RETAIL_COUNT_ASSIGNED" },
      select: { title: true, entityType: true, recipients: { select: { userId: true } } },
    });
    expect(notice).toMatchObject({ title: "CNT-0001 to count", entityType: "RETAIL_STOCK_COUNT", recipients: [{ userId: clerkId }] });

    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId, eventType: "RETAIL_STOCK_COUNT.STARTED" } });
    expect(JSON.parse(event.payloadJson ?? "{}")).toMatchObject({ countNo: "CNT-0001", lines: 3, counterId: clerkId, blind: true, keepSelling: true });
  });

  it("refuses lines already in an open count, naming it", async () => {
    const refused = await refusal(startCount(actor(), input({ scope: "PRODUCTS", categoryIds: undefined, lineIds: [line.gin!, line.jameson!] })));
    expect(refused.status).toBe(409);
    expect(refused.message).toBe("2 products are already being counted in CNT-0001. Finish that count first.");
  });

  it("tells nobody when the counter starts it themselves", async () => {
    const before = await prisma.retailMessage.count({ where: { companyId } });
    const started = await startCount(actor(), input({ scope: "PLACE", categoryIds: undefined, placeId: back, counterId: managerId }));
    expect(started).toMatchObject({ countNo: "CNT-0002", lines: 1, messaged: false });
    expect(await prisma.retailMessage.count({ where: { companyId } })).toBe(before);
    expect(await prisma.notification.count({ where: { companyId, entityId: started.id } })).toBe(0);
    expect((await prisma.retailStockCount.findUniqueOrThrow({ where: { id: started.id } })).name).toBe("Back store");
  });
});
