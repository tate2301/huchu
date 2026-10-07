/**
 * A price list's worksheet (`retail-prices`, PRD-05) against a real Postgres:
 * the owner sees each price's cost, margin and what they come to; a cashier,
 * who may not see cost, gets no figure worked out from it either — no
 * margin, profit, priced cost, under-cost flag or tone, no margin in the
 * card's line — and is offered no Margin filter or sort.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { fetchListPage } from "@/lib/reports/request";
import type { ListPageResponse } from "@/lib/reports/types";
import { defaultPriceList } from "@/lib/retail/prices/change";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

let shop: TestShop;
let listId: string;

const COST_FIELDS = ["cost", "margin", "marginTone", "underCost", "profit", "pricedCost"];

const session = (role: string) =>
  ({
    user: { id: shop.ownerId, companyId: shop.companyId, role, enabledFeatures: ["retail.core", "retail.catalog", "retail.promotions", "stores.inventory"] },
    expires: "",
  }) as AuthenticatedSession;

async function worksheet(role: string): Promise<ListPageResponse> {
  const answer = await fetchListPage(session(role), "retail-prices", { page: 1, size: 25, filters: { list: listId } });
  if (!("rows" in answer)) throw new Error(`refused: ${answer.error}`);
  return answer;
}

beforeAll(async () => {
  shop = await makeTestShop("Worksheet cost");
  await addTestProduct(shop.companyId, { name: "Amarula Cream 750ml", code: "AMARULA-750", price: "18.25", cost: "13.03" });
  listId = (await defaultPriceList(prisma, shop.companyId)).id;
}, 60_000);

afterAll(async () => {
  if (shop) await destroyProvisionedTenant(shop.companyId);
});

describe("the worksheet and the cost", () => {
  it("shows the owner the margin, and its average in the totals", async () => {
    const page = await worksheet("SUPERADMIN");
    expect(page.rows[0]).toMatchObject({ price: 18.25, cost: 13.03, margin: 28.6, profit: 5.22, pricedCost: 18.25 });
    expect(String(page.rows[0]!.cardMeta)).toMatch(/· margin 28\.6%$/);
    expect(page.totals.margin).toBeCloseTo(28.6, 1);
    expect(page.report.list.filters.map((filter) => filter.key)).toContain("margin");
    expect(page.report.list.sorts.map((sort) => sort.key)).toContain("margin");
  });

  it("gives a cashier nothing worked out from the cost, and no Margin filter or sort", async () => {
    const page = await worksheet("CASHIER");
    const row = page.rows[0]!;
    expect(row.price).toBe(18.25);
    for (const field of COST_FIELDS) expect(row).not.toHaveProperty(field);
    expect(row.cardMeta).not.toMatch(/margin/);
    expect(Object.keys(page.totals)).not.toContain("margin");
    expect(page.report.list.filters.map((filter) => filter.key)).not.toContain("margin");
    expect(page.report.list.sorts.map((sort) => sort.key)).not.toContain("margin");
  });
});
