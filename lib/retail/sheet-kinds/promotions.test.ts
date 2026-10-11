import { describe, expect, it } from "vitest";

import type { SheetCtx } from "@/lib/workspace/sheet-kind";

import { PROMOTION_SHEETS } from "./promotions";

/**
 * Promotions' sheets (PRD-09) as the server reads them: New promotion sends
 * the board's month-end cider deal as Buy 2 for 5.00 over three products,
 * from the picker's wall-clock moments; its primary says "Start it" for a
 * start that has come; a running promotion's edit leaves its kind and its
 * start out of the PATCH.
 */

const ctx = (id: string | null = null): SheetCtx => ({
  params: new URLSearchParams(),
  id,
  user: { id: "u", name: "Tafara Nyathi", role: "MANAGER" },
  can: () => true,
});

const ciders = {
  name: "Month-end two for US$5 ciders",
  kind: "Buy X, pay less",
  buy: "2",
  for: "5.00",
  percent: "10%",
  appliesTo: "Some products",
  products: [
    { id: "savanna", label: "Savanna Dry 330ml" },
    { id: "hunters", label: "Hunter’s Gold 330ml" },
    { id: "bernini", label: "Bernini Blush 275ml" },
  ],
  categories: [{ id: "spirits", label: "Spirits" }],
  starts: "2026-10-25T00:00",
  ends: "2026-10-31T23:59",
  audience: "Everyone",
  stacks: false,
  code: "MONTHEND-CIDER",
};

describe("New promotion", () => {
  const sheet = PROMOTION_SHEETS["promotion-new"]!;

  it("sends the month-end cider deal as the server reads it", () => {
    expect(sheet.submit(ciders, ctx())).toEqual({
      method: "POST",
      url: "/api/v2/retail/promotions",
      body: {
        name: "Month-end two for US$5 ciders",
        kind: "BUY_X_PAY",
        value: "5.00",
        buyQuantity: 2,
        appliesTo: "PRODUCTS",
        productIds: ["savanna", "hunters", "bernini"],
        categoryIds: [],
        starts: "2026-10-25T00:00",
        ends: "2026-10-31T23:59",
        audience: "EVERYONE",
        stacks: false,
        code: "MONTHEND-CIDER",
      },
    });
  });

  it("sends a percent without its sign, and no end as null", () => {
    const body = (sheet.submit({ ...ciders, kind: "% off", appliesTo: "Some categories", ends: null }, ctx())!.body ?? {}) as Record<string, unknown>;
    expect(body).toMatchObject({ kind: "PERCENT", value: "10", appliesTo: "CATEGORIES", categoryIds: ["spirits"], productIds: [], ends: null });
    expect(body).not.toHaveProperty("buyQuantity");
  });

  it("says Schedule it for a later start and Start it for one that has come", () => {
    const primary = sheet.primary as (values: Record<string, unknown>) => string;
    expect(primary({ starts: "2999-01-01T00:00" })).toBe("Schedule it");
    expect(primary({ starts: "2020-01-01T00:00" })).toBe("Start it");
  });

  it("suggests the code from the name", () => {
    const code = sheet.sections.flatMap((section) => section.fields).find((field) => field.id === "code")!;
    expect(code.derive!({ name: "Month-end two for US$5 ciders" })).toBe("MONTH-END-TWO-FOR-US-5-CIDERS");
  });
});

describe("A promotion's rules", () => {
  const sheet = PROMOTION_SHEETS["promotion-edit"]!;

  it("leaves a running promotion's kind and start out of what it saves", () => {
    const request = sheet.submit({ ...ciders, kind: "Amount off", amount: "2.00", _started: true }, ctx("festive"))!;
    expect(request).toMatchObject({ method: "PATCH", url: "/api/v2/retail/promotions/festive" });
    expect(request.body).not.toHaveProperty("starts");
    expect(request.body).not.toHaveProperty("kind");
    expect(request.body).toMatchObject({ value: "2.00", ends: "2026-10-31T23:59" });
  });

  it("sends both while it is still scheduled", () => {
    expect(sheet.submit({ ...ciders, _started: false }, ctx("cider"))!.body).toMatchObject({ kind: "BUY_X_PAY", starts: "2026-10-25T00:00" });
  });
});
