/**
 * Marketing pricing — single source of truth.
 *
 * Every price the public site shows is DERIVED from the billing catalog in
 * `lib/platform/feature-catalog.ts`. Nothing here hardcodes a dollar figure that
 * also lives in the catalog, so the pricing page and the invoice can never
 * disagree. If you need to change a price, change it in the catalog.
 *
 * The one exception is `SCHOOL_PRICING_BANDS`: schools are sold per term against
 * enrolment bands rather than per month, so that ladder is defined here and
 * reconciled back to `ADDON_SCHOOLS_SUITE` by the tests in `pricing.test.ts`.
 */

import {
  ANNUAL_BILLING_MONTHS,
  FEATURE_BUNDLES,
  TIERS,
  USER_PACK_SIZE,
  getBundleDefinition,
  getTierDefinition,
  type FeatureBundleDefinition,
  type TierDefinition,
} from "@/lib/platform/feature-catalog";

export { ANNUAL_BILLING_MONTHS, USER_PACK_SIZE };

/** Terms in a Zimbabwean school year — schools budget per term, not per month. */
export const TERMS_PER_YEAR = 3;
export const MONTHS_PER_TERM = 12 / TERMS_PER_YEAR;

export type BillingPeriod = "monthly" | "annual";

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
  includedSites: number;
  additionalSiteMonthlyPrice: number;
  includedUsers: number | null;
  bestFor: string;
  /** Everyday framing of the price, e.g. "less than a tank of fuel". */
  costAnchor: string;
  highlights: string[];
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
  isMostPopular?: boolean;
  ctaLabel: string;
  ctaHref: string;
};

const TIER_COPY: Record<string, TierCopy> = {
  BASIC: {
    tagline: "Get organised",
    bestFor: "One shop, yard, or office replacing notebooks.",
    costAnchor: "About a dollar a day",
    highlights: [
      "Stock, movements, and receiving",
      "Employee directory and daily operations",
      "Offline mode on every device",
      "WhatsApp support",
    ],
    ctaLabel: "Start free trial",
    ctaHref: "/home/book-demo?plan=launch",
  },
  STANDARD: {
    tagline: "Bring branches together",
    bestFor: "Growing teams running two to three locations.",
    costAnchor: "Less than one stock-count mistake a month",
    highlights: [
      "Everything in Launch",
      "User management and role controls",
      "Advanced reports and audit trails",
      "Push notifications and stock alerts",
      "Email + WhatsApp support",
    ],
    isMostPopular: true,
    ctaLabel: "Start free trial",
    ctaHref: "/home/book-demo?plan=grow",
  },
  MEDIUM: {
    tagline: "Run the whole group",
    bestFor: "Multi-branch groups that need finance and assets connected.",
    costAnchor: "Less than a junior clerk's salary",
    highlights: [
      "Everything in Grow",
      "Accounting core, journals, and statements",
      "Maintenance, work orders, and PM schedules",
      "Customer and staff portals",
      "Priority support",
    ],
    ctaLabel: "Start free trial",
    ctaHref: "/home/book-demo?plan=scale",
  },
  ENTERPRISE: {
    tagline: "Govern at scale",
    bestFor: "Established groups with compliance and audit obligations.",
    costAnchor: "Priced against the cost of one bad audit",
    highlights: [
      "Everything in Scale",
      "AR/AP, banking, fixed assets, multi-currency",
      "Compliance, permits, inspections, and training",
      "Advanced payroll and disbursements",
      "ZIMRA fiscalisation and custom branding",
      "Unlimited users, named account manager",
    ],
    ctaLabel: "Talk to sales",
    ctaHref: "/home/book-demo?plan=enterprise",
  },
};

function bundleValue(codes: string[]): number {
  return codes.reduce((sum, code) => sum + (getBundleDefinition(code)?.monthlyPrice ?? 0), 0);
}

function toMarketingTier(tier: TierDefinition): MarketingTier {
  const copy = TIER_COPY[tier.code];

  if (!copy) {
    throw new Error(`Missing marketing copy for tier ${tier.code}`);
  }

  return {
    code: tier.code,
    name: tier.name,
    tagline: copy.tagline,
    description: tier.description,
    monthlyPrice: tier.monthlyPrice,
    annualMonthlyPrice: tier.annualMonthlyPrice,
    annualSavings: tier.monthlyPrice * 12 - tier.annualMonthlyPrice * 12,
    includedSites: tier.includedSites,
    additionalSiteMonthlyPrice: tier.additionalSiteMonthlyPrice,
    includedUsers: tier.includedUsers,
    bestFor: copy.bestFor,
    costAnchor: copy.costAnchor,
    highlights: copy.highlights,
    includedBundleCodes: tier.includedBundles,
    bundledAddOnValue: bundleValue(tier.includedBundles),
    isMostPopular: copy.isMostPopular ?? false,
    ctaLabel: copy.ctaLabel,
    ctaHref: copy.ctaHref,
  };
}

export const MARKETING_TIERS: MarketingTier[] = TIERS.map(toMarketingTier);

export const ENTRY_TIER = MARKETING_TIERS[0];
export const POPULAR_TIER =
  MARKETING_TIERS.find((tier) => tier.isMostPopular) ?? MARKETING_TIERS[1] ?? ENTRY_TIER;

/** Lowest published monthly price — used in hero copy and meta descriptions. */
export const STARTING_MONTHLY_PRICE = Math.min(...MARKETING_TIERS.map((tier) => tier.monthlyPrice));

export function tierPriceFor(tier: MarketingTier, period: BillingPeriod): number {
  return period === "annual" ? tier.annualMonthlyPrice : tier.monthlyPrice;
}

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

export type AddOnCategory =
  | "Industry"
  | "Finance"
  | "Workforce"
  | "Assets & Safety"
  | "Security"
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
  ADDON_SCRAP_METAL_SUITE: "Industry",
  ADDON_RETAIL_SUITE: "Industry",
  ADDON_AUTOS_SUITE: "Industry",
  ADDON_SCHOOLS_SUITE: "Industry",
  ADDON_ACCOUNTING_CORE: "Finance",
  ADDON_ACCOUNTING_ADVANCED: "Finance",
  ADDON_ZIMRA_FISCAL: "Finance",
  ADDON_ADVANCED_PAYROLL: "Workforce",
  ADDON_USER_MANAGEMENT_PRO: "Workforce",
  ADDON_MAINTENANCE_PRO: "Assets & Safety",
  ADDON_COMPLIANCE_PRO: "Assets & Safety",
  ADDON_CCTV_SUITE: "Security",
  ADDON_ANALYTICS_PRO: "Platform",
  ADDON_CUSTOM_BRANDING: "Platform",
  ADDON_PORTAL_SUITE: "Platform",
};

export const ADD_ON_CATEGORY_ORDER: AddOnCategory[] = [
  "Industry",
  "Finance",
  "Workforce",
  "Assets & Safety",
  "Security",
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
  period: BillingPeriod;
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
};

/**
 * Add-ons already bundled into the tier are free. Everything else bills at its
 * base price plus a per-site rate for each site beyond the first.
 */
export function buildQuote(input: QuoteInput): Quote {
  const tierDefinition = getTierDefinition(input.tierCode) ?? TIERS[0];
  const tier = toMarketingTier(tierDefinition);
  const sites = Math.max(1, Math.floor(input.sites));
  const users = Math.max(1, Math.floor(input.users));
  const lines: QuoteLine[] = [];

  const basePrice = tierPriceFor(tier, input.period);
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

  for (const code of input.addOnCodes) {
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
    input.period === "annual" ? monthlyTotal : Math.max(0, monthlyTotal - annualDelta);

  return {
    tier,
    lines,
    monthlyTotal,
    annualMonthlyTotal,
    annualSavings: (monthlyTotal - annualMonthlyTotal) * 12,
  };
}

function extraSitesForAddOn(sites: number): number {
  return Math.max(0, sites - 1);
}

/**
 * Cheapest published monthly price that can run a given set of add-ons: the
 * entry tier plus every add-on it does not already bundle.
 */
export function startingPriceFor(addOnCodes: string[]): number {
  const entry = TIERS[0];
  const billable = addOnCodes
    .filter((code) => !entry.includedBundles.includes(code))
    .reduce((sum, code) => sum + (getBundleDefinition(code)?.monthlyPrice ?? 0), 0);

  return entry.monthlyPrice + billable;
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

export const PRODUCT_COMMERCIALS: ProductCommercials[] = [
  {
    slug: "gold-operations",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_GOLD_CORE"],
    recommendedAddOnCodes: ["ADDON_GOLD_CORE", "ADDON_GOLD_ADVANCED", "ADDON_ACCOUNTING_CORE"],
    recommendedTierCode: "MEDIUM",
    pricingHref: "/home/pricing",
  },
  {
    slug: "schools",
    pricingModel: "bespoke",
    requiredAddOnCodes: ["ADDON_SCHOOLS_SUITE"],
    recommendedAddOnCodes: ["ADDON_SCHOOLS_SUITE", "ADDON_ACCOUNTING_CORE"],
    recommendedTierCode: "STANDARD",
    pricingHref: "/home/pricing/schools",
  },
  {
    slug: "retail-pos",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_RETAIL_SUITE"],
    recommendedAddOnCodes: ["ADDON_RETAIL_SUITE", "ADDON_ACCOUNTING_CORE", "ADDON_ZIMRA_FISCAL"],
    recommendedTierCode: "STANDARD",
    pricingHref: "/home/pricing",
  },
  {
    slug: "scrap-recycling",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_SCRAP_METAL_SUITE"],
    recommendedAddOnCodes: ["ADDON_SCRAP_METAL_SUITE", "ADDON_ACCOUNTING_CORE"],
    recommendedTierCode: "STANDARD",
    pricingHref: "/home/pricing",
  },
  {
    slug: "auto-sales",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_AUTOS_SUITE"],
    recommendedAddOnCodes: ["ADDON_AUTOS_SUITE", "ADDON_PORTAL_SUITE"],
    recommendedTierCode: "STANDARD",
    pricingHref: "/home/pricing",
  },
  {
    slug: "thrift-operations",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_RETAIL_SUITE"],
    recommendedAddOnCodes: ["ADDON_RETAIL_SUITE"],
    recommendedTierCode: "STANDARD",
    pricingHref: "/home/pricing",
  },
  {
    slug: "stores-inventory",
    pricingModel: "subscription",
    requiredAddOnCodes: [],
    recommendedAddOnCodes: ["ADDON_ANALYTICS_PRO"],
    recommendedTierCode: "STANDARD",
    pricingHref: "/home/pricing",
  },
  {
    slug: "human-resources-payroll",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_ADVANCED_PAYROLL"],
    recommendedAddOnCodes: ["ADDON_ADVANCED_PAYROLL", "ADDON_USER_MANAGEMENT_PRO"],
    recommendedTierCode: "STANDARD",
    pricingHref: "/home/pricing",
  },
  {
    slug: "maintenance",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_MAINTENANCE_PRO"],
    recommendedAddOnCodes: ["ADDON_MAINTENANCE_PRO", "ADDON_ANALYTICS_PRO"],
    recommendedTierCode: "MEDIUM",
    pricingHref: "/home/pricing",
  },
  {
    slug: "compliance",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_COMPLIANCE_PRO"],
    recommendedAddOnCodes: ["ADDON_COMPLIANCE_PRO"],
    recommendedTierCode: "MEDIUM",
    pricingHref: "/home/pricing",
  },
  {
    slug: "cctv-surveillance",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_CCTV_SUITE"],
    recommendedAddOnCodes: ["ADDON_CCTV_SUITE"],
    recommendedTierCode: "MEDIUM",
    pricingHref: "/home/pricing",
  },
  {
    slug: "multi-site-operations",
    pricingModel: "subscription",
    requiredAddOnCodes: ["ADDON_USER_MANAGEMENT_PRO"],
    recommendedAddOnCodes: ["ADDON_USER_MANAGEMENT_PRO", "ADDON_ANALYTICS_PRO", "ADDON_CCTV_SUITE"],
    recommendedTierCode: "MEDIUM",
    pricingHref: "/home/pricing",
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

  const typicalAddOns = product.recommendedAddOnCodes
    .filter((code) => !recommendedTier.includedBundles.includes(code))
    .reduce((sum, code) => sum + (getBundleDefinition(code)?.monthlyPrice ?? 0), 0);

  const bespoke = product.pricingModel === "bespoke";

  return {
    pricingModel: product.pricingModel,
    pricingHref: product.pricingHref,
    startingMonthly: bespoke ? null : startingPriceFor(product.requiredAddOnCodes),
    typicalMonthly: bespoke ? null : recommendedTier.monthlyPrice + typicalAddOns,
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

const tcoTier = MARKETING_TIERS.find((tier) => tier.code === "STANDARD") ?? POPULAR_TIER;

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
    corelith: `${formatUsd(tcoTier.monthlyPrice)}`,
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
    corelith: "None — self-serve setup",
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
    corelith: "Gold, scrap, retail, schools, auto, thrift",
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
    title: "We do not charge per user",
    copy: `Add every cashier, clerk, supervisor, and driver you need. ${tcoTier.name} covers ${tcoTier.includedUsers} people for ${formatUsd(tcoTier.monthlyPrice)} a month. The per-seat suites would charge that for one person.`,
  },
  {
    title: "It works when the internet does not",
    copy: "Capture sales, stock, and attendance offline. Everything syncs the moment you are back online. Load-shedding and dead links stop being your problem.",
  },
  {
    title: "Your industry is already built",
    copy: "Gold, scrap, retail, schools, auto sales, and thrift workflows ship on day one. You are not funding a six-month implementation project to get a working system.",
  },
  {
    title: "Local compliance is not an afterthought",
    copy: "ZIMRA fiscalisation, USD and multi-currency handling, and the reporting your accountant asks for are part of the product, not a bolt-on.",
  },
  {
    title: "Start with one problem, not the whole business",
    copy: "Turn on the module causing you the most pain this month. Add the next one when your team is ready. You are never forced into a big-bang rollout.",
  },
  {
    title: "Priced for a Zimbabwean SME",
    copy: `Plans start at ${formatUsd(STARTING_MONTHLY_PRICE)} a month with a 14-day free trial and no card required. Cancel in one click if it is not earning its keep.`,
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

export const TIER_COMPARISON_ROWS: ComparisonRow[] = [
  { label: "Monthly price", values: tierValue((tier) => `${formatUsd(tier.monthlyPrice)}/mo`) },
  {
    label: "Billed annually",
    values: tierValue((tier) => `${formatUsd(tier.annualMonthlyPrice)}/mo`),
  },
  { label: "Sites included", values: tierValue((tier) => String(tier.includedSites)) },
  {
    label: "Each extra site",
    values: tierValue((tier) => `${formatUsd(tier.additionalSiteMonthlyPrice)}/mo`),
  },
  {
    label: "Users included",
    values: tierValue((tier) => (tier.includedUsers === null ? "Unlimited" : String(tier.includedUsers))),
  },
  {
    label: "Stock, movements & receiving",
    values: tierValue(() => "Included"),
  },
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
  bundleRow("Custom branding & domain", "ADDON_CUSTOM_BRANDING"),
  {
    label: "Support",
    values: ["WhatsApp", "Email + WhatsApp", "Priority", "Priority + account manager"],
  },
];

// ---------------------------------------------------------------------------
// Trial & guarantees — referenced across the site and in structured data
// ---------------------------------------------------------------------------

export const TRIAL_DAYS = 14;
export const MONEY_BACK_DAYS = 30;
