/**
 * An import that stops part way (SET-11, W-08), against the test database.
 * Each commit call puts in one batch of 200 rows; a call that dies undoes its
 * own batch only. While part of an import is in, its rows cannot change and
 * it cannot be thrown away, the page counts the done rows as done, the call
 * that failed says how many are in, and importing again finishes the rest
 * with counts and an audit event that are right.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { postRetailJournal } from "@/app/api/v2/retail/_helpers";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

let shop: TestShop;
const boom = { name: "" };

vi.mock("@/lib/retail/products/create", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/retail/products/create")>();
  return {
    ...real,
    createProduct: async (...args: Parameters<typeof real.createProduct>) => {
      if (boom.name && args[1].input.name === boom.name) throw new Error("database went away");
      return real.createProduct(...args);
    },
  };
});

vi.mock("@/app/api/v2/retail/_helpers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/api/v2/retail/_helpers")>();
  return {
    ...real,
    requireRetailSession: async () => ({
      response: null,
      session: { user: { id: shop.managerId, companyId: shop.companyId, name: "Tafara Nyathi", role: "MANAGER" } },
    }),
  };
});

const { commitImport, commitStoppedSentence } = await import("./commit");
const { applyFix } = await import("./fix");
const { discardImport, editRow, loadImportPage, recheck } = await import("./store");
const { importRows } = await import("./test-fixtures");
const { POST: commitRoute } = await import("@/app/api/v2/retail/products/import/[id]/commit/route");

beforeAll(async () => {
  shop = await makeTestShop("ImportResume");
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.retailImport.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

const items = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ rowNo: i + 2, name: `Item ${String(i).padStart(3, "0")}`, price: "1.00" }));

describe("a commit that stops after its first batch", () => {
  let importId: string;
  let flaggedId: string;

  beforeAll(async () => {
    importId = await importRows(shop.owner(), "big.xlsx", [...items(205), { rowNo: 300, name: "Flagged", price: "", category: "Ciders" }]);
    flaggedId = (await prisma.retailImportRow.findFirstOrThrow({ where: { importId, rowNo: 300 } })).id;
  }, 60_000);

  it("puts in 200 rows a call and marks the import part in", async () => {
    const step = await commitImport(shop.owner(), importId, postRetailJournal);
    expect(step).toEqual({ created: 200, updated: 0, skipped: 1, refused: 0, left: 5 });
    expect(await prisma.retailImport.findUniqueOrThrow({ where: { id: importId } })).toMatchObject({ status: "IMPORTING", createdCount: null });
    expect(await prisma.product.count({ where: { companyId: shop.companyId, name: { startsWith: "Item " } } })).toBe(200);
  }, 120_000);

  it("counts the done rows as done, not as New", async () => {
    const page = (await loadImportPage(shop.companyId, importId, "done"))!;
    expect(page.status).toBe("IMPORTING");
    expect(page.counts).toEqual({ fix: 1, new: 5, update: 0, done: 200, all: 206 });
    expect(page.rows[0]).toMatchObject({ rowNo: 2, done: "NEW", problem: null });
    const fresh = (await loadImportPage(shop.companyId, importId, "new"))!;
    expect(fresh.rows.map((row) => row.rowNo)).toEqual([202, 203, 204, 205, 206]);
  });

  it("refuses an edit, a fix and Start again while part of it is in", async () => {
    const partIn = { status: 409, message: expect.stringContaining("Part of this import is in Products already") };
    await expect(editRow(shop.companyId, importId, flaggedId, { price: "3.00" })).rejects.toMatchObject(partIn);
    await expect(applyFix(shop.owner(), importId, { rowId: flaggedId, fix: "CREATE_CATEGORY" })).rejects.toMatchObject(partIn);
    await expect(discardImport(shop.companyId, importId)).rejects.toMatchObject(partIn);
    expect(await prisma.retailImportRow.count({ where: { importId } })).toBe(206);
    expect(await prisma.retailCategory.count({ where: { companyId: shop.companyId, name: "Ciders" } })).toBe(0);
  });

  it("a call that dies undoes its own batch and says how many rows are in", async () => {
    boom.name = "Item 203";
    try {
      await expect(commitImport(shop.owner(), importId, postRetailJournal)).rejects.toThrow("database went away");
      expect(await prisma.product.count({ where: { companyId: shop.companyId, name: { startsWith: "Item " } } })).toBe(200);
      expect(await commitStoppedSentence(shop.companyId, importId)).toBe(
        "That stopped part way. 200 rows are in Products; import again to put in the other 5.",
      );

      const answer = await commitRoute(new NextRequest(`http://shop.test/api/v2/retail/products/import/${importId}/commit`, { method: "POST" }), {
        params: Promise.resolve({ id: importId }),
      });
      expect(answer.status).toBe(500);
      expect((await answer.json()).error).toBe("That stopped part way. 200 rows are in Products; import again to put in the other 5.");
    } finally {
      boom.name = "";
    }
  }, 120_000);

  it("importing again finishes the rest, each product once, with the right counts and audit", async () => {
    const step = await commitImport(shop.owner(), importId, postRetailJournal);
    expect(step).toEqual({ created: 205, updated: 0, skipped: 1, refused: 0, left: 0 });
    expect(await prisma.retailImport.findUniqueOrThrow({ where: { id: importId } })).toMatchObject({
      status: "IMPORTED",
      createdCount: 205,
      updatedCount: 0,
      skippedCount: 1,
    });
    expect(await prisma.product.count({ where: { companyId: shop.companyId, name: { startsWith: "Item " } } })).toBe(205);
    expect(await prisma.productPriceChange.count({ where: { companyId: shop.companyId, product: { name: "Item 000" } } })).toBe(1);
    const events = await prisma.platformAuditEvent.findMany({ where: { companyId: shop.companyId, eventType: "RETAIL_PRODUCTS.IMPORTED", entityId: importId } });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.payloadJson ?? "null")).toMatchObject({ created: 205, updated: 0, skipped: 1, file: "big.xlsx" });
    await expect(commitImport(shop.owner(), importId, postRetailJournal)).rejects.toMatchObject({ status: 409 });
  }, 120_000);
});

describe("checking a file again", () => {
  it("keeps what the commit wrote on a row", async () => {
    const importId = await importRows(shop.owner(), "marks.csv", [
      { rowNo: 2, name: "Kept A", price: "1.00" },
      { rowNo: 3, name: "Kept B", price: "" },
    ]);
    const rowA = await prisma.retailImportRow.findFirstOrThrow({ where: { importId, rowNo: 2 } });
    await prisma.retailImportRow.update({ where: { id: rowA.id }, data: { problemArgs: { done: "NEW", productId: "p-1", note: "a note" } } });
    // Row B's price changes, and every row is checked again.
    const rowB = await prisma.retailImportRow.findFirstOrThrow({ where: { importId, rowNo: 3 } });
    await prisma.retailImportRow.update({ where: { id: rowB.id }, data: { price: "2.00" } });
    await prisma.$transaction((tx) => recheck(tx, shop.companyId, importId));
    expect((await prisma.retailImportRow.findUniqueOrThrow({ where: { id: rowA.id } })).problemArgs).toEqual({
      done: "NEW",
      productId: "p-1",
      note: "a note",
    });
  });
});
