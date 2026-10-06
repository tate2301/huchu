/**
 * Changing a product (W-11, W-62; PRD-03), against the test database: each
 * field that moved is named once with its before and after, and written as
 * one `RETAIL_RECORD.EDITED`; the price goes through the price core (owner
 * rule, history); the cost moves the line's cost; opening stock and Sold as
 * are refused once anything has moved; a binned product is refused with 409.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";

import { ProductRefusal } from "./create";
import { productPatch } from "./input";
import { addTestProduct, makeTestShop, type TestShop } from "./test-fixtures";
import { updateProduct } from "./update";

let shop: TestShop;
let amarulaId: string;
let itemId: string;

const LIMITS = { priceChanges: "MANAGERS" as const, belowCostNeedsOwner: true };

beforeAll(async () => {
  shop = await makeTestShop("Update");
  const created = await addTestProduct(shop.companyId, { name: "Amarula Cream 750ml", price: "18.25", cost: "13.03", reorderAt: "12" });
  amarulaId = created.productId;
  itemId = created.itemId;
}, 60_000);

afterAll(async () => {
  if (shop) await destroyProvisionedTenant(shop.companyId);
});

const edit = (fields: Record<string, unknown>, actor = shop.owner(), id = amarulaId) =>
  prisma.$transaction((tx) => updateProduct(tx, { actor, id, input: productPatch.parse(fields), limits: LIMITS }));

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProductRefusal) return { status: error.status, field: error.field, message: error.message };
    throw error;
  }
  return null;
}

describe("changing a product", () => {
  it("names each field that moved, and writes one edit event for each", async () => {
    const { changed } = await edit({ name: "Amarula Cream 750ml", reorderAt: "24", cost: "13.50", categoryId: shop.ciderId });
    expect(changed).toEqual([
      { field: "categoryId", label: "Category", kind: "text", from: null, to: "Ciders and coolers" },
      { field: "cost", label: "Cost", kind: "money", from: "13.03", to: "13.50" },
      { field: "reorderAt", label: "Reorder at", kind: "count", from: "12", to: "24" },
    ]);
    const events = await prisma.platformAuditEvent.findMany({ where: { entityId: amarulaId, eventType: "RETAIL_RECORD.EDITED" } });
    expect(events).toHaveLength(3);
    const line = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(line.unitCost?.toFixed(2)).toBe("13.50");
    expect(line.minStock?.toNumber()).toBe(24);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: amarulaId } });
    expect(product.defaultTaxRate.toFixed(2)).toBe("15.50");
  });

  it("refuses a manager's price below cost under Price, and takes the owner's with its history row", async () => {
    expect(await refusal(edit({ price: "12.00" }, shop.manager()))).toEqual({
      status: 400,
      field: "price",
      message: "Below cost needs the owner. It costs US$13.50.",
    });
    const { changed } = await edit({ price: "12.00" });
    expect(changed).toEqual([{ field: "price", label: "Price", kind: "money", from: "18.25", to: "12.00" }]);
    const last = await prisma.productPriceChange.findFirstOrThrow({ where: { productId: amarulaId }, orderBy: { createdAt: "desc" } });
    expect(last).toMatchObject({ source: "TYPED" });
    expect(last.fromPrice?.toFixed(2)).toBe("18.25");
    expect(last.toPrice?.toFixed(2)).toBe("12.00");
    await edit({ price: "18.25" });
  });

  it("takes opening stock while nothing has moved, and refuses it after", async () => {
    const { opening } = await edit({ openingStock: "13" });
    expect(opening).toMatchObject({ quantity: "13", unitCost: "13.50" });
    expect(opening?.amount?.toFixed(2)).toBe("175.50");
    expect(await refusal(edit({ openingStock: "5" }))).toEqual({
      status: 400,
      field: "openingStock",
      message: "It has stock history already. Adjust stock instead.",
    });
  });

  it("keeps Sold as once stock has moved, and reads the same value sent again as no change", async () => {
    expect(await refusal(edit({ soldAs: "BY_WEIGHT" }))).toEqual({
      status: 400,
      field: "soldAs",
      message: "It has stock history already. Add it again as a new product to sell it the other way.",
    });
    // The Edit sheet sends Sold as on every save.
    const { changed } = await edit({ soldAs: "SINGLE", reorderAt: "25" });
    expect(changed.map((change) => change.field)).toEqual(["reorderAt"]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: amarulaId } })).unit).toBe("EACH");

    // Nothing has moved yet: the product and its line change together.
    const loose = await addTestProduct(shop.companyId, { name: "Loose Biltong", price: "30.00" });
    await edit({ soldAs: "BY_WEIGHT" }, shop.owner(), loose.productId);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: loose.productId } })).unit).toBe("KILOGRAM");
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: loose.itemId } })).unit).toBe("kg");
  });

  it("refuses a name another live product has", async () => {
    await addTestProduct(shop.companyId, { name: "Jameson Irish Whiskey 750ml", price: "27.90" });
    expect(await refusal(edit({ name: "jameson irish whiskey 750ml" }))).toMatchObject({ field: "name" });
  });

  it("refuses any change to a product in the bin", async () => {
    const binned = await addTestProduct(shop.companyId, { name: "Bols Brandy 750ml", price: "14.20" });
    await prisma.product.update({ where: { id: binned.productId }, data: { archivedAt: new Date() } });
    expect(await refusal(edit({ name: "Bols" }, shop.owner(), binned.productId))).toEqual({
      status: 409,
      field: null,
      message: "Restore it to change it",
    });
  });
});
