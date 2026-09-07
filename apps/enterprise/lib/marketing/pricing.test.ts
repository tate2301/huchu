import { describe, expect, it } from "vitest";

import {
  ANNUAL_DISCOUNT_RATE,
  FEATURE_BUNDLES,
  LISTED_FEATURE_BUNDLES,
  LADDER_TIERS,
  LISTED_TIERS,
  TIERS,
  VERTICAL_EDITION_TIERS,
  WEDGE_BUNDLES,
  getBundleDefinition,
} from "@corelithzw/platform/feature-catalog";
import {
  MARKETING_ADD_ONS,
  getMarketingTier,
  MARKETING_TIERS,
  MONTHS_PER_TERM,
  PRODUCT_COMMERCIALS,
  SCHOOL_GROUP_INDICATIVE_PER_STUDENT_PER_TERM,
  SCHOOL_PRICING_BANDS,
  TIER_COMPARISON_ROWS,
  buildQuote,
  buildSchoolQuote,
  getAddOn,
  getProductPricing,
  schoolBandForEnrolment,
  startingPriceFor,
} from "@/lib/marketing/pricing";

const bundleCodes = new Set(FEATURE_BUNDLES.map((bundle) => bundle.code));

/**
 * Bundles that carry no vertical meaning — the platform floor plus the wedge.
 * A vertical edition has to bundle something beyond these or it is not an
 * edition, it is a price.
 */
const PLATFORM_SHARED_BUNDLE_CODES = new Set<string>([
  "ADDON_OPERATIONS_CORE",
  "ADDON_STORES_CORE",
  "ADDON_WORKFORCE_CORE",
  ...WEDGE_BUNDLES,
]);

describe("tier ladder", () => {
  it("exposes a marketing tier for every listed tier, and none for a delisted one", () => {
    expect(MARKETING_TIERS).toHaveLength(LISTED_TIERS.length);
    expect(MARKETING_TIERS.map((tier) => tier.code)).toEqual(LISTED_TIERS.map((tier) => tier.code));
    expect(TIERS.some((tier) => tier.delisted)).toBe(true);
    expect(MARKETING_TIERS.map((tier) => tier.code)).not.toContain("GOLD_EDITION");
    expect(getMarketingTier("GOLD_EDITION")).toBeNull();
  });

  it("sells no gold: the delisted add-ons are off the add-on list and the comparison table", () => {
    const codes = MARKETING_ADD_ONS.map((addOn) => addOn.code);
    for (const code of ["ADDON_GOLD_CORE", "ADDON_GOLD_ADVANCED", "ADDON_COMMODITY_SETTLEMENTS", "ADDON_MINE_DAILY_OPS"]) {
      expect(codes, `${code} is still for sale`).not.toContain(code);
    }
    expect(TIER_COMPARISON_ROWS.map((row) => row.label.toLowerCase())).not.toContain("gold operations & controls");
  });

  it("prices ascend across the ladder", () => {
    const prices = MARKETING_TIERS.map((tier) => tier.monthlyPrice);
    const ascending = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(ascending);
    expect(new Set(prices).size).toBe(prices.length);
  });

  it("includes more sites at every step up the ladder", () => {
    // Vertical editions are excluded: Gold Edition is priced above SCALE
    // because a mine is worth more, not because it runs more sites.
    const sites = LADDER_TIERS.map((tier) => tier.includedSites);
    expect(sites).toEqual([...sites].sort((a, b) => a - b));
  });

  it("discounts annual billing by exactly 20%", () => {
    for (const tier of TIERS) {
      const expected = Math.round(tier.monthlyPrice * (1 - ANNUAL_DISCOUNT_RATE));
      expect(tier.annualMonthlyPrice).toBe(expected);
      expect(tier.annualMonthlyPrice).toBeLessThan(tier.monthlyPrice);
    }
  });

  it("only bundles add-ons that exist", () => {
    for (const tier of TIERS) {
      for (const code of tier.includedBundles) {
        expect(bundleCodes.has(code), `${tier.code} bundles unknown add-on ${code}`).toBe(true);
      }
    }
  });

  it("never removes a bundled add-on when moving up the ladder", () => {
    for (let index = 1; index < LADDER_TIERS.length; index += 1) {
      const lower = new Set(LADDER_TIERS[index - 1].includedBundles);
      const higher = new Set(LADDER_TIERS[index].includedBundles);
      for (const code of lower) {
        expect(higher.has(code), `${LADDER_TIERS[index].code} drops ${code}`).toBe(true);
      }
    }
  });

  it("carries the fiscal wedge into every tier above it", () => {
    // The land-and-expand motion depends on this: a shop that signs up on the
    // $19 fiscal SKU and upgrades must never lose the compliance capability it
    // bought. Editions included — a mine needs fiscal invoicing too.
    const wedgeIndex = TIERS.findIndex((tier) => tier.code === "FISCAL");
    expect(wedgeIndex).toBeGreaterThanOrEqual(0);
    for (const tier of TIERS.slice(wedgeIndex)) {
      for (const code of WEDGE_BUNDLES) {
        expect(
          tier.includedBundles.includes(code),
          `${tier.code} does not carry the fiscal wedge bundle ${code}`,
        ).toBe(true);
      }
    }
  });

  it("gives every vertical edition its own vertical bundles", () => {
    expect(VERTICAL_EDITION_TIERS.length).toBeGreaterThan(0);
    for (const tier of VERTICAL_EDITION_TIERS) {
      const verticalOnly = tier.includedBundles.filter(
        (code) => !PLATFORM_SHARED_BUNDLE_CODES.has(code),
      );
      expect(
        verticalOnly.length,
        `${tier.code} bundles nothing specific to its vertical`,
      ).toBeGreaterThan(0);
    }
  });

  it("bundles more add-on value at each step up the ladder", () => {
    const ladderCodes = new Set(LADDER_TIERS.map((tier) => tier.code));
    const values = MARKETING_TIERS.filter((tier) => ladderCodes.has(tier.code)).map(
      (tier) => tier.bundledAddOnValue,
    );
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it("marks exactly one tier as most popular", () => {
    expect(MARKETING_TIERS.filter((tier) => tier.isMostPopular)).toHaveLength(1);
  });
});

describe("add-on catalog", () => {
  it("only lists add-ons that cost money", () => {
    for (const addOn of MARKETING_ADD_ONS) {
      expect(addOn.monthlyPrice + addOn.additionalSiteMonthlyPrice).toBeGreaterThan(0);
    }
  });

  it("reports the tiers that bundle each add-on", () => {
    for (const addOn of MARKETING_ADD_ONS) {
      for (const tierCode of addOn.includedInTiers) {
        const tier = TIERS.find((entry) => entry.code === tierCode);
        expect(tier?.includedBundles).toContain(addOn.code);
      }
    }
  });
});

describe("quotes", () => {
  it("charges the base price for a single-site entry plan", () => {
    const quote = buildQuote({
      tierCode: TIERS[0].code,
      addOnCodes: [],
      sites: 1,
      users: 1,
      period: "monthly",
    });

    expect(quote.monthlyTotal).toBe(TIERS[0].monthlyPrice);
  });

  it("resolves a legacy plan code to the tier that now serves it", () => {
    // A tenant row still saying BASIC must quote as START, not fall through to
    // the entry tier by accident.
    const legacy = buildQuote({
      tierCode: "BASIC",
      addOnCodes: [],
      sites: 1,
      users: 1,
      period: "monthly",
    });
    const start = TIERS.find((tier) => tier.code === "START");

    expect(start).toBeDefined();
    expect(legacy.monthlyTotal).toBe(start?.monthlyPrice);
  });

  it("bills extra sites beyond the tier allowance", () => {
    const tier = TIERS[0];
    const quote = buildQuote({
      tierCode: tier.code,
      addOnCodes: [],
      sites: tier.includedSites + 2,
      users: 1,
      period: "monthly",
    });

    expect(quote.monthlyTotal).toBe(tier.monthlyPrice + 2 * tier.additionalSiteMonthlyPrice);
  });

  it("does not charge for an add-on the tier already bundles", () => {
    const scale = TIERS.find((tier) => tier.code === "SCALE");
    const bundled = scale?.includedBundles.find((code) => (getBundleDefinition(code)?.monthlyPrice ?? 0) > 0);
    expect(bundled).toBeDefined();

    const quote = buildQuote({
      tierCode: "SCALE",
      addOnCodes: [bundled as string],
      sites: 1,
      users: 1,
      period: "monthly",
    });

    expect(quote.monthlyTotal).toBe(scale?.monthlyPrice);
    expect(quote.lines.find((line) => line.label === getAddOn(bundled as string)?.name)?.monthly).toBe(0);
  });

  it("charges an add-on the tier does not bundle", () => {
    const entry = TIERS[0];
    // Among what is for sale: a delisted bundle is not an add-on a quote can carry.
    const unbundled = LISTED_FEATURE_BUNDLES.find(
      (bundle) =>
        bundle.monthlyPrice > 0 && !entry.includedBundles.includes(bundle.code),
    );
    expect(unbundled).toBeDefined();
    const addOn = getAddOn(unbundled!.code);
    expect(addOn).not.toBeNull();

    const quote = buildQuote({
      tierCode: entry.code,
      addOnCodes: [unbundled!.code],
      sites: 1,
      users: 1,
      period: "monthly",
    });

    expect(quote.monthlyTotal).toBe(entry.monthlyPrice + (addOn?.monthlyPrice ?? 0));
  });

  it("quotes annual billing below monthly billing", () => {
    const input = { tierCode: "STANDARD", addOnCodes: [] as string[], sites: 2, users: 8 };
    const monthly = buildQuote({ ...input, period: "monthly" });
    const annual = buildQuote({ ...input, period: "annual" });

    expect(annual.monthlyTotal).toBeLessThan(monthly.monthlyTotal);
    expect(monthly.annualSavings).toBeGreaterThan(0);
  });

  it("falls back to the entry tier for an unknown plan code", () => {
    const quote = buildQuote({
      tierCode: "NOT_A_TIER",
      addOnCodes: [],
      sites: 1,
      users: 1,
      period: "monthly",
    });

    expect(quote.tier.code).toBe(TIERS[0].code);
  });
});

describe("starting prices", () => {
  it("ignores add-ons the entry tier already bundles", () => {
    const bundled = TIERS[0].includedBundles[0];
    expect(startingPriceFor([bundled])).toBe(TIERS[0].monthlyPrice);
  });

  it("adds the price of add-ons the entry tier does not bundle", () => {
    expect(startingPriceFor(["ADDON_CCTV_SUITE"])).toBe(
      TIERS[0].monthlyPrice + (getBundleDefinition("ADDON_CCTV_SUITE")?.monthlyPrice ?? 0),
    );
  });
});

describe("product catalog", () => {
  it("has unique slugs", () => {
    const slugs = PRODUCT_COMMERCIALS.map((product) => product.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only references add-ons that exist", () => {
    for (const product of PRODUCT_COMMERCIALS) {
      for (const code of [...product.requiredAddOnCodes, ...product.recommendedAddOnCodes]) {
        expect(bundleCodes.has(code), `${product.slug} references unknown add-on ${code}`).toBe(true);
      }
    }
  });

  it("recommends a real tier", () => {
    for (const product of PRODUCT_COMMERCIALS) {
      expect(TIERS.some((tier) => tier.code === product.recommendedTierCode)).toBe(true);
    }
  });

  it("quotes a starting price for every subscription product", () => {
    for (const product of PRODUCT_COMMERCIALS.filter((entry) => entry.pricingModel === "subscription")) {
      const pricing = getProductPricing(product.slug);
      expect(pricing?.startingMonthly).toBeGreaterThanOrEqual(TIERS[0].monthlyPrice);
      expect(pricing?.typicalMonthly).toBeGreaterThanOrEqual(pricing?.startingMonthly ?? 0);
    }
  });

  it("sends bespoke products to their own pricing page", () => {
    for (const product of PRODUCT_COMMERCIALS.filter((entry) => entry.pricingModel === "bespoke")) {
      const pricing = getProductPricing(product.slug);
      expect(pricing?.startingMonthly).toBeNull();
      expect(product.pricingHref).not.toBe("/home/pricing");
    }
  });
});

describe("school pricing", () => {
  it("ascends in price and enrolment", () => {
    const priced = SCHOOL_PRICING_BANDS.filter((band) => band.termPrice !== null);
    const prices = priced.map((band) => band.termPrice as number);
    const caps = priced.map((band) => band.maxStudents as number);

    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(caps).toEqual([...caps].sort((a, b) => a - b));
  });

  it("ends with a single quoted band", () => {
    const custom = SCHOOL_PRICING_BANDS.filter((band) => band.termPrice === null);
    expect(custom).toHaveLength(1);
    expect(SCHOOL_PRICING_BANDS.at(-1)?.termPrice).toBeNull();
  });

  it("marks exactly one band as most popular", () => {
    expect(SCHOOL_PRICING_BANDS.filter((band) => band.isMostPopular)).toHaveLength(1);
  });

  it("places enrolment in the right band at the boundaries", () => {
    expect(schoolBandForEnrolment(1).code).toBe("COMMUNITY");
    expect(schoolBandForEnrolment(300).code).toBe("COMMUNITY");
    expect(schoolBandForEnrolment(301).code).toBe("STANDARD");
    expect(schoolBandForEnrolment(800).code).toBe("STANDARD");
    expect(schoolBandForEnrolment(801).code).toBe("PREMIER");
    expect(schoolBandForEnrolment(1500).code).toBe("PREMIER");
    expect(schoolBandForEnrolment(1501).code).toBe("GROUP");
  });

  it("quotes a band price with no overage inside the band", () => {
    const quote = buildSchoolQuote(250);
    expect(quote.isCustom).toBe(false);
    expect(quote.termTotal).toBe(249);
    expect(quote.monthlyEquivalent).toBeCloseTo(249 / MONTHS_PER_TERM, 5);
  });

  it("never charges overage inside a band", () => {
    // 300 sits exactly on the Community ceiling, so the price is the band price.
    expect(buildSchoolQuote(300).termTotal).toBe(249);
    // 301 rolls into the next band rather than adding overage to Community.
    expect(buildSchoolQuote(301).termTotal).toBe(549);
  });

  it("quotes rather than prices enrolment above the top band", () => {
    const quote = buildSchoolQuote(1400);
    expect(quote.band.code).toBe("PREMIER");
    expect(quote.termTotal).toBe(949);

    const overBand = buildSchoolQuote(1501);
    expect(overBand.isCustom).toBe(true);
    expect(overBand.termTotal).toBeNull();
    expect(overBand.monthlyEquivalent).toBeNull();
  });

  it("gets cheaper per student as enrolment grows", () => {
    const small = buildSchoolQuote(300).perStudentPerTerm as number;
    const medium = buildSchoolQuote(800).perStudentPerTerm as number;
    const large = buildSchoolQuote(1500).perStudentPerTerm as number;

    expect(medium).toBeLessThan(small);
    expect(large).toBeLessThan(medium);
  });

  it("never makes growing past the top band cost more per student", () => {
    // A Group quote has to beat the rate a school already gets at the Premier
    // ceiling, otherwise the pricing punishes exactly the schools we want most.
    const premier = SCHOOL_PRICING_BANDS.find((band) => band.code === "PREMIER");
    const premierRate = (premier?.termPrice as number) / (premier?.maxStudents as number);
    expect(SCHOOL_GROUP_INDICATIVE_PER_STUDENT_PER_TERM).toBeLessThan(premierRate);
  });

  it("never charges more per student than the band below it", () => {
    const priced = SCHOOL_PRICING_BANDS.filter((band) => band.termPrice !== null);
    const rates = priced.map((band) => (band.termPrice as number) / (band.maxStudents as number));
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });

  it("reconciles the schools add-on list price with the mid enrolment band", () => {
    const suite = getBundleDefinition("ADDON_SCHOOLS_SUITE");
    const midBand = SCHOOL_PRICING_BANDS.find((band) => band.code === "STANDARD");
    const bandMonthly = (midBand?.termPrice as number) / MONTHS_PER_TERM;

    expect(suite).not.toBeNull();
    // The catalog price is the monthly equivalent of the mid band, so a school
    // provisioned from the platform console is not quoted a different number.
    expect(Math.abs((suite?.monthlyPrice ?? 0) - bandMonthly) / bandMonthly).toBeLessThan(0.15);
  });
});

describe("comparison table", () => {
  it("has one value per tier in every row", () => {
    for (const row of TIER_COMPARISON_ROWS) {
      expect(row.values, `row "${row.label}" has the wrong column count`).toHaveLength(
        MARKETING_TIERS.length,
      );
    }
  });
});
