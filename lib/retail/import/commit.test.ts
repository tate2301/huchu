/**
 * Committing an import (SET-11, W-08), against the test database: new rows
 * become products on sale at the default site with IMPORT history and their
 * opening stock in the books (Dr 1200 = Cr 3100 = opening × cost), matched
 * rows take the new price and keep the old one in their history, flagged rows
 * are left alone, a case finds its single, and an import goes in once.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postRetailJournal } from "@/app/api/v2/retail/_helpers";
import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { commitImport } from "./commit";
import { ImportRefusal } from "./refusal";
import { importRows } from "./test-fixtures";

let shop: TestShop;
let cokeId: string;
let castleId: string;

beforeAll(async () => {
  shop = await makeTestShop("ImportCommit");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  cokeId = (await addTestProduct(shop.companyId, { name: "Coca-Cola 2l", price: "2.20", cost: "1.20", barcode: "5449000000996" })).productId;
  castleId = (await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.84" })).productId;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId: shop.companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailImport.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

const productNamed = (name: string) =>
  prisma.product.findFirst({ where: { companyId: shop.companyId, name }, select: { id: true, standardPrice: true, costPrice: true, packOfId: true, packSize: true } });

describe("commitImport", () => {
  let importId: string;
  let result: Awaited<ReturnType<typeof commitImport>>;

  beforeAll(async () => {
    importId = await importRows(shop.owner(), "price-list-oct.xlsx", [
      { rowNo: 2, name: "Savanna Dry 330ml", category: "Ciders and coolers", price: "2.10", barcode: "60014960001", cost: "1.38", openingStock: "48" },
      { rowNo: 3, name: "Castle Lager 340ml case of 24", category: "Ciders and coolers", price: "26.00", packSize: "24" },
      { rowNo: 4, name: "Coca-Cola 2l", price: "2.50", cost: "1.30" },
      { rowNo: 5, name: "Hunters Gold", category: "Ciders and coolers" },
      { rowNo: 6, name: "Ice 5kg bag", price: "3.00", openingStock: "10" },
    ]);
    result = await commitImport(shop.owner(), importId, postRetailJournal);
    await runRetailPosting(shop.companyId, "BY_HAND", shop.owner());
  }, 120_000);

  it("counts what it added, updated and skipped, and says so in Activity", async () => {
    expect(result).toEqual({ created: 3, updated: 1, skipped: 1 });
    const stored = await prisma.retailImport.findUniqueOrThrow({ where: { id: importId } });
    expect(stored).toMatchObject({ status: "IMPORTED", createdCount: 3, updatedCount: 1, skippedCount: 1, importedById: shop.ownerId });
    const event = await prisma.platformAuditEvent.findFirst({ where: { companyId: shop.companyId, eventType: "RETAIL_PRODUCTS.IMPORTED", entityId: importId } });
    expect(JSON.parse(event?.payloadJson ?? "null")).toMatchObject({ created: 3, updated: 1, skipped: 1, file: "price-list-oct.xlsx" });
  });

  it("puts a new product on sale at the default site, on the default list, with IMPORT history", async () => {
    const savanna = (await productNamed("Savanna Dry 330ml"))!;
    expect(savanna.standardPrice?.toFixed(2)).toBe("2.10");
    const line = await prisma.inventoryItem.findFirstOrThrow({ where: { productId: savanna.id } });
    expect(line.siteId).toBe(shop.mainId);
    expect(line.currentStock.toNumber()).toBe(48);
    const price = await prisma.productPrice.findFirstOrThrow({ where: { productId: savanna.id, priceList: { isDefault: true } } });
    expect(price.unitPrice.toFixed(2)).toBe("2.10");
    const history = await prisma.productPriceChange.findMany({ where: { productId: savanna.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ source: "IMPORT", fromPrice: null });
  });

  it("records opening stock as an OPENING receipt and posts Dr 1200 = Cr 3100 = opening × cost", async () => {
    const savanna = (await productNamed("Savanna Dry 330ml"))!;
    const movements = await prisma.stockMovement.findMany({ where: { item: { productId: savanna.id } } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ movementType: "RECEIPT", reason: "OPENING", reference: "Opening" });
    expect(movements[0]!.quantity.toNumber()).toBe(48);

    const entries = await prisma.journalEntry.findMany({
      where: { companyId: shop.companyId, sourceType: "RETAIL_OPENING_STOCK" },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });
    // Only the row with a cost posts; Ice has stock but no cost.
    expect(entries).toHaveLength(1);
    expect(entries[0]!.sourceId).toBe(savanna.id);
    const lines = entries[0]!.lines.map((l) => ({ code: l.account.code, debit: l.debit, credit: l.credit }));
    expect(lines.find((l) => l.code === "1200")).toMatchObject({ debit: 66.24, credit: 0 });
    expect(lines.find((l) => l.code === "3100")).toMatchObject({ debit: 0, credit: 66.24 });

    const ice = (await productNamed("Ice 5kg bag"))!;
    const iceMoves = await prisma.stockMovement.findMany({ where: { item: { productId: ice.id } } });
    expect(iceMoves).toHaveLength(1);
  });

  it("updates a matched product's price and cost, keeping the old price in its history", async () => {
    const coke = (await productNamed("Coca-Cola 2l"))!;
    expect(coke.id).toBe(cokeId);
    expect(coke.standardPrice?.toFixed(2)).toBe("2.50");
    expect(coke.costPrice?.toFixed(2)).toBe("1.30");
    const change = await prisma.productPriceChange.findFirstOrThrow({ where: { productId: cokeId, source: "IMPORT" } });
    expect(change.fromPrice?.toFixed(2)).toBe("2.20");
    expect(change.toPrice?.toFixed(2)).toBe("2.50");
    const line = await prisma.inventoryItem.findFirstOrThrow({ where: { productId: cokeId, siteId: shop.mainId } });
    expect(line.unitCost?.toFixed(2)).toBe("1.30");
  });

  it("leaves a flagged row out, and links a case to its single", async () => {
    expect(await productNamed("Hunters Gold")).toBeNull();
    expect(await productNamed("Castle Lager 340ml case of 24")).toMatchObject({ packOfId: castleId, packSize: 24 });
  });

  it("refuses a second commit", async () => {
    await expect(commitImport(shop.owner(), importId, postRetailJournal)).rejects.toMatchObject({ status: 409, message: "This import is not waiting to be checked." });
    await expect(commitImport(shop.owner(), importId, postRetailJournal)).rejects.toBeInstanceOf(ImportRefusal);
  });
});

describe("commitImport, row by row", () => {
  it("skips a manager's price below cost and counts it, and never does a row twice", async () => {
    const importId = await importRows(shop.manager(), "late.csv", [
      { rowNo: 2, name: "Castle Lager 340ml", price: "0.50" },
      { rowNo: 3, name: "Bols Brandy 50ml", price: "2.00" },
      { rowNo: 4, name: "Already done", price: "1.00" },
    ]);
    // An earlier try that died after its batch committed left row 4 done.
    const row4 = await prisma.retailImportRow.findFirstOrThrow({ where: { importId, rowNo: 4 } });
    await prisma.retailImportRow.update({ where: { id: row4.id }, data: { problemArgs: { done: "NEW" } } });

    const result = await commitImport(shop.manager(), importId, postRetailJournal);
    expect(result).toEqual({ created: 2, updated: 0, skipped: 1 });
    expect((await productNamed("Castle Lager 340ml"))!.standardPrice?.toFixed(2)).toBe("1.20");
    expect(await productNamed("Bols Brandy 50ml")).not.toBeNull();
    expect(await productNamed("Already done")).toBeNull();
    const row2 = await prisma.retailImportRow.findFirstOrThrow({ where: { importId, rowNo: 2 } });
    expect(row2.problemArgs).toMatchObject({ done: "SKIPPED", note: "Below cost needs the owner. It costs US$0.84." });
  });
});
