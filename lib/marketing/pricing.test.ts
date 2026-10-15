import { describe, expect, it } from "vitest";

import { TIERS } from "@/lib/platform/feature-catalog";
import { VERTICAL_ORDER, VERTICAL_RATE } from "@/lib/platform/verticals";
import * as pricing from "@/lib/marketing/pricing";
import {
  COMPETITIVE_EDGE,
  INCLUDED_MEMBERS,
  LARGE_PRICE,
  MARKETING_VERTICALS,
  PRICE_EXAMPLES,
  PRICE_RULE_COPY,
  PRODUCT_COMMERCIALS,
  SMALL_PRICE,
  STARTING_PRICE_LABEL,
  TCO_ROWS,
  buildQuote,
  getProductPricing,
  productPriceLabel,
} from "@/lib/marketing/pricing";

describe("the rate", () => {
  it("reads every figure from the vertical rate", () => {
    expect(SMALL_PRICE).toBe(VERTICAL_RATE.small);
    expect(LARGE_PRICE).toBe(VERTICAL_RATE.large);
    expect(INCLUDED_MEMBERS).toBe(VERTICAL_RATE.includedMembers);
    expect(STARTING_PRICE_LABEL).toBe("From $39 a month");
    expect(PRICE_RULE_COPY).toBe(
      "$39 a month per vertical for up to 5 people, $99 a month per vertical above that.",
    );
  });
});

describe("quotes", () => {
  it("charges $39 a vertical up to five members", () => {
    expect(buildQuote({ verticals: 1, members: 3 }).total).toBe(39);
    expect(buildQuote({ verticals: 1, members: 5 }).total).toBe(39);
  });

  it("charges $99 a vertical from the sixth member", () => {
    expect(buildQuote({ verticals: 1, members: 6 })).toMatchObject({ each: 99, over: true, total: 99 });
  });

  it("charges every vertical at the same rate", () => {
    expect(buildQuote({ verticals: 2, members: 4 }).total).toBe(78);
    expect(buildQuote({ verticals: 2, members: 12 }).total).toBe(198);
    expect(buildQuote({ verticals: 3, members: 6 }).total).toBe(297);
  });

  it("charges nothing without a vertical", () => {
    const quote = buildQuote({ verticals: 0, members: 4 });
    expect(quote.total).toBe(0);
    expect(quote.lines).toEqual([]);
  });

  it("gives one line per vertical, named when the verticals are", () => {
    const quote = buildQuote({ verticals: ["RETAIL", "PAYROLL"], members: 12 });
    expect(quote.lines).toEqual([
      { label: "Retail", amount: 99 },
      { label: "Payroll services", amount: 99 },
    ]);
    expect(quote.total).toBe(198);
  });

  it("does not charge the same vertical twice", () => {
    expect(buildQuote({ verticals: ["SCHOOLS", "SCHOOLS"], members: 4 }).total).toBe(39);
  });

  it("prints the worked examples at their exact figures", () => {
    expect(PRICE_EXAMPLES.map((quote) => [quote.verticals, quote.members, quote.total])).toEqual([
      [1, 3, 39],
      [1, 8, 99],
      [2, 4, 78],
      [2, 12, 198],
    ]);
  });
});

describe("verticals on the site", () => {
  it("lists every vertical once, in order", () => {
    expect(MARKETING_VERTICALS.map((vertical) => vertical.code)).toEqual([...VERTICAL_ORDER]);
  });
});

describe("product prices", () => {
  it("has unique slugs", () => {
    const slugs = PRODUCT_COMMERCIALS.map((product) => product.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("starts every product at the small vertical rate", () => {
    for (const product of PRODUCT_COMMERCIALS) {
      expect(getProductPricing(product.slug)?.startingMonthly).toBe(VERTICAL_RATE.small);
      expect(productPriceLabel(product.slug)).toBe(`From $${VERTICAL_RATE.small} a month`);
    }
  });

  it("has no price for a product it does not sell", () => {
    expect(productPriceLabel("not-a-product")).toBeNull();
  });
});

describe("what the site never shows", () => {
  it("names no tier anywhere in the exported marketing data", () => {
    const exported = JSON.stringify(
      Object.values(pricing).filter((value) => typeof value !== "function"),
    );
    for (const tier of TIERS) {
      expect(exported, `marketing data names the ${tier.code} tier`).not.toMatch(
        new RegExp(`\\b${tier.code}\\b|\\b${tier.name} (plan|tier)\\b`),
      );
    }
    expect(exported).not.toMatch(/Gold Edition|Enterprise/);
    expect(exported).not.toMatch(/billed annually|annual prepay|onboarding fee|per site|per term/i);
  });

  it("costs the comparison from the vertical rate", () => {
    expect(TCO_ROWS.find((row) => row.label === "Monthly cost, 15 staff")?.corelith).toBe("$99");
    expect(COMPETITIVE_EDGE.some((edge) => edge.copy.includes(PRICE_RULE_COPY))).toBe(true);
  });
});
