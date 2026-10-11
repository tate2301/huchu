import { describe, expect, it } from "vitest";

import { promotionKind, type PromotionRecord } from "./promotions";

/**
 * The promotion record (PRD-09): an ended one's rail says when End now ended
 * it; the Products KPI, tab and Σ agree when a product sold under it and has
 * left its scope; an amount off that reaches a product's price warns on the
 * Value row; nothing sold under it reads as nothing to judge.
 */

const festive = (extra: Partial<PromotionRecord> = {}): PromotionRecord => ({
  id: "p1",
  code: "PROMO-FESTIVE",
  name: "Festive season US$2 off spirits",
  kind: "AMOUNT",
  kindLabel: "Amount off",
  value: 2,
  valueLabel: "US$2.00",
  buyQuantity: null,
  scope: "CATEGORIES",
  products: Array.from({ length: 7 }, (_, index) => ({ id: `s${index}`, name: `Spirit ${index}` })),
  scopePrices: [
    { id: "s0", name: "Bols Brandy 50ml", price: 1.8 },
    { id: "s1", name: "Jameson Irish Whiskey 750ml", price: 27.9 },
  ],
  categories: [{ id: "c1", name: "Spirits" }],
  appliesToLabel: "Spirits, 7 products",
  appliesToShort: "Spirits, 7",
  unitWord: "bottle",
  minBasket: null,
  daysOfWeek: [],
  days: "Every day, all day",
  audience: "EVERYONE",
  stacks: false,
  site: null,
  startsAt: "2026-09-01T22:00:00.000Z",
  endsAt: null,
  pausedAt: null,
  endedAt: null,
  state: "RUNNING",
  badge: { label: "Running", tone: "ok" },
  figures: {
    soldUnder: 467,
    soldDuring: 470,
    soldBefore: 390,
    soldChange: 21,
    extraTakings: 1200,
    givenAway: 934,
    perDollarGiven: 1.28,
    givenEach: 2,
    products: 7,
    notSold: 0,
    leftScope: 1,
    runningDays: 40,
    startsInDays: 0,
  },
  createdBy: "Tendai Mhlanga",
  archivedAt: null,
  bin: null,
  tabCounts: { products: 8, sales: 400, activity: 3 },
  weeks: [],
  ...extra,
});

const row = (record: PromotionRecord, key: string) =>
  promotionKind.rail(record).flatMap((group) => group.rows).find((entry) => entry.key === key)!;

describe("the promotion record", () => {
  it("says when End now ended it under Ends", () => {
    const ended = festive({ state: "ENDED", endedAt: "2026-10-11T19:52:00.000Z" });
    expect(row(ended, "ends")).toMatchObject({ value: "Ended 11 October 2026, 21:52" });
    expect(row(ended, "ends").edit).toBeUndefined();
    expect(row(festive(), "ends").value).toBe("No end date");
  });

  it("counts a product that left its scope in the tab's Σ and under the KPI", () => {
    const record = festive();
    const products = promotionKind.kpis!(record).find((kpi) => kpi.label === "Products")!;
    expect(products).toMatchObject({ value: "7", lead: "+1", note: "more sold under it" });
    const tab = promotionKind.tabs!.find((entry) => entry.key === "products") as {
      totalsText: (record: PromotionRecord, totals: Record<string, number>) => Record<string, string>;
    };
    expect(tab.totalsText(record, {}).product).toBe("Σ 8 products");
  });

  it("warns on Value when the amount off gives a product away, not once it has ended", () => {
    expect(row(festive(), "value").warn).toBe("Bols Brandy 50ml is US$1.80: it goes free.");
    expect(row(festive({ state: "ENDED" }), "value").warn).toBeUndefined();
  });

  it("reads nothing sold under it as nothing to judge", () => {
    const staff = festive({ figures: { ...festive().figures, soldUnder: 0, soldDuring: 0, soldBefore: 0, soldChange: null, extraTakings: 0, givenAway: 0, perDollarGiven: null, givenEach: 2 } });
    expect(promotionKind.kpis!(staff)[0]).toMatchObject({ label: "Sold under it", value: "0", note: "Nothing sold under it yet" });
  });
});
