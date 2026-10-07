/**
 * A list's Export through the real handlers and the test database, with the
 * body exactly as ListFrame sends it: the query the list's GET resolved,
 * `template` and `cols` null among it. Sales past the engine's 5,000-row
 * limit come back as the first 5,000, and the response says how many the
 * list found, which the page toasts. Only the session is mocked.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { addTestSale, destroySalesShop, makeSalesShop, type SalesShop } from "@/lib/retail/floor/test-fixtures";
import { REPORT_ROW_LIMIT } from "@/lib/reports/types";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { GET } = await import("../route");
const { POST } = await import("./route");

let shop: SalesShop;
const SALES = REPORT_ROW_LIMIT + 1;

beforeAll(async () => {
  shop = await makeSalesShop("ListExport");
  validateSessionMock.mockResolvedValue({
    session: {
      user: {
        id: shop.ownerId,
        companyId: shop.companyId,
        role: "SUPERADMIN",
        name: "Tendai Owner",
        email: "owner@export.test",
        enabledFeatures: ["retail.core", "retail.pos"],
      },
    },
  });
  const ice = { item: shop.ice, name: "Ice 2kg bag", quantity: 1, price: "2.20", cost: "1.10" };
  await addTestSale(shop, { saleNo: "SALE-00001", at: new Date(Date.now() - 86_400_000), lines: [ice] });
  // The rest straight to the table: one row each is all the list reads.
  const at = Date.now() - 2 * 86_400_000;
  await prisma.retailSale.createMany({
    data: Array.from({ length: SALES - 1 }, (_, index) => ({
      companyId: shop.companyId,
      saleNo: `SALE-${String(index + 2).padStart(5, "0")}`,
      siteId: shop.mainId,
      registerId: shop.frontTill,
      cashierId: shop.chipo,
      saleType: "SALE" as const,
      status: "POSTED" as const,
      subtotal: 1,
      taxAmount: 0,
      totalAmount: 1,
      baseAmount: 1,
      postedAt: new Date(at - index * 60_000),
    })),
  });
}, 120_000);

afterAll(async () => {
  await destroySalesShop(shop);
}, 60_000);

/** The list's page as the browser reads it, and the export body ListFrame builds from its `query`. */
async function exportBody(format: "csv" | "xlsx") {
  const response = await GET(new NextRequest("http://shop.test/api/v2/reports/retail-sales?page=1&size=50&tab=all"), {
    params: Promise.resolve({ key: "retail-sales" }),
  });
  expect(response.status).toBe(200);
  const page = await response.json();
  const resolved = page.query;
  // components/list-frame/list-frame.tsx doExport.
  const query = { ...resolved, tab: resolved.tab ?? undefined, group: resolved.group ?? "none", page: 1 };
  return { page, body: JSON.stringify({ format, query }) };
}

function post(body: string) {
  return POST(
    new NextRequest("http://shop.test/api/v2/reports/retail-sales/export", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ key: "retail-sales" }) },
  );
}

describe("Export on Sales", () => {
  it("reads the body ListFrame sends, nulls and all", async () => {
    const { body } = await exportBody("xlsx");
    expect(JSON.parse(body).query).toMatchObject({ template: null, cols: null });
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml");
  });

  it("downloads the filtered rows as the list draws them, and says where the file stops", async () => {
    const { page, body } = await exportBody("csv");
    expect(page.total).toBe(SALES);
    const response = await post(body);
    expect(response.status).toBe(200);
    const csv = (await response.text()).trim().split("\n");
    expect(csv[0]).toBe("Sale,When,Till,Cashier,Customer,Items,Paid with,Total,State");
    // The header, 5,000 sales, and the list's totals over every sale it found (SQL, as on screen).
    expect(csv).toHaveLength(REPORT_ROW_LIMIT + 2);
    expect(csv.at(-1)).toBe("Total,,,,,1,,5002.2,");
    // Newest first, as on screen.
    expect(csv[1]).toMatch(/^SALE-00001,/);
    expect(response.headers.get("X-Export-Rows")).toBe(String(REPORT_ROW_LIMIT));
    expect(response.headers.get("X-Export-Of")).toBe(String(SALES));
  });

  it("says nothing when the file holds every row", async () => {
    const { body } = await exportBody("csv");
    const query = JSON.parse(body).query;
    const response = await post(JSON.stringify({ format: "csv", query: { ...query, q: "SALE-00001" } }));
    expect(response.status).toBe(200);
    const csv = (await response.text()).trim().split("\n");
    expect(csv).toHaveLength(3);
    expect(csv[1]).toMatch(/^SALE-00001,/);
    expect(response.headers.get("X-Export-Rows")).toBeNull();
  });
});
