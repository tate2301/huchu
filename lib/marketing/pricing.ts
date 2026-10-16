/**
 * Marketing pricing — what the public site says things cost.
 *
 * There is one rule, and it lives in `lib/platform/verticals.ts`: a workspace
 * pays for each vertical (line of business) it runs, at one rate while it has
 * up to `VERTICAL_RATE.includedMembers` members and a higher one once it has
 * more. Every vertical is charged the same, and the features, add-ons and
 * bundles inside a vertical carry no charge of their own.
 *
 * Nothing here types a dollar figure. Every price is read from `VERTICAL_RATE`
 * or worked out by `verticalCharge`, so the pricing page and the invoice can
 * never disagree. To change a price, change it in `lib/platform/verticals.ts`.
 */

import type { Vertical } from "@prisma/client";

import {
  VERTICALS,
  VERTICAL_ORDER,
  VERTICAL_RATE,
  verticalCharge,
} from "@/lib/platform/verticals";

export function formatUsd(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

// ---------------------------------------------------------------------------
// The rate
// ---------------------------------------------------------------------------

/** A vertical's monthly charge while the workspace has up to `INCLUDED_MEMBERS`. */
export const SMALL_PRICE = VERTICAL_RATE.small;
/** A vertical's monthly charge once the workspace has more members than that. */
export const LARGE_PRICE = VERTICAL_RATE.large;
/** Members a workspace has before every vertical moves to `LARGE_PRICE`. */
export const INCLUDED_MEMBERS = VERTICAL_RATE.includedMembers;

/** Short label for chips and cards, e.g. "From $39 a month". */
export const STARTING_PRICE_LABEL = `From ${formatUsd(SMALL_PRICE)} a month`;

/** The whole rule in one sentence, for meta descriptions and summaries. */
export const PRICE_RULE_COPY = `${formatUsd(SMALL_PRICE)} a month per vertical for up to ${INCLUDED_MEMBERS} people, ${formatUsd(LARGE_PRICE)} a month per vertical above that.`;

export const TRIAL_DAYS = 14;
export const MONEY_BACK_DAYS = 30;

export const LAUNCH_SPRINT_DAYS = 30;
export const LAUNCH_SPRINT_COPY =
  "Launch setup with workflow mapping, migration, training, go-live support, and WhatsApp follow-up";

// ---------------------------------------------------------------------------
// Verticals as the site describes them
// ---------------------------------------------------------------------------

export type MarketingVertical = {
  code: Vertical;
  label: string;
  /** One plain sentence on what the vertical runs. */
  copy: string;
  /** The site page that sells it. */
  href: string;
};

const VERTICAL_COPY: Record<Vertical, Omit<MarketingVertical, "code" | "label">> = {
  GOLD: {
    copy: "Daily mine capture, production, gold custody, settlement and reconciliation.",
    href: "/home/book-demo",
  },
  SCHOOLS: {
    copy: "Admissions, fees, academics, boarding, and the parent and student portals.",
    href: "/home/schools",
  },
  RETAIL: {
    copy: "Till, catalogue, stock, receiving, cash-up and ZIMRA fiscal receipts.",
    href: "/home/solutions/sellers",
  },
  CRM: {
    copy: "Leads, pipeline, site visits, quotes, invoices and commission.",
    href: "/home/solutions/sales-teams",
  },
  WORKSHOP: {
    copy: "Job cards, parts issue, technician hours, service history and invoicing.",
    href: "/home/solutions/workshops",
  },
  PAYROLL: {
    copy: "Employees, pay runs, payslips, statutory tables and the monthly returns.",
    href: "/home/book-demo",
  },
  GENERAL: {
    copy: "Books, stock, people and operating controls for any other business.",
    href: "/home/products",
  },
};

export const MARKETING_VERTICALS: MarketingVertical[] = VERTICAL_ORDER.map((code) => ({
  code,
  label: VERTICALS[code].label,
  ...VERTICAL_COPY[code],
}));

// ---------------------------------------------------------------------------
// Quote maths
// ---------------------------------------------------------------------------

export type QuoteInput = {
  /** The verticals chosen, or just how many. */
  verticals: Vertical[] | number;
  members: number;
};

export type QuoteLine = {
  label: string;
  amount: number;
};

export type Quote = {
  /** Each vertical's monthly charge at this member count. */
  each: number;
  verticals: number;
  members: number;
  /** Over the included members, so every vertical is at `LARGE_PRICE`. */
  over: boolean;
  total: number;
  /** One line per vertical. */
  lines: QuoteLine[];
};

/** What a workspace pays a month, with a line for each vertical. */
export function buildQuote(input: QuoteInput): Quote {
  const labels =
    typeof input.verticals === "number"
      ? Array.from(
          { length: Math.max(0, Math.floor(input.verticals)) },
          (_, index) => `Vertical ${index + 1}`,
        )
      : [...new Set(input.verticals)].map((code) => VERTICALS[code].label);
  const members = Math.max(1, Math.floor(input.members));
  const charge = verticalCharge(labels.length, members);

  return {
    each: charge.each,
    verticals: charge.verticals,
    members: charge.members,
    over: charge.over,
    total: charge.total,
    lines: labels.map((label) => ({ label, amount: charge.each })),
  };
}

/** The worked examples the pricing page prints. */
export const PRICE_EXAMPLES: Quote[] = [
  { verticals: 1, members: 3 },
  { verticals: 1, members: 8 },
  { verticals: 2, members: 4 },
  { verticals: 2, members: 12 },
].map(buildQuote);

// ---------------------------------------------------------------------------
// Products on the site, and the vertical each one is sold as
// ---------------------------------------------------------------------------

export type ProductCommercials = {
  /** The `pricingSlug` of a segment in `app/home/site-data.ts`, or "schools". */
  slug: string;
  vertical: Vertical;
  pricingHref: string;
};

export const PRODUCT_COMMERCIALS: ProductCommercials[] = [
  { slug: "sellers", vertical: "RETAIL", pricingHref: "/home/pricing" },
  { slug: "service-providers", vertical: "CRM", pricingHref: "/home/pricing" },
  { slug: "workshops", vertical: "WORKSHOP", pricingHref: "/home/pricing" },
  { slug: "manufacturers", vertical: "GENERAL", pricingHref: "/home/pricing" },
  { slug: "sales-teams", vertical: "CRM", pricingHref: "/home/pricing" },
  { slug: "schools", vertical: "SCHOOLS", pricingHref: "/home/schools#pricing" },
];

export type ProductPricing = {
  vertical: Vertical;
  verticalLabel: string;
  /** The vertical's monthly charge for a workspace of up to `INCLUDED_MEMBERS`. */
  startingMonthly: number;
  pricingHref: string;
};

export function getProductPricing(slug: string): ProductPricing | null {
  const product = PRODUCT_COMMERCIALS.find((entry) => entry.slug === slug);
  if (!product) return null;

  return {
    vertical: product.vertical,
    verticalLabel: VERTICALS[product.vertical].label,
    startingMonthly: verticalCharge(1, INCLUDED_MEMBERS).total,
    pricingHref: product.pricingHref,
  };
}

/** Short price label for cards, e.g. "From $39 a month". Null for an unknown slug. */
export function productPriceLabel(slug: string): string | null {
  const pricing = getProductPricing(slug);
  return pricing ? `From ${formatUsd(pricing.startingMonthly)} a month` : null;
}

// ---------------------------------------------------------------------------
// Competitive positioning
// ---------------------------------------------------------------------------

/**
 * Cost of ownership at a realistic shape: 15 staff on one vertical. The
 * Corelith column is computed; competitor columns are researched list prices
 * and are labelled as estimates on the page.
 */
export const TCO_TEAM_SIZE = 15;

const tcoCharge = verticalCharge(1, TCO_TEAM_SIZE);

export type TcoRow = {
  label: string;
  corelith: string;
  perSeatSuite: string;
  legacyDesktop: string;
  spreadsheets: string;
};

export const TCO_ROWS: TcoRow[] = [
  {
    label: "Pricing model",
    corelith: "Per vertical, at one of two rates",
    perSeatSuite: "Per user, per month",
    legacyDesktop: "Per-seat licence + annual renewal",
    spreadsheets: "Free, until something breaks",
  },
  {
    label: `Monthly cost, ${TCO_TEAM_SIZE} staff`,
    corelith: formatUsd(tcoCharge.total),
    perSeatSuite: `${formatUsd(25 * TCO_TEAM_SIZE)} – ${formatUsd(38 * TCO_TEAM_SIZE)}`,
    legacyDesktop: "Quoted per seat",
    spreadsheets: "$0",
  },
  {
    label: "Cost of adding a clerk",
    corelith: `$0 once you are past ${INCLUDED_MEMBERS} people`,
    perSeatSuite: "$25 – $38 every month",
    legacyDesktop: "New licence",
    spreadsheets: "$0",
  },
  {
    label: "Add-ons and modules",
    corelith: "Included in the vertical",
    perSeatSuite: "Priced one by one",
    legacyDesktop: "Add-on modules",
    spreadsheets: "Whatever you build",
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
    copy: `Once you are past ${INCLUDED_MEMBERS} people, a vertical is ${formatUsd(LARGE_PRICE)} a month whether you have ${INCLUDED_MEMBERS + 1} people on it or sixty. Per-seat suites charge $25 to $38 for every person you add, every month, which is why owners keep half the team off the system and lose the trail.`,
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
    copy: `${PRICE_RULE_COPY} Every feature and add-on inside a vertical is included, so nothing is sold to you twice.`,
  },
];
