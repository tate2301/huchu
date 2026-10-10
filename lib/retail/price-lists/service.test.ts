/**
 * Price lists (PRD-05), against the test database: a list made from Retail
 * 10% off Beer puts the beer products on it at 90% with ADDED history; one
 * made from the cost prices every product with a cost; a duplicate is a
 * draft with the same rows; the default cannot be switched off, only moved;
 * a list's currency stays once it has prices; the default cannot be paused
 * or binned; a binned list comes back paused.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { BinRefusal, moveToBin, restoreFromBin } from "@/lib/retail/bin";
import { defaultPriceList } from "@/lib/retail/prices/change";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import {
  createPriceList,
  duplicatePriceLists,
  PriceListRefusal,
  priceListView,
  setPriceListsState,
  updatePriceList,
  type PriceListInput,
} from "./service";

let shop: TestShop;
let retailId: string;
let beerId: string;
let castleId: string;
let amarulaId: string;

beforeAll(async () => {
  shop = await makeTestShop("Price lists");
  retailId = (await defaultPriceList(prisma, shop.companyId)).id;
  beerId = (await prisma.retailCategory.create({ data: { companyId: shop.companyId, name: "Beer", ageRestricted: true }, select: { id: true } })).id;
  castleId = (await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86", categoryId: beerId })).productId;
  amarulaId = (await addTestProduct(shop.companyId, { name: "Amarula Cream 750ml", price: "18.25", cost: "13.03" })).productId;
}, 60_000);

afterAll(async () => {
  if (shop) await destroyProvisionedTenant(shop.companyId);
});

const input = (fields: Partial<PriceListInput> = {}): PriceListInput => ({
  name: "Happy hour",
  startFrom: { listId: retailId },
  prices: "OFF",
  by: "10%",
  audience: "EVERYONE",
  when: "DAYS_AND_HOURS",
  hours: "Fridays, 17:00 to 19:00",
  between: null,
  siteId: null,
  categoryIds: [beerId],
  switchOn: true,
  ...fields,
});

async function refusal(promise: Promise<unknown>): Promise<PriceListRefusal> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PriceListRefusal) return error;
    throw error;
  }
  throw new Error("It was not refused.");
}

describe("adding a price list", () => {
  it("puts the beer on Happy hour at 90% of Retail, following it, with ADDED history", async () => {
    const created = await createPriceList(shop.owner(), input());
    expect(created.message).toBe("Happy hour is on: 10% off beer, Fridays 17:00 to 19:00.");
    expect(created.data).toMatchObject({ state: "ON", usedWhen: "Fridays 17:00 to 19:00", pricesRule: "Retail less 10% on beer", products: 1 });
    const rows = await prisma.productPrice.findMany({ where: { priceListId: created.data.id } });
    expect(rows.map((row) => [row.productId, row.unitPrice.toFixed(2), row.followsBase])).toEqual([[castleId, "1.08", true]]);
    const history = await prisma.productPriceChange.findMany({ where: { priceListId: created.data.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ source: "ADDED", fromPrice: null, createdById: shop.ownerId });
    const list = await prisma.priceList.findUniqueOrThrow({ where: { id: created.data.id }, include: { categories: true } });
    expect(list).toMatchObject({ basis: "LIST", basisListId: retailId, daysOfWeek: [5], fromTime: "17:00", toTime: "19:00" });
    expect(list.categories.map((entry) => entry.categoryId)).toEqual([beerId]);
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: created.data.id, eventType: "RETAIL_PRICE_LIST.CREATED" } });
    expect(JSON.parse(event.payloadJson!)).toMatchObject({ name: "Happy hour", products: 1, rule: "Retail less 10% on beer" });
  });

  it("prices every product with a cost off the cost, and saves a draft when not switched on", async () => {
    const created = await createPriceList(
      shop.owner(),
      input({ name: "Staff", startFrom: { cost: true }, prices: "ON", by: "5%", audience: "STAFF", when: "ALWAYS", categoryIds: [], switchOn: false }),
    );
    expect(created.message).toBe("Staff saved. Switch it on when it is ready.");
    expect(created.data).toMatchObject({ state: "DRAFT", pricesRule: "Cost plus 5%", products: 2 });
    const amarula = await prisma.productPrice.findFirstOrThrow({ where: { priceListId: created.data.id, productId: amarulaId } });
    expect(amarula.unitPrice.toFixed(2)).toBe("13.68");
  });

  it("refuses the same name, a cut over 90% and hours it cannot read", async () => {
    const same = await refusal(createPriceList(shop.owner(), input({ name: "happy hour" })));
    expect(same.fieldErrors).toMatchObject({ name: "There is already a price list called Happy hour." });
    const big = await refusal(createPriceList(shop.owner(), input({ name: "Big", by: "95%" })));
    expect(big.fieldErrors).toMatchObject({ by: "Make it 0% to 90%." });
    const hours = await refusal(createPriceList(shop.owner(), input({ name: "Evening", hours: "Friday evening" })));
    expect(hours.fieldErrors).toMatchObject({ hours: "Write it as Fridays, 17:00 to 19:00." });
    expect(await prisma.priceList.count({ where: { companyId: shop.companyId, name: { in: ["Big", "Evening"] } } })).toBe(0);
  });

  it("duplicates a list as a draft with the same rows, following as they did", async () => {
    const happy = await prisma.priceList.findFirstOrThrow({ where: { companyId: shop.companyId, name: "Happy hour" } });
    const [copy] = await duplicatePriceLists(shop.owner(), [happy.id]);
    expect(copy?.name).toBe("Happy hour (copy)");
    const view = await priceListView(shop.companyId, copy!.id);
    expect(view).toMatchObject({ state: "DRAFT", products: 1, pricesRule: "Retail less 10% on beer" });
    const row = await prisma.productPrice.findFirstOrThrow({ where: { priceListId: copy!.id } });
    expect([row.unitPrice.toFixed(2), row.followsBase]).toEqual(["1.08", true]);
  });
});

describe("the rules and the default", () => {
  it("refuses switching the default off, and moves it to another list", async () => {
    const off = await refusal(updatePriceList(shop.owner(), retailId, { isDefault: false }));
    expect([off.status, off.message]).toEqual([400, "One list has to be the default. Make another the default first."]);
    const shelf = await createPriceList(shop.owner(), input({ name: "Shelf two", prices: "SAME", when: "ALWAYS", categoryIds: [], switchOn: false }));
    const moved = await updatePriceList(shop.owner(), shelf.data.id, { isDefault: true });
    expect(moved).toMatchObject({ changed: 1, data: { isDefault: true, state: "ON" } });
    expect(await prisma.priceList.findUniqueOrThrow({ where: { id: retailId } })).toMatchObject({ isDefault: false, state: "ON" });
    await updatePriceList(shop.owner(), retailId, { isDefault: true });
    expect(await prisma.priceList.count({ where: { companyId: shop.companyId, isDefault: true } })).toBe(1);
  });

  it("makes only a list for everyone, always, everywhere the default, and keeps the default's rules plain", async () => {
    const happy = await prisma.priceList.findFirstOrThrow({ where: { companyId: shop.companyId, name: "Happy hour" } });
    const ruled = await refusal(updatePriceList(shop.owner(), happy.id, { isDefault: true }));
    expect(ruled.fieldErrors).toEqual({ isDefault: "Only a list for everyone, always, everywhere can be the default." });
    const site = await refusal(updatePriceList(shop.owner(), retailId, { siteId: shop.mainId }));
    expect(site.fieldErrors).toEqual({ siteId: "Only a list for everyone, always, everywhere can be the default." });
    expect(await prisma.priceList.findUniqueOrThrow({ where: { id: retailId } })).toMatchObject({ isDefault: true, siteId: null });
  });

  it("answers a race for the default and for a name with their sentences, not a failure", async () => {
    const plain = (name: string) => createPriceList(shop.owner(), input({ name, prices: "SAME", when: "ALWAYS", categoryIds: [], switchOn: false }));
    const [a, b] = [await plain("Race one"), await plain("Race two")];
    const both = await Promise.allSettled([
      updatePriceList(shop.owner(), a.data.id, { isDefault: true }),
      updatePriceList(shop.owner(), b.data.id, { isDefault: true }),
    ]);
    for (const result of both.filter((entry) => entry.status === "rejected")) {
      expect((result as PromiseRejectedResult).reason).toMatchObject({ status: 409, message: "Another list just became the default. Open it again." });
    }
    expect(await prisma.priceList.count({ where: { companyId: shop.companyId, isDefault: true } })).toBe(1);
    const named = await Promise.allSettled([plain("Race three"), plain("Race three")]);
    expect(named.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect((named.find((entry) => entry.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({
      fieldErrors: { name: "There is already a price list called Race three." },
    });
    await updatePriceList(shop.owner(), retailId, { isDefault: true });
  });

  it("keeps a priced list's currency", async () => {
    const zig = await refusal(updatePriceList(shop.owner(), retailId, { currency: "ZWG" }));
    expect([zig.status, zig.message]).toEqual([409, "Prices on Retail are in US$. Start a new ZiG list instead."]);
  });

  it("changes who and where, with the event naming them", async () => {
    const happy = await prisma.priceList.findFirstOrThrow({ where: { companyId: shop.companyId, name: "Happy hour" } });
    const changed = await updatePriceList(shop.owner(), happy.id, { audience: "LOYALTY_MEMBERS", siteId: shop.mainId });
    expect(changed.changed).toBe(2);
    expect(changed.data.usedWhen).toBe("Loyalty members, Fridays 17:00 to 19:00, at Harare Main Branch");
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: happy.id, eventType: "RETAIL_PRICE_LIST.CHANGED" }, orderBy: { createdAt: "desc" } });
    expect(JSON.parse(event.payloadJson!).changes.map((change: { label: string }) => change.label)).toEqual(["Who gets it", "Where"]);
  });

  it("refuses pausing the default, and pauses and switches on another", async () => {
    const paused = await refusal(setPriceListsState(shop.owner(), [retailId], "PAUSED"));
    expect([paused.status, paused.message]).toEqual([409, "Retail is the default list. Make another the default first."]);
    const happy = await prisma.priceList.findFirstOrThrow({ where: { companyId: shop.companyId, name: "Happy hour" } });
    expect(await setPriceListsState(shop.owner(), [happy.id], "PAUSED")).toBe(1);
    expect(await setPriceListsState(shop.owner(), [happy.id], "ON")).toBe(1);
  });
});

describe("below cost needs the owner", () => {
  const cheap = (name: string, switchOn: boolean) => input({ name, prices: "OFF", by: "90%", when: "ALWAYS", categoryIds: [], switchOn });

  it("refuses a manager a list that tills charge below cost — switched on, switched on later, or made the default — and saves the draft", async () => {
    const on = await refusal(createPriceList(shop.manager(), cheap("Clearance", true)));
    expect(on.fieldErrors.switchOn).toMatch(/^Below cost needs the owner\. It costs US\$(0\.86|13\.03)\.$/);
    expect(await prisma.priceList.count({ where: { companyId: shop.companyId, name: "Clearance" } })).toBe(0);

    const draft = await createPriceList(shop.manager(), cheap("Clearance", false));
    expect(draft.data).toMatchObject({ state: "DRAFT", belowCost: 2 });
    const switched = await refusal(setPriceListsState(shop.manager(), [draft.data.id], "ON"));
    expect(switched.message).toBe("Clearance: Below cost needs the owner. It costs US$13.03.");
    const made = await refusal(updatePriceList(shop.manager(), draft.data.id, { isDefault: true }));
    expect(made.fieldErrors).toEqual({ isDefault: "Below cost needs the owner. It costs US$13.03." });
    expect(await prisma.priceList.findUniqueOrThrow({ where: { id: draft.data.id } })).toMatchObject({ state: "DRAFT", isDefault: false });
  });

  it("lets the owner", async () => {
    const draft = await prisma.priceList.findFirstOrThrow({ where: { companyId: shop.companyId, name: "Clearance" } });
    expect(await setPriceListsState(shop.owner(), [draft.id], "ON")).toBe(1);
    const owned = await createPriceList(shop.owner(), cheap("Clearance two", true));
    expect(owned.data).toMatchObject({ state: "ON", belowCost: 2 });
    await setPriceListsState(shop.owner(), [draft.id, owned.data.id], "PAUSED");
  });
});

describe("the bin", () => {
  it("refuses the default, and brings a binned list back paused", async () => {
    await expect(moveToBin(shop.owner(), { kind: "price-list", id: retailId })).rejects.toThrow(BinRefusal);
    const happy = await prisma.priceList.findFirstOrThrow({ where: { companyId: shop.companyId, name: "Happy hour" } });
    await moveToBin(shop.owner(), { kind: "price-list", id: happy.id });
    expect(await prisma.priceList.findUniqueOrThrow({ where: { id: happy.id } })).toMatchObject({ state: "PAUSED" });
    expect(await priceListView(shop.companyId, happy.id)).toBeNull();
    await restoreFromBin(shop.owner(), { kind: "price-list", id: happy.id });
    expect(await prisma.priceList.findUniqueOrThrow({ where: { id: happy.id } })).toMatchObject({ archivedAt: null, state: "PAUSED" });
  });
});
