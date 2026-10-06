import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * The import routes (SET-11), against the test database: who may call them,
 * the files refused in words, an upload checked, a commit once, and Start
 * again.
 */

let shop: TestShop;
const who = { role: "MANAGER", id: "" };

vi.mock("@/app/api/v2/retail/_helpers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/api/v2/retail/_helpers")>();
  return {
    ...real,
    requireRetailSession: async () => ({
      response: null,
      session: { user: { id: who.id, companyId: shop.companyId, name: "Tafara Nyathi", role: who.role } },
    }),
  };
});

const { POST: upload } = await import("./route");
const { GET: template } = await import("./template/route");
const { GET: read, DELETE: discard } = await import("./[id]/route");
const { PATCH: edit } = await import("./[id]/rows/[rowId]/route");
const { POST: fix } = await import("./[id]/fix/route");
const { POST: commit } = await import("./[id]/commit/route");

const url = (path = "") => `http://shop.test/api/v2/retail/products/import${path}`;
const form = (name: string, bytes: Buffer | string) => {
  const body = new FormData();
  body.set("file", new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], name));
  return new NextRequest(url(), { method: "POST", body });
};
const json = (path: string, method: string, body?: unknown) =>
  new NextRequest(url(path), { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const CSV = 'Name,Price,Category,Barcode\nSavanna Dry 330ml,2.10,Ciders,60014960001\nNederburg Cabernet,"12,60",,\nIce 5kg bag,3.00,,\n';

beforeAll(async () => {
  shop = await makeTestShop("ImportRoutes");
  who.id = shop.managerId;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.retailImport.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("who may import", () => {
  it("refuses a cashier, a stock clerk and a bookkeeper every endpoint", async () => {
    for (const role of ["CASHIER", "STOCK_CLERK", "FINANCE_OFFICER"]) {
      who.role = role;
      const answers = [
        await upload(form("list.csv", CSV)),
        await template(json("/template", "GET")),
        await read(json("/x", "GET"), params({ id: crypto.randomUUID() })),
        await commit(json("/x/commit", "POST"), params({ id: crypto.randomUUID() })),
      ];
      for (const answer of answers) {
        expect(answer.status, role).toBe(403);
        expect((await answer.json()).error).toBe("Your role cannot create products");
      }
    }
    who.role = "MANAGER";
  });
});

describe("files refused in words", () => {
  it("a PDF, a sheet without a Price column, and no file", async () => {
    const pdf = await upload(form("price-list.pdf", "%PDF-1.4"));
    expect(pdf.status).toBe(400);
    expect((await pdf.json()).error).toBe("Upload an .xlsx or .csv file.");
    const noPrice = await upload(form("list.csv", "Name,Cost\nIce,1.00\n"));
    expect(noPrice.status).toBe(400);
    expect((await noPrice.json()).error).toBe("Name and price columns are needed.");
    const none = await upload(new NextRequest(url(), { method: "POST", body: new FormData() }));
    expect(none.status).toBe(400);
  });
});

describe("an import from upload to Products", () => {
  it("downloads a template with the eight columns", async () => {
    const answer = await template(json("/template", "GET"));
    expect(answer.status).toBe(200);
    expect(answer.headers.get("Content-Disposition")).toContain("tender-products-template.xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await answer.arrayBuffer());
    const header = (workbook.getWorksheet("Products")!.getRow(2).values as unknown[]).filter(Boolean);
    expect(header).toEqual(["Name", "Price", "Category", "Barcode", "Cost", "Supplier", "Pack size", "Opening stock"]);
    expect(workbook.getWorksheet("Categories")!.getRow(2).getCell(1).value).toBe("Ciders and coolers");
  });

  it("checks the upload, takes the fixes, commits once, and cannot be thrown away after", async () => {
    const created = await upload(form("price-list-oct.csv", CSV));
    expect(created.status).toBe(201);
    const { id } = (await created.json()).data;

    const page = (await (await read(json(`/${id}?tab=fix`, "GET"), params({ id }))).json()).data;
    expect(page.counts).toEqual({ fix: 2, new: 1, update: 0, all: 3 });
    expect(page.rows.map((row: { rowNo: number; problem: { text: string } }) => [row.rowNo, row.problem.text])).toEqual([
      [2, "Category “Ciders” is new"],
      [3, "Price has a comma"],
    ]);

    const fixed = await fix(json(`/${id}/fix`, "POST", { rowId: page.rows[0].id, fix: "CREATE_CATEGORY" }), params({ id }));
    expect(fixed.status).toBe(200);
    expect((await fixed.json()).data.counts).toEqual({ fix: 1, new: 2, update: 0, all: 3 });

    const typed = await edit(json(`/${id}/rows/${page.rows[1].id}`, "PATCH", { price: "12.60" }), params({ id, rowId: page.rows[1].id }));
    expect((await typed.json()).data).toMatchObject({ row: { rowNo: 3, problem: null }, counts: { fix: 0, new: 3 } });

    const done = await commit(json(`/${id}/commit`, "POST"), params({ id }));
    expect(done.status).toBe(200);
    expect((await done.json()).data).toEqual({ created: 3, updated: 0, skipped: 0 });

    const twice = await commit(json(`/${id}/commit`, "POST"), params({ id }));
    expect(twice.status).toBe(409);
    expect((await twice.json()).error).toBe("This import is not waiting to be checked.");
    expect((await discard(json(`/${id}`, "DELETE"), params({ id }))).status).toBe(409);
  });

  it("Start again throws a checking import away", async () => {
    const { id } = (await (await upload(form("again.csv", CSV))).json()).data;
    const answer = await discard(json(`/${id}`, "DELETE"), params({ id }));
    expect(answer.status).toBe(204);
    expect(await prisma.retailImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DISCARDED" });
    expect(await prisma.retailImportRow.count({ where: { importId: id } })).toBe(0);
    expect((await read(json(`/${crypto.randomUUID()}`, "GET"), params({ id: crypto.randomUUID() }))).status).toBe(404);
  });
});
