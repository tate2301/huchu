import { describe, expect, it } from "vitest";

import { resolveListQuery, runList } from "@/lib/reports/list-query";

import { STOCK_COUNT_REPORTS } from "./stock-counts";

const differences = STOCK_COUNT_REPORTS.find((source) => source.key === "retail-stock-count-differences")!.list!;

const line = (product: string, order: number, difference: number, value: number | null) => ({ id: product, countId: "c", product, order, difference, value });

describe("a count's Differences (30-stock 5.10)", () => {
  it("lead with the largest loss by value, then by product", () => {
    const rows = [line("Gordon's Gin 750ml", 0, -2, -24.8), line("Bols Brandy 50ml", 1, 2, 2.4), line("Nederburg Baronne 750ml", 2, -2, -18.8)];
    const query = resolveListQuery(differences, { page: 1, size: 50, filters: { count: "c" } }, {}, { role: "MANAGER", seeCost: true });
    const run = runList(differences, rows, query, { role: "MANAGER", userId: "u", now: new Date(), timeZone: "Africa/Harare", can: () => true, seeCost: true });
    expect(run.ordered.map((row) => row.product)).toEqual(["Gordon's Gin 750ml", "Nederburg Baronne 750ml", "Bols Brandy 50ml"]);
  });
});
