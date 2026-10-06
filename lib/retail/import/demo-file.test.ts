/**
 * W-08 end to end on the demo file (SET-11 acceptance 2–4), against the test
 * database: `public/demo/price-list-oct.xlsx` uploaded to a shop that sells
 * what the seeded shop sells and the file matches, checked as the board
 * draws it (Need a fix 6 · New 196 · Will update 12 · All 214), fixed as the
 * walk fixes it (Create the category on 14, 12.60 on 77, Update that one on
 * 58 → Import 211, skip 3), then imported: what the New and Will update tabs
 * held is what was added and updated, prices keep their history, opening
 * stock posts Dr 1200 = Cr 3100 = Σ opening × cost.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postRetailJournal } from "@/app/api/v2/retail/_helpers";
import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { applyFix } from "./fix";
import { parseSheet, type ParsedRow } from "./parse";
import { createImport, editRow, loadImportPage } from "./store";
import { commitAll } from "./test-fixtures";
import { importLabel, importedToast } from "./words";

const FILE = "price-list-oct.xlsx";
/** What the six by-barcode rows (9, 22, 40, 51, 66, 88) are in the shop, as `scripts/make-import-demo.ts` matches them. */
const BY_BARCODE = ["Amarula Cream 750ml", "Castle Lager 340ml", "Fanta Orange 500ml", "Gordon’s Gin 750ml", "Jameson Irish Whiskey 750ml", "Schweppes Tonic 200ml"];

let shop: TestShop;
let rows: ParsedRow[];
let importId: string;
const ids: Record<number, string> = {};

beforeAll(async () => {
  shop = await makeTestShop("ImportDemo");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  for (const name of ["Beer", "Wine", "Spirits", "Soft drinks", "Snacks", "Ice and mixers"]) {
    await prisma.retailCategory.create({ data: { companyId: shop.companyId, name, vatRate: new Prisma.Decimal("15.5") } });
  }
  rows = await parseSheet(readFileSync(join(process.cwd(), "public/demo", FILE)), FILE);
  const at = (rowNo: number) => rows.find((row) => row.rowNo === rowNo)!;
  // What the shop already sells: the twelve the file updates, at a lower price, and the two the flags are about.
  for (const [index, rowNo] of [9, 22, 40, 51, 66, 88].entries()) {
    await addTestProduct(shop.companyId, { name: BY_BARCODE[index]!, price: "0.50", barcode: at(rowNo).barcode });
  }
  for (const rowNo of [115, 129, 140, 152, 178, 199]) await addTestProduct(shop.companyId, { name: at(rowNo).name!, price: "0.50" });
  await addTestProduct(shop.companyId, { name: "Coca-Cola 2l", price: "2.20" });
  await addTestProduct(shop.companyId, { name: "Savanna Dry 330ml", price: "1.85" });
}, 120_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId: shop.companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailImport.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("the demo file, as the board draws it", () => {
  it("reads 214 rows and flags the six the board draws", async () => {
    expect(rows).toHaveLength(214);
    importId = (await createImport(shop.owner(), FILE, rows)).id;
    const page = (await loadImportPage(shop.companyId, importId, "fix"))!;
    expect(page.counts).toEqual({ fix: 6, new: 196, update: 12, done: 0, all: 214 });
    expect(importLabel(page.counts)).toBe("Import 208, skip 6");
    expect(page.rows.map((row) => [row.rowNo, row.problem?.field, row.problem?.text, row.problem?.fixLabel ?? null])).toEqual([
      [14, "category", "Category “Ciders” is new", "Create the category"],
      [31, "price", "No price", null],
      [58, "name", "Looks like Coca-Cola 2l, already in Products", "Update that one"],
      [77, "price", "Price has a comma", null],
      [102, "category", "Category “Ice” is new", "Create the category"],
      [166, "barcode", "Barcode is too short", null],
    ]);
    for (const row of page.rows) ids[row.rowNo] = row.id;
  });

  it("takes the walk's fixes: Import 211, skip 3", async () => {
    await applyFix(shop.manager(), importId, { rowId: ids[14]!, fix: "CREATE_CATEGORY" });
    expect(await prisma.retailCategory.count({ where: { companyId: shop.companyId, name: "Ciders" } })).toBe(1);
    await editRow(shop.companyId, importId, ids[77]!, { price: "12.60" });
    const { counts } = await applyFix(shop.manager(), importId, { rowId: ids[58]!, fix: "UPDATE_MATCH" });
    expect(importLabel(counts)).toBe("Import 211, skip 3");
    expect(counts.fix).toBe(3);
  });

  it("imports what the New and Will update tabs held, with history and balanced books", async () => {
    const before = (await loadImportPage(shop.companyId, importId, "update"))!;
    const result = await commitAll(shop.owner(), importId, postRetailJournal);
    // 211 rows: a batch of 200, then the other 11.
    expect(result).toEqual({ created: before.counts.new, updated: before.counts.update, skipped: 3, refused: 0, left: 0, calls: 2 });
    expect(importedToast(result)).toBe("211 products imported. 3 rows skipped.");

    // Updated: the new price, the old one in its history.
    for (const row of before.rows) {
      const change = await prisma.productPriceChange.findFirst({
        where: { companyId: shop.companyId, source: "IMPORT", product: { name: row.matchedName! } },
      });
      expect(change?.toPrice?.toFixed(2), row.matchedName!).toBe(Number(row.price).toFixed(2));
      expect(change?.fromPrice).not.toBeNull();
    }

    // Opening stock: one OPENING receipt per row with stock; Dr 1200 = Cr 3100 = Σ opening × cost of those with a cost.
    const opening = rows.filter((row) => row.openingStock);
    const movements = await prisma.stockMovement.count({ where: { item: { product: { companyId: shop.companyId } }, reason: "OPENING" } });
    expect(movements).toBe(opening.length);
    const expected = opening.reduce((sum, row) => sum + (row.cost ? Math.round(Number(row.openingStock) * Number(row.cost) * 100) : 0), 0);
    await runRetailPosting(shop.companyId, "BY_HAND", shop.owner());
    const lines = await prisma.journalLine.findMany({
      where: { entry: { companyId: shop.companyId, sourceType: "RETAIL_OPENING_STOCK" } },
      include: { account: { select: { code: true } } },
    });
    const cents = (code: string, side: "debit" | "credit") =>
      lines.filter((line) => line.account.code === code).reduce((sum, line) => sum + Math.round(line[side] * 100), 0);
    expect(expected).toBeGreaterThan(0);
    expect(cents("1200", "debit")).toBe(expected);
    expect(cents("3100", "credit")).toBe(expected);

    // Every new product on sale at the default site; the cases hold their singles.
    const castleCase = await prisma.product.findFirstOrThrow({ where: { companyId: shop.companyId, name: "Castle Lager 340ml case of 24" }, include: { packOf: true } });
    expect(castleCase).toMatchObject({ packSize: 24, packOf: { name: "Castle Lager 340ml" } });
    const blackCase = await prisma.product.findFirstOrThrow({ where: { companyId: shop.companyId, name: "Black Label 330ml case of 24" }, include: { packOf: true } });
    expect(blackCase.packOf?.name).toBe("Black Label 330ml");
    const lines196 = await prisma.inventoryItem.count({ where: { siteId: shop.mainId, product: { companyId: shop.companyId } } });
    expect(lines196).toBe(14 + result.created);

    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: shop.companyId, eventType: "RETAIL_PRODUCTS.IMPORTED" } });
    expect(JSON.parse(event.payloadJson ?? "{}")).toMatchObject({ created: result.created, updated: result.updated, skipped: 3, file: FILE });
  }, 300_000);
});
