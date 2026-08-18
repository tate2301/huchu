/**
 * Marketing pricing — single source of truth.
 *
 * Every price the public site shows is DERIVED from the billing catalog in
 * `lib/platform/feature-catalog.ts`. Nothing here hardcodes a dollar figure that
 * also lives in the catalog, so the pricing page and the invoice can never
 * disagree. If you need to change a price, change it in the catalog.
 *
 * Annual is the default ask (PR-2.1). Annual prepay is 20% off, so every tier
 * carries its annual price as the headline and its monthly price as the
 * fallback. Surfaces should lead with `headlinePrice`/`headlineCaption` and only
 * then show `fallbackPrice`.
 *
 * The one exception to deriving everything is `SCHOOL_PRICING_BANDS`: schools
 * are sold per term against enrolment bands rather than per month, so that
 * ladder is defined here and reconciled back to `ADDON_SCHOOLS_SUITE` by the
 * tests in `pricing.test.ts`.
 */

import {
  ANNUAL_DISCOUNT_RATE,
  BUNDLE_DEPENDENCIES,
  FEATURE_BUNDLES,
  TIERS,
  USER_PACK_SIZE,
  getBundleDefinition,
  getTierDefinition,
  type FeatureBundleDefinition,
  type TierDefinition,
} from "@/lib/platform/feature-catalog";

export { ANNUAL_DISCOUNT_RATE, USER_PACK_SIZE };

/** Terms in a Zimbabwean school year — schools budget per term, not per month. */
export const TERMS_PER_YEAR = 3;
export const MONTHS_PER_TERM = 12 / TERMS_PER_YEAR;
export const LAUNCH_SPRINT_DAYS = 30;
export const LAUNCH_SPRINT_COPY =
  "Launch setup with workflow mapping, migration, training, go-live support, and WhatsApp follow-up";

export type BillingPeriod = "monthly" | "annual";

/** Annual prepay is what we ask for; monthly is the fallback, not the default. */
export const DEFAULT_BILLING_PERIOD: BillingPeriod = "annual";
export const ANNUAL_DISCOUNT_PERCENT = Math.round(ANNUAL_DISCOUNT_RATE * 100);
export const ANNUAL_DISCOUNT_LABEL = `${ANNUAL_DISCOUNT_PERCENT}% off`;
/** One sentence every surface can reuse instead of restating the discount. */
export const ANNUAL_PREPAY_COPY = `Pay for the year and pay ${ANNUAL_DISCOUNT_PERCENT}% less`;

export function formatUsd(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export type MarketingTier = {
  code: string;
  name: string;
  tagline: string;
  description: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  /** Dollars saved per year by paying annually. Shown as cash, not a percentage. */
  annualSavings: number;
  /** The price to lead with: per month, billed annually. */
  headlinePrice: number;
  headlineCaption: string;
  /** The fallback ask: month to month, no commitment. */
  fallbackPrice: number;
  fallbackCaption: string;
  annualDiscountLabel: string;
  /** One-off setup fee, quoted before rollout. Zero on the self-serve tiers. */
  onboardingFee: number;
  onboardingLabel: string;
  /** Quoted rather than listed — the published price is a floor, not the ask. */
  isQuoted: boolean;
  /** "From " on quoted tiers, empty on listed ones. Prefix for any price shown. */
  pricePrefix: string;
  includedSites: number;
  additionalSiteMonthlyPrice: number;
  includedUsers: number | null;
  bestFor: string;
  /** Everyday framing of the price, e.g. "less than a tank of fuel". */
  costAnchor: string;
  highlights: string[];
  support: string;
  includedBundleCodes: string[];
  /** Monthly list value of the add-ons bundled into this tier. */
  bundledAddOnValue: number;
  isMostPopular: boolean;
  ctaLabel: string;
  ctaHref: string;
};

type TierCopy = {
  tagline: string;
  bestFor: string;
  costAnchor: string;
  highlights: string[];
  support: string;
  isMostPopular?: boolean;
  ctaLabel: string;
  ctaHref: string;
};

/**
 * Copy for the six tiers in `TIERS` (PR-1.2). Fiscal and Gold Edition are
 * vertical SKUs rather than rungs on the ladder, so neither of them claims
 * "everything in the plan below" — Start does not carry fiscalisation, and Gold
 * Edition does not carry retail, CRM, maintenance or portals.
 */
const TIER_COPY: Record<string, TierCopy> = {
  FISCAL: {
    tagline: "Fiscalise first",
    bestFor:
      "Businesses that have to issue fiscal receipts across one or more tills and want that obligation handled before anything else.",
    costAnchor: "Less than one day of fiscal penalty",
    highlights: [
      "ZIMRA fiscalisation and the FDMS link on every till",
      "Customers, invoices, suppliers and tax codes",
      "Multi-till and multi-site from day one",
      "Works offline and syncs when the line returns",
      "WhatsApp support",
    ],
    support: "WhatsApp",
    ctaLabel: "Start fiscalising",
    ctaHref: "/home/book-demo?plan=fiscal",
  },
  START: {
    tagline: "Get it out of the notebook",
    bestFor:
      "One shop, yard or office where the real records still live in a book and one person's head.",
    costAnchor: "About a dollar a day",
    highlights: [
      "Till, catalog, stock, movements and receiving",
      "Staff directory and daily operations",
      "Works offline on every device",
      "Add ZIMRA fiscalisation when you need it",
      "WhatsApp support",
    ],
    support: "WhatsApp",
    ctaLabel: "Find your setup",
    ctaHref: "/home/book-demo?plan=start",
  },
  GROW: {
    tagline: "Make the branches agree",
    bestFor:
      "Three or more tills across a few branches, where nobody can compare one against another without asking for a spreadsheet.",
    costAnchor: "Less than one stock-count mistake a month",
    highlights: [
      "Everything in Fiscal and Start",
      "Roles, permissions and approval limits",
      "Advanced reports and full audit trails",
      "Accounting core with ZIMRA fiscalisation included",
      "Email and WhatsApp support",
    ],
    support: "Email + WhatsApp",
    isMostPopular: true,
    ctaLabel: "Find your setup",
    ctaHref: "/home/book-demo?plan=grow",
  },
  SCALE: {
    tagline: "Run the whole group",
    bestFor:
      "Chains running many branches that need finance, sales, work orders and portals connected rather than reconciled.",
    costAnchor: "Less than a junior clerk's salary",
    highlights: [
      "Everything in Grow",
      "Receivables, payables, banking and multi-currency",
      "CRM pipeline, quotes and commission",
      "Maintenance, work orders and service schedules",
      "Customer and staff portals",
      "Priority support",
    ],
    support: "Priority",
    ctaLabel: "Plan a rollout",
    ctaHref: "/home/book-demo?plan=scale",
  },
  GOLD_EDITION: {
    tagline: "Account for every gram",
    bestFor:
      "Small and medium gold operations that have to reconcile production, settlement and payroll against what was actually recovered.",
    costAnchor: "Priced against a fraction of one bad reconciliation",
    highlights: [
      "Daily mine capture, production and recovery",
      "Gold controls, custody and reconciliation",
      "Commodity settlement against delivered grams",
      "Full books with ZIMRA fiscalisation",
      "Payroll including Zimbabwe statutory returns",
      "Priority support and a named contact",
    ],
    support: "Priority + named contact",
    ctaLabel: "Talk to us about Gold Edition",
    ctaHref: "/home/book-demo?plan=gold",
  },
  ENTERPRISE: {
    tagline: "Govern it properly",
    bestFor:
      "Established groups carrying audit, compliance and payroll obligations across many sites.",
    costAnchor: "Priced against the cost of one bad audit",
    highlights: [
      "Everything in Scale",
      "Compliance, permits, inspections and training records",
      "Advanced payroll and disbursements",
      "Custom branding on your own domain",
      "Unlimited users and a named account manager",
      "Scope, price and onboarding agreed with you",
    ],
    support: "Priority + account manager",
    ctaLabel: "Talk to us",
    ctaHref: "/home/book-demo?plan=enterprise",
  },
};

/**
 * Tiers we quote rather than list. The catalog still carries a monthly price for
 * them — it is the floor a scoped quote starts from and the rate existing
 * tenants are already on — so the site shows it as "from", never as the ask.
 */
const QUOTED_TIER_CODES = new Set(["ENTERPRISE"]);

function bundleValue(codes: string[]): number {
  return codes.reduce((sum, code) => sum + (getBundleDefinition(code)?.monthlyPrice ?? 0), 0);
}

function onboardingLabelFor(tier: TierDefinition, isQuoted: boolean): string {
  if (isQuoted) return "Onboarding scoped with you";
  return tier.onboardingFee > 0
    ? `${formatUsd(tier.onboardingFee)} one-off onboarding`
    : "No onboarding fee";
}

function toMarketingTier(tier: TierDefinition): MarketingTier {
  const copy = TIER_COPY[tier.code];

  if (!copy) {
    throw new Error(`Missing marketing copy for tier ${tier.code}`);
  }

  const isQuoted = QUOTED_TIER_CODES.has(tier.code);
  const pricePrefix = isQuoted ? "From " : "";

  return {
    code: tier.code,
    name: tier.name,
    tagline: copy.tagline,
    description: tier.description,
    monthlyPrice: tier.monthlyPrice,
    annualMonthlyPrice: tier.annualMonthlyPrice,
    annualSavings: tier.monthlyPrice * 12 - tier.annualMonthlyPrice * 12,
    headlinePrice: tier.annualMonthlyPrice,
    headlineCaption: "per month, billed annually",
    fallbackPrice: tier.monthlyPrice,
    fallbackCaption: `${pricePrefix}${formatUsd(tier.monthlyPrice)}/mo billed monthly`,
    annualDiscountLabel: ANNUAL_DISCOUNT_LABEL,
    onboardingFee: tier.onboardingFee,
    onboardingLabel: onboardingLabelFor(tier, isQuoted),
    isQuoted,
    pricePrefix,
    includedSites: tier.includedSites,
    additionalSiteMonthlyPrice: tier.additionalSiteMonthlyPrice,
    includedUsers: tier.includedUsers,
    bestFor: copy.bestFor,
    costAnchor: copy.costAnchor,
    highlights: copy.highlights,
    support: copy.support,
    includedBundleCodes: tier.includedBundles,
    bundledAddOnValue: bundleValue(tier.includedBundles),
    isMostPopular: copy.isMostPopular ?? false,
    ctaLabel: copy.ctaLabel,
    ctaHref: copy.ctaHref,
  };
}

/** Cheapest first, so the fiscal wedge leads wherever the ladder is rendered. */
export const MARKETING_TIERS: MarketingTier[] = TIERS.map(toMarketingTier);

export const ENTRY_TIER = MARKETING_TIERS[0];
export const POPULAR_TIER =
  MARKETING_TIERS.find((tier) => tier.isMostPopular) ?? MARKETING_TIERS[1] ?? ENTRY_TIER;

export function getMarketingTier(code: string): MarketingTier | null {
  const definition = getTierDefinition(code);
  return definition
    ? MARKETING_TIERS.find((tier) => tier.code === definition.code) ?? null
    : null;
}

/** Lowest published monthly price — used in hero copy and meta descriptions. */
export const STARTING_MONTHLY_PRICE = Math.min(...MARKETING_TIERS.map((tier) => tier.monthlyPrice));

/** The same figure on the annual ask, which is the one we lead with. */
export const STARTING_ANNUAL_MONTHLY_PRICE = Math.min(
  ...MARKETING_TIERS.map((tier) => tier.annualMonthlyPrice),
);

export function tierPriceFor(tier: MarketingTier, period: BillingPeriod): number {
  return period === "annual" ? tier.annualMonthlyPrice : tier.monthlyPrice;
}

/** Price with its "from" prefix, e.g. "$15/mo" or "From $359/mo". */
export function formatTierPrice(
  tier: MarketingTier,
  period: BillingPeriod = DEFAULT_BILLING_PERIOD,
): string {
  return `${tier.pricePrefix}${formatUsd(tierPriceFor(tier, period))}/mo`;
}

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

export type AddOnCategory =
  | "Industry"
  | "Sales & CRM"
  | "Finance"
  | "Workforce"
  | "Assets & Safety"
  | "Platform";

export type MarketingAddOn = {
  code: string;
  name: string;
  description: string;
  monthlyPrice: number;
  additionalSiteMonthlyPrice: number;
  category: AddOnCategory;
  /** Tier codes that already bundle this add-on at no extra cost. */
  includedInTiers: string[];
  featureCount: number;
};

const ADD_ON_CATEGORY_BY_CODE: Record<string, AddOnCategory> = {
  ADDON_GOLD_CORE: "Industry",
  ADDON_GOLD_ADVANCED: "Industry",
  ADDON_COMMODITY_SETTLEMENTS: "Industry",
  ADDON_RETAIL_SUITE: "Industry",
  ADDON_CRM_SUITE: "Sales & CRM",
  ADDON_SCHOOLS_SUITE: "Industry",
  ADDON_ACCOUNTING_CORE: "Finance",
  ADDON_ACCOUNTING_ADVANCED: "Finance",
  ADDON_ZIMRA_FISCAL: "Finance",
  ADDON_ADVANCED_PAYROLL: "Workforce",
  ADDON_ZIMBABWE_PAYROLL: "Workforce",
  ADDON_USER_MANAGEMENT_PRO: "Workforce",
  ADDON_MAINTENANCE_PRO: "Assets & Safety",
  ADDON_COMPLIANCE_PRO: "Assets & Safety",
  ADDON_ANALYTICS_PRO: "Platform",
  ADDON_CUSTOM_BRANDING: "Platform",
  ADDON_PORTAL_SUITE: "Platform",
};

export const ADD_ON_CATEGORY_ORDER: AddOnCategory[] = [
  "Industry",
  "Sales & CRM",
  "Finance",
  "Workforce",
  "Assets & Safety",
  "Platform",
];

function tiersIncluding(code: string): string[] {
  return TIERS.filter((tier) => tier.includedBundles.includes(code)).map((tier) => tier.code);
}

function toMarketingAddOn(bundle: FeatureBundleDefinition): MarketingAddOn {
  return {
    code: bundle.code,
    name: bundle.name,
    description: bundle.description,
    monthlyPrice: bundle.monthlyPrice,
    additionalSiteMonthlyPrice: bundle.additionalSiteMonthlyPrice,
    category: ADD_ON_CATEGORY_BY_CODE[bundle.code] ?? "Platform",
    includedInTiers: tiersIncluding(bundle.code),
    featureCount: bundle.features.length,
  };
}

/** Paid add-ons only. Free "core" bundles ship with every plan and are not sold. */
export const MARKETING_ADD_ONS: MarketingAddOn[] = FEATURE_BUNDLES.filter(
  (bundle) => bundle.monthlyPrice > 0 || bundle.additionalSiteMonthlyPrice > 0,
).map(toMarketingAddOn);

export function getAddOn(code: string): MarketingAddOn | null {
  return MARKETING_ADD_ONS.find((addOn) => addOn.code === code) ?? null;
}

/**
 * Expand a selection to include everything it depends on, in order and without
 * duplicates. Some add-ons cannot run alone — CRM writes real AR documents, and
 * fiscalisation posts against the ledger — so quoting one without the other
 * publishes a price the platform will not honour at provisioning time.
 */
export function withBundleDependencies(codes: string[]): string[] {
  const resolved: string[] = [];

  const add = (code: string) => {
    if (resolved.includes(code)) return;
    for (const dependency of BUNDLE_DEPENDENCIES[code] ?? []) {
      add(dependency);
    }
    resolved.push(code);
  };

  for (const code of codes) add(code);
  return resolved;
}

export function addOnsByCategory(): Array<{ category: AddOnCategory; addOns: MarketingAddOn[] }> {
  return ADD_ON_CATEGORY_ORDER.map((category) => ({
    category,
    addOns: MARKETING_ADD_ONS.filter((addOn) => addOn.category === category),
  })).filter((group) => group.addOns.length > 0);
}

// ---------------------------------------------------------------------------
// Quote maths
// ---------------------------------------------------------------------------

export type QuoteInput = {
  tierCode: string;
  addOnCodes: string[];
  sites: number;
  users: number;
  /** Defaults to annual, which is the ask. Monthly is the fallback. */
  period?: BillingPeriod;
};

export type QuoteLine = {
  label: string;
  detail: string;
  monthly: number;
};

export type Quote = {
  tier: MarketingTier;
  lines: QuoteLine[];
  monthlyTotal: number;
  /** What the same configuration costs per month when billed annually. */
  annualMonthlyTotal: number;
  annualSavings: number;
  /** One-off setup, charged once and never folded into the subscription. */
  onboardingFee: number;
  period: BillingPeriod;
};

/**
 * Add-ons already bundled into the tier are free. Everything else bills at its
 * base price plus a per-site rate for each site beyond the first. Add-ons that
 * cannot run without another add-on pull it into the quote, so the total is one
 * the platform can actually provision.
 */
export function buildQuote(input: QuoteInput): Quote {
  const tierDefinition = getTierDefinition(input.tierCode) ?? TIERS[0];
  const tier = toMarketingTier(tierDefinition);
  const period = input.period ?? DEFAULT_BILLING_PERIOD;
  const sites = Math.max(1, Math.floor(input.sites));
  const users = Math.max(1, Math.floor(input.users));
  const lines: QuoteLine[] = [];

  const basePrice = tierPriceFor(tier, period);
  lines.push({
    label: `${tier.name} plan`,
    detail: `${tier.includedSites} ${tier.includedSites === 1 ? "site" : "sites"} included`,
    monthly: basePrice,
  });

  const extraSites = Math.max(0, sites - tier.includedSites);
  if (extraSites > 0) {
    lines.push({
      label: "Additional sites",
      detail: `${extraSites} x ${formatUsd(tier.additionalSiteMonthlyPrice)}`,
      monthly: extraSites * tier.additionalSiteMonthlyPrice,
    });
  }

  if (tier.includedUsers !== null && users > tier.includedUsers) {
    const packs = Math.ceil((users - tier.includedUsers) / USER_PACK_SIZE);
    const packPrice = tierDefinition.additionalUserPackMonthlyPrice;
    if (packs > 0 && packPrice > 0) {
      lines.push({
        label: "Additional user packs",
        detail: `${packs} x ${USER_PACK_SIZE} seats at ${formatUsd(packPrice)}`,
        monthly: packs * packPrice,
      });
    }
  }

  for (const code of withBundleDependencies(input.addOnCodes)) {
    const addOn = getAddOn(code);
    if (!addOn) continue;
    if (addOn.includedInTiers.includes(tier.code)) {
      lines.push({
        label: addOn.name,
        detail: `Included in ${tier.name}`,
        monthly: 0,
      });
      continue;
    }

    const perSite = extraSitesForAddOn(sites) * addOn.additionalSiteMonthlyPrice;
    lines.push({
      label: addOn.name,
      detail:
        perSite > 0
          ? `${formatUsd(addOn.monthlyPrice)} + ${formatUsd(addOn.additionalSiteMonthlyPrice)}/extra site`
          : `${formatUsd(addOn.monthlyPrice)} base`,
      monthly: addOn.monthlyPrice + perSite,
    });
  }

  const monthlyTotal = lines.reduce((sum, line) => sum + line.monthly, 0);
  const annualDelta = tier.monthlyPrice - tier.annualMonthlyPrice;
  const annualMonthlyTotal =
    period === "annual" ? monthlyTotal : Math.max(0, monthlyTotal - annualDelta);

  return {
    tier,
    lines,
    monthlyTotal,
    annualMonthlyTotal,
    annualSavings: (monthlyTotal - annualMonthlyTotal) * 12,
    onboardingFee: tier.onboardingFee,
    period,
  };
}

function extraSitesForAddOn(sites: number): number {
  return Math.max(0, sites - 1);
}

/**
 * Cheapest published monthly price that can run a given set of add-ons.
 *
 * The ladder is no longer strictly cumulative — Fiscal is the cheapest tier but
 * carries no retail or CRM, and Gold Edition sits above Scale without carrying
 * what Scale does — so the cheapest route to a given set of add-ons is not
 * always the entry tier. This takes the lowest total across every tier: its
 * price plus whatever it does not already bundle.
 */
export function startingPriceFor(addOnCodes: string[]): number {
  const required = withBundleDependencies(addOnCodes);

  return Math.min(
    ...TIERS.map((tier) => {
      const billable = required
        .filter((code) => !tier.includedBundles.includes(code))
        .reduce((sum, code) => sum + (getBundleDefinition(code)?.monthlyPrice ?? 0), 0);

      return tier.monthlyPrice + billable;
    }),
  );
}

// ---------------------------------------------------------------------------
// Product catalog — each product carries its own commercial shape
// ---------------------------------------------------------------------------

export type ProductPricingModel = "subscription" | "bespoke";

export type ProductCommercials = {
  /** Matches the `slug` of the matching entry in `solutionPages`. */
  slug: string;
  pricingModel: ProductPricingModel;
  /** Add-ons required to run this product at all. */
  requiredAddOnCodes: string[];
  /** Add-ons most customers in this vertical buy alongside. */
  recommendedAddOnCodes: string[];
  recommendedTierCode: string;
  /** Where this product's pricing lives — bespoke products get their own page. */
  pricingHref: string;
};

/**
 * One entry per segment page under `/home/solutions`, keyed by the same slug.
 *
 * Every subscription segment sits on the same plan ladder — the segment only
 * decides which industry pack is switched on first. Schools are the exception:
 * they buy per term against enrolment, so they carry `bespoke` and route to
 * their own page.
 */
export const PRODUCT_COMMERCIALS: ProductCommercials[] = [
  {
    slug: "sellers",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_RETAIL_SUITE"],
    recommendedAddOnCodes: ["ADDON_RETAIL_SUITE", "ADDON_ACCOUNTING_CORE", "ADDON_ZIMRA_FISCAL"],
    recommendedTierCode: "GROW",
    pricingHref: "/home/pricing",
  },
  {
    slug: "service-providers",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_CRM_SUITE"],
    recommendedAddOnCodes: ["ADDON_CRM_SUITE", "ADDON_ACCOUNTING_CORE", "ADDON_PORTAL_SUITE"],
    recommendedTierCode: "SCALE",
    pricingHref: "/home/pricing",
  },
  {
    // Job cards, parts issue and service history — the maintenance suite. The
    // dropped auto-sales pack (vehicle inventory, leads, deals, financing) was
    // never what this page sold.
    slug: "workshops",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_MAINTENANCE_PRO"],
    recommendedAddOnCodes: [
      "ADDON_MAINTENANCE_PRO",
      "ADDON_ACCOUNTING_CORE",
      "ADDON_ZIMRA_FISCAL",
    ],
    recommendedTierCode: "GROW",
    pricingHref: "/home/pricing",
  },
  {
    slug: "manufacturers",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_MAINTENANCE_PRO"],
    recommendedAddOnCodes: [
      "ADDON_MAINTENANCE_PRO",
      "ADDON_ACCOUNTING_CORE",
      "ADDON_ANALYTICS_PRO",
    ],
    recommendedTierCode: "SCALE",
    pricingHref: "/home/pricing",
  },
  {
    slug: "sales-teams",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_CRM_SUITE"],
    recommendedAddOnCodes: ["ADDON_CRM_SUITE", "ADDON_ANALYTICS_PRO", "ADDON_PORTAL_SUITE"],
    recommendedTierCode: "SCALE",
    pricingHref: "/home/pricing",
  },
  {
    slug: "schools",
    pricingModel: "bespoke",
    requiredAddOnCodes: ["ADDON_SCHOOLS_SUITE"],
    recommendedAddOnCodes: ["ADDON_SCHOOLS_SUITE", "ADDON_ACCOUNTING_CORE", "ADDON_PORTAL_SUITE"],
    recommendedTierCode: "GROW",
    pricingHref: "/home/schools",
  },
];

export function getProductCommercials(slug: string): ProductCommercials | null {
  return PRODUCT_COMMERCIALS.find((product) => product.slug === slug) ?? null;
}

export type ProductPricing = {
  pricingModel: ProductPricingModel;
  pricingHref: string;
  /** Cheapest monthly price that runs this product, or null for bespoke products. */
  startingMonthly: number | null;
  /** What the typical customer in this vertical pays per month. */
  typicalMonthly: number | null;
  /** The same typical configuration on the annual ask, which is what we lead with. */
  typicalAnnualMonthly: number | null;
  /** One-off onboarding on the recommended tier. Zero on the self-serve tiers. */
  onboardingFee: number;
  entryTierName: string;
  recommendedTierName: string;
  requiredAddOns: MarketingAddOn[];
  recommendedAddOns: MarketingAddOn[];
};

export function getProductPricing(slug: string): ProductPricing | null {
  const product = getProductCommercials(slug);
  if (!product) return null;

  const recommendedTier =
    getTierDefinition(product.recommendedTierCode) ?? TIERS[Math.min(1, TIERS.length - 1)];

  const typicalAddOns = withBundleDependencies(product.recommendedAddOnCodes)
    .filter((code) => !recommendedTier.includedBundles.includes(code))
    .reduce((sum, code) => sum + (getBundleDefinition(code)?.monthlyPrice ?? 0), 0);

  const bespoke = product.pricingModel === "bespoke";
  const typicalMonthly = recommendedTier.monthlyPrice + typicalAddOns;

  return {
    pricingModel: product.pricingModel,
    pricingHref: product.pricingHref,
    startingMonthly: bespoke ? null : startingPriceFor(product.requiredAddOnCodes),
    typicalMonthly: bespoke ? null : typicalMonthly,
    typicalAnnualMonthly: bespoke
      ? null
      : Math.round(typicalMonthly * (1 - ANNUAL_DISCOUNT_RATE)),
    onboardingFee: recommendedTier.onboardingFee,
    entryTierName: TIERS[0].name,
    recommendedTierName: recommendedTier.name,
    requiredAddOns: product.requiredAddOnCodes.map(getAddOn).filter(Boolean) as MarketingAddOn[],
    recommendedAddOns: product.recommendedAddOnCodes.map(getAddOn).filter(Boolean) as MarketingAddOn[],
  };
}

/**
 * Short price label for cards and grids, e.g. "From $68/mo" or "Priced per
 * term". Returns null when the slug has no commercial entry.
 */
export function productPriceLabel(slug: string): string | null {
  const pricing = getProductPricing(slug);
  if (!pricing) return null;

  if (pricing.pricingModel === "bespoke") {
    return `From ${formatUsd(SCHOOL_STARTING_TERM_PRICE)}/term`;
  }

  return `From ${formatUsd(pricing.startingMonthly ?? 0)}/mo`;
}

// ---------------------------------------------------------------------------
// Schools — bespoke, priced per term against enrolment
// ---------------------------------------------------------------------------

/**
 * Left as it stands by the tier restructure. Schools are sold per term per
 * campus against enrolment, which is how a school's money actually arrives, so
 * these bands are deliberately not re-derived from `TIERS`. Reconciling them
 * with the new ladder is PR-4.2's job (see `docs/rollout/campus-alignment.md`);
 * the recommendation on the table there is that they survive as a vertical
 * pricing model rather than collapse into it.
 */
export type SchoolPricingBand = {
  code: string;
  name: string;
  /** Upper enrolment bound, or null for the custom band. */
  maxStudents: number | null;
  /** Price per term per campus, or null when the band is quoted. */
  termPrice: number | null;
  summary: string;
  includes: string[];
  isMostPopular: boolean;
};

export const SCHOOL_PRICING_BANDS: SchoolPricingBand[] = [
  {
    code: "COMMUNITY",
    name: "Community",
    maxStudents: 300,
    termPrice: 249,
    summary: "For primary schools and small campuses getting admin off paper.",
    includes: [
      "Admissions and student directory",
      "Attendance registers",
      "Fees, invoicing, and receipts",
      "Teacher and class management",
      "Unlimited staff accounts",
      "WhatsApp support",
    ],
    isMostPopular: false,
  },
  {
    code: "STANDARD",
    name: "Standard",
    maxStudents: 800,
    termPrice: 549,
    summary: "For established day schools that need parents in the loop.",
    includes: [
      "Everything in Community",
      "Results, assessments, and report cards",
      "Parent portal and student portal",
      "Fee arrears tracking and statements",
      "Term and year reporting",
      "Email + WhatsApp support",
    ],
    isMostPopular: true,
  },
  {
    code: "PREMIER",
    name: "Premier",
    maxStudents: 1500,
    termPrice: 949,
    summary: "For boarding schools and large campuses with full finance needs.",
    includes: [
      "Everything in Standard",
      "Boarding, hostels, beds, and leave",
      "Teacher portal and results moderation",
      "Accounting, AR/AP, and banking",
      "Custom branding and school domain",
      "Priority support",
    ],
    isMostPopular: false,
  },
  {
    code: "GROUP",
    name: "Group",
    maxStudents: null,
    termPrice: null,
    summary: "For school groups, trusts, and campuses over 1,500 students.",
    includes: [
      "Everything in Premier",
      "Multi-campus consolidation and reporting",
      "Group-level finance and governance",
      "Data migration from your current system",
      "Onboarding and staff training on site",
      "Named account manager",
    ],
    isMostPopular: false,
  },
];

/**
 * Indicative per-student, per-term rate used to frame a Group quote. It sits
 * below the effective rate of the top priced band so that growing past Premier
 * never costs a school more per student than staying inside it.
 */
export const SCHOOL_GROUP_INDICATIVE_PER_STUDENT_PER_TERM = 0.55;

export type SchoolAddOn = {
  name: string;
  termPrice: number;
  description: string;
};

export const SCHOOL_ADD_ONS: SchoolAddOn[] = [
  {
    name: "Transport & routes",
    termPrice: 79,
    description: "Bus routes, stops, rider registers, and transport billing.",
  },
  {
    name: "ZIMRA fiscalisation",
    termPrice: 49,
    description: "Fiscal receipts for school fees, tuck shop, and uniform sales.",
  },
  {
    name: "Custom branding & domain",
    termPrice: 79,
    description: "Your crest, colours, and portal on your own school domain.",
  },
  {
    name: "Data migration",
    termPrice: 199,
    description: "One-off. We import your existing student, fee, and staff records.",
  },
];

export function schoolBandForEnrolment(students: number): SchoolPricingBand {
  return (
    SCHOOL_PRICING_BANDS.find((band) => band.maxStudents !== null && students <= band.maxStudents) ??
    SCHOOL_PRICING_BANDS[SCHOOL_PRICING_BANDS.length - 1]
  );
}

export type SchoolQuote = {
  band: SchoolPricingBand;
  students: number;
  termTotal: number | null;
  monthlyEquivalent: number | null;
  perStudentPerTerm: number | null;
  isCustom: boolean;
};

export function buildSchoolQuote(students: number): SchoolQuote {
  const enrolment = Math.max(1, Math.floor(students));
  const band = schoolBandForEnrolment(enrolment);

  if (band.termPrice === null || band.maxStudents === null) {
    return {
      band,
      students: enrolment,
      termTotal: null,
      monthlyEquivalent: null,
      perStudentPerTerm: null,
      isCustom: true,
    };
  }

  // Bands are flat: enrolment always falls inside the band that covers it, so a
  // school never pays a surcharge for growing within its band.
  const termTotal = band.termPrice;

  return {
    band,
    students: enrolment,
    termTotal,
    monthlyEquivalent: termTotal / MONTHS_PER_TERM,
    perStudentPerTerm: termTotal / enrolment,
    isCustom: false,
  };
}

export const SCHOOL_STARTING_TERM_PRICE = Math.min(
  ...SCHOOL_PRICING_BANDS.filter((band) => band.termPrice !== null).map(
    (band) => band.termPrice as number,
  ),
);

// ---------------------------------------------------------------------------
// Competitive positioning
// ---------------------------------------------------------------------------

/**
 * Total cost of ownership at a realistic SMB shape: 15 staff, 3 sites. The
 * Corelith column is computed; competitor columns are researched list prices and
 * are labelled as estimates on the page.
 */
export const TCO_TEAM_SIZE = 15;
export const TCO_SITE_COUNT = 3;

export type TcoRow = {
  label: string;
  corelith: string;
  perSeatSuite: string;
  legacyDesktop: string;
  spreadsheets: string;
};

/** Grow is the tier that covers this shape: three sites, twenty seats. */
const tcoTier = MARKETING_TIERS.find((tier) => tier.code === "GROW") ?? POPULAR_TIER;

export const TCO_ROWS: TcoRow[] = [
  {
    label: "Pricing model",
    corelith: "Per site, not per seat",
    perSeatSuite: "Per user, per month",
    legacyDesktop: "Per-seat licence + annual renewal",
    spreadsheets: "Free, until something breaks",
  },
  {
    label: `Monthly cost, ${TCO_TEAM_SIZE} staff`,
    corelith: `${formatUsd(tcoTier.annualMonthlyPrice)} billed annually`,
    perSeatSuite: `${formatUsd(25 * TCO_TEAM_SIZE)} – ${formatUsd(38 * TCO_TEAM_SIZE)}`,
    legacyDesktop: "Quoted per seat",
    spreadsheets: "$0",
  },
  {
    label: "Cost of adding a clerk",
    corelith: "$0 until your seat ceiling",
    perSeatSuite: "$25 – $38 every month",
    legacyDesktop: "New licence",
    spreadsheets: "$0",
  },
  {
    label: "Implementation fee",
    corelith: `${formatUsd(tcoTier.onboardingFee)} one-off, published before you buy`,
    perSeatSuite: "Partner-led, often five figures",
    legacyDesktop: "Consultant install",
    spreadsheets: "None",
  },
  {
    label: "Works with no internet",
    corelith: "Yes, offline-first with sync",
    perSeatSuite: "No",
    legacyDesktop: "On-premise only",
    spreadsheets: "Local file only",
  },
  {
    label: "ZIMRA fiscalisation",
    corelith: "Built in",
    perSeatSuite: "Third-party connector",
    legacyDesktop: "Add-on module",
    spreadsheets: "Manual",
  },
  {
    label: "Industry workflows ready",
    corelith: "Selling, service, workshop, production",
    perSeatSuite: "Generic — built per project",
    legacyDesktop: "Accounting-first",
    spreadsheets: "Whatever you build",
  },
  {
    label: "Runs on a phone",
    corelith: "Yes, mobile-first",
    perSeatSuite: "Companion app",
    legacyDesktop: "Desktop only",
    spreadsheets: "Painfully",
  },
];

export type Differentiator = {
  title: string;
  copy: string;
};

export const COMPETITIVE_EDGE: Differentiator[] = [
  {
    title: "Adding staff costs you nothing",
    copy: `${tcoTier.name} covers ${tcoTier.includedUsers} people across ${tcoTier.includedSites} sites for ${formatUsd(tcoTier.annualMonthlyPrice)} a month paid annually. Per-seat suites charge $25 to $38 for every person you add, every month, which is why owners quietly keep half the team off the system and lose the trail.`,
  },
  {
    title: "It works when the internet does not",
    copy: "Sales, stock moves and attendance carry on offline and sync the moment the line comes back. Load-shedding stops the lights, not the shop.",
  },
  {
    title: "Your trade is built before you arrive",
    copy: "Selling, service, workshop, production and sales workflows are configured already. You are not paying anyone to find out whether a generic system can be bent into your business.",
  },
  {
    title: "ZIMRA is handled inside the product",
    copy: "Fiscalisation, USD and ZWG side by side, and the reports your accountant asks for are part of the software rather than a connector you have to keep alive.",
  },
  {
    title: "Start with the one thing bleeding this month",
    copy: "Switch on the part that is costing you money now and add the rest when it earns its place. There is no big-bang rollout to survive.",
  },
  {
    title: "Priced for a Zimbabwean business",
    copy: `Plans start at ${formatUsd(STARTING_ANNUAL_MONTHLY_PRICE)} a month paid annually, which is ${ANNUAL_DISCOUNT_LABEL} the monthly rate of ${formatUsd(STARTING_MONTHLY_PRICE)}. Onboarding is a published one-off fee — nothing on the two self-serve plans — so the setup work is visible instead of buried in your subscription forever.`,
  },
];

// ---------------------------------------------------------------------------
// Comparison table rows (derived)
// ---------------------------------------------------------------------------

export type ComparisonRow = {
  label: string;
  values: string[];
};

function tierValue(pick: (tier: MarketingTier, definition: TierDefinition) => string): string[] {
  return MARKETING_TIERS.map((tier) => {
    const definition = getTierDefinition(tier.code) as TierDefinition;
    return pick(tier, definition);
  });
}

function bundleRow(label: string, code: string): ComparisonRow {
  return {
    label,
    values: tierValue((tier) =>
      tier.includedBundleCodes.includes(code)
        ? "Included"
        : `+${formatUsd(getBundleDefinition(code)?.monthlyPrice ?? 0)}/mo`,
    ),
  };
}

/** For the free core bundles, which are either in the plan or they are not. */
function presenceRow(label: string, code: string): ComparisonRow {
  return {
    label,
    values: tierValue((tier) => (tier.includedBundleCodes.includes(code) ? "Included" : "—")),
  };
}

export const TIER_COMPARISON_ROWS: ComparisonRow[] = [
  // Annual first: it is the ask, and the monthly rate is the fallback.
  {
    label: `Billed annually (${ANNUAL_DISCOUNT_LABEL})`,
    values: tierValue((tier) => `${tier.pricePrefix}${formatUsd(tier.annualMonthlyPrice)}/mo`),
  },
  {
    label: "Billed monthly",
    values: tierValue((tier) => `${tier.pricePrefix}${formatUsd(tier.monthlyPrice)}/mo`),
  },
  {
    label: "Onboarding, one-off",
    values: tierValue((tier) =>
      tier.isQuoted ? "Scoped with you" : tier.onboardingFee > 0 ? formatUsd(tier.onboardingFee) : "None",
    ),
  },
  { label: "Sites included", values: tierValue((tier) => String(tier.includedSites)) },
  {
    label: "Each extra site",
    values: tierValue((tier) =>
      tier.additionalSiteMonthlyPrice > 0 ? `${formatUsd(tier.additionalSiteMonthlyPrice)}/mo` : "Included",
    ),
  },
  {
    label: "Users included",
    values: tierValue((tier) => (tier.includedUsers === null ? "Unlimited" : String(tier.includedUsers))),
  },
  presenceRow("Stock, movements & receiving", "ADDON_STORES_CORE"),
  { label: "Offline mode", values: tierValue(() => "Included") },
  { label: "Mobile & web access", values: tierValue(() => "Included") },
  bundleRow("User management & roles", "ADDON_USER_MANAGEMENT_PRO"),
  bundleRow("Advanced reports & audit trails", "ADDON_ANALYTICS_PRO"),
  bundleRow("Accounting core", "ADDON_ACCOUNTING_CORE"),
  bundleRow("Maintenance & work orders", "ADDON_MAINTENANCE_PRO"),
  bundleRow("Customer & staff portals", "ADDON_PORTAL_SUITE"),
  bundleRow("Advanced accounting (AR/AP, banking)", "ADDON_ACCOUNTING_ADVANCED"),
  bundleRow("Compliance & permits", "ADDON_COMPLIANCE_PRO"),
  bundleRow("Advanced payroll", "ADDON_ADVANCED_PAYROLL"),
  bundleRow("ZIMRA fiscalisation", "ADDON_ZIMRA_FISCAL"),
  bundleRow("Retail till & catalog", "ADDON_RETAIL_SUITE"),
  bundleRow("Gold operations & controls", "ADDON_GOLD_CORE"),
  bundleRow("Custom branding & domain", "ADDON_CUSTOM_BRANDING"),
  // Derived from the tier copy so the column count can never drift from the
  // ladder again.
  { label: "Support", values: tierValue((tier) => tier.support) },
];

// ---------------------------------------------------------------------------
// Trial & guarantees — referenced across the site and in structured data
// ---------------------------------------------------------------------------

export const TRIAL_DAYS = 14;
export const MONEY_BACK_DAYS = 30;
