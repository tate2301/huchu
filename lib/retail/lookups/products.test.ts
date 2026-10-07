/**
 * The product, pack and supplier nouns (PRD-03), against the test database:
 * live products on sale by name, code or barcode, an exact barcode first;
 * `singles` leaves out cases; cost only for a role that may see it; the quick
 * add puts a product on sale; suppliers are only this company's.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { addLookupOption, searchLookup, type LookupCtx } from "./index";

let shop: TestShop;
let other: TestShop;
let castleId: string;
let caseId: string;

const as = (role: string, on: TestShop = shop): LookupCtx => ({
  companyId: on.companyId,
  userId: on.ownerId,
  userName: "Tendai Mhlanga",
  session: { user: { role } },
});

beforeAll(async () => {
  shop = await makeTestShop("LookupProducts");
  other = await makeTestShop("LookupOther");
  castleId = (await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86", barcode: "6001108012345", categoryId: shop.ciderId })).productId;
  caseId = (await addTestProduct(shop.companyId, { name: "Castle Lager case of 24", price: "26.50", barcode: "6001108099999" })).productId;
  await prisma.product.update({ where: { id: caseId }, data: { packOfId: castleId, packSize: 24 } });
  // Its name holds the barcode being scanned: the exact barcode still comes first.
  await addTestProduct(shop.companyId, { name: "Promo 6001108012345 pack", price: "1.00" });
  const archived = await addTestProduct(shop.companyId, { name: "Castle Lite 340ml", price: "1.30" });
  await prisma.product.update({ where: { id: archived.productId }, data: { isActive: false } });
  await prisma.vendor.create({ data: { companyId: shop.companyId, name: "Delta Beverages" } });
  await prisma.vendor.create({ data: { companyId: other.companyId, name: "Delta Other" } });
}, 60_000);

afterAll(async () => {
  for (const each of [shop, other]) if (each) await destroyProvisionedTenant(each.companyId);
});

const options = async (noun: string, q: string, context: Record<string, unknown> = {}, role = "MANAGER") => {
  const answer = await searchLookup(as(role), noun, { q, context });
  if (answer.status !== 200) throw new Error(JSON.stringify(answer.body));
  return answer.body.options;
};

describe("the product noun", () => {
  it("finds products on sale by name and code, with category and barcode as the sub, and cost for a manager", async () => {
    const found = await options("product", "castle");
    expect(found.map((option) => option.label)).toEqual(["Castle Lager 340ml", "Castle Lager case of 24"]);
    expect(found[0]).toMatchObject({ id: castleId, sub: "Ciders and coolers · 6001108", cost: "0.86" });
    expect((await options("product", "CASTLE-LAGER-CASE"))[0]?.id).toBe(caseId);
  });

  it("puts the exact barcode first", async () => {
    const found = await options("product", "6001108012345");
    expect(found[0]?.id).toBe(castleId);
    expect(found).toHaveLength(2);
  });

  it("leaves out cases for singles, and cost for a cashier", async () => {
    expect((await options("product", "castle", { singles: true })).map((option) => option.id)).toEqual([castleId]);
    expect((await options("product", "castle", {}, "CASHIER"))[0]).not.toHaveProperty("cost");
  });

  it("adds a product on sale from its name and price", async () => {
    const added = await addLookupOption(as("MANAGER"), "product", { name: "Mazoe Orange 2L", price: "3.40" });
    expect(added.status).toBe(201);
    if (added.status !== 201) return;
    expect(added.body.notice).toBe("Mazoe Orange 2L is on sale at US$3.40 on every till.");
    const product = await prisma.product.findUniqueOrThrow({ where: { id: added.body.option.id } });
    expect(product).toMatchObject({ isActive: true, categoryId: null });
    const refused = await addLookupOption(as("MANAGER"), "product", { name: "Mazoe Orange 2L", price: "3.40" });
    expect(refused).toMatchObject({ status: 400, body: { fieldErrors: { name: "There is already a product called Mazoe Orange 2L." } } });
  });
});

describe("the supplier and pack nouns", () => {
  it("reads only this company's suppliers", async () => {
    expect((await options("supplier", "delta")).map((option) => option.label)).toEqual(["Delta Beverages"]);
  });

  it("finds cases with what is on hand at the site", async () => {
    const found = await options("pack", "", { siteId: shop.mainId });
    expect(found).toEqual([expect.objectContaining({ id: caseId, sub: "0 cases" })]);
  });
});
