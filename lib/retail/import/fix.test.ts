/**
 * The fix buttons and cell edits on the Check step (SET-11), against the test
 * database: "Create the category" clears every row naming it, "Update that
 * one" turns a look-alike into an update, a typed fix clears its row.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { applyFix } from "./fix";
import { discardImport, editRow, loadImportPage } from "./store";
import { importRows } from "./test-fixtures";

let shop: TestShop;
let importId: string;
const ids: Record<number, string> = {};

beforeAll(async () => {
  shop = await makeTestShop("ImportFix");
  await addTestProduct(shop.companyId, { name: "Coca-Cola 2l", price: "2.20" });
  importId = await importRows(shop.manager(), "price-list-oct.xlsx", [
    { rowNo: 14, name: "Savanna Dry 330ml", category: "Ciders", price: "2.10" },
    { rowNo: 20, name: "Hunters Dry", category: "ciders", price: "2.00" },
    { rowNo: 58, name: "Coca Cola 2l", category: "Ciders and coolers", price: "2.50" },
    { rowNo: 77, name: "Nederburg Cabernet", price: "12,60" },
  ]);
  for (const row of await prisma.retailImportRow.findMany({ where: { importId } })) ids[row.rowNo] = row.id;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.retailImport.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("the Check step", () => {
  it("starts with four rows to fix", async () => {
    const page = await loadImportPage(shop.companyId, importId, "fix");
    expect(page?.counts).toEqual({ fix: 4, new: 0, update: 0, done: 0, all: 4 });
    expect(page?.siteName).toBe("Harare Main Branch");
  });

  it("Create the category makes it and clears every row naming it", async () => {
    const { rows, counts } = await applyFix(shop.manager(), importId, { rowId: ids[14]!, fix: "CREATE_CATEGORY" });
    expect(rows.map((row) => row.rowNo).sort()).toEqual([14, 20]);
    expect(rows.every((row) => row.problem === null && row.action === "NEW")).toBe(true);
    expect(counts).toEqual({ fix: 2, new: 2, update: 0, done: 0, all: 4 });
    const ciders = await prisma.retailCategory.findFirstOrThrow({ where: { companyId: shop.companyId, name: "Ciders" } });
    expect(ciders.ageRestricted).toBe(false);
    const event = await prisma.platformAuditEvent.findFirst({ where: { companyId: shop.companyId, eventType: "RETAIL_CATEGORY.CREATED", entityId: ciders.id } });
    expect(event).not.toBeNull();
  });

  it("Update that one turns the look-alike into an update of it", async () => {
    const { rows, counts } = await applyFix(shop.manager(), importId, { rowId: ids[58]!, fix: "UPDATE_MATCH" });
    expect(rows).toEqual([expect.objectContaining({ rowNo: 58, problem: null, action: "UPDATE", matchedName: "Coca-Cola 2l" })]);
    expect(counts).toEqual({ fix: 1, new: 2, update: 1, done: 0, all: 4 });
  });

  it("a fix that does not fit the row is refused", async () => {
    await expect(applyFix(shop.manager(), importId, { rowId: ids[77]!, fix: "CREATE_CATEGORY" })).rejects.toMatchObject({ status: 400 });
  });

  it("typing the price again clears the comma", async () => {
    const { row, counts } = await editRow(shop.companyId, importId, ids[77]!, { price: " 12.60 " });
    expect(row).toMatchObject({ rowNo: 77, price: "12.60", problem: null, action: "NEW" });
    expect(counts).toEqual({ fix: 0, new: 3, update: 1, done: 0, all: 4 });
  });

  it("Start again throws it away and its rows go", async () => {
    await discardImport(shop.companyId, importId);
    expect(await prisma.retailImport.findUniqueOrThrow({ where: { id: importId } })).toMatchObject({ status: "DISCARDED" });
    expect(await prisma.retailImportRow.count({ where: { importId } })).toBe(0);
    await expect(editRow(shop.companyId, importId, ids[77]!, { price: "1.00" })).rejects.toMatchObject({ status: 409 });
  });
});
