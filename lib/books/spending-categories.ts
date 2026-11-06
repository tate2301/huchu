/**
 * Multi-industry spending categories and subscription/recurring helpers for Books.
 * Covers everyday business spending across retail, agriculture, construction,
 * manufacturing, logistics, hospitality, and services, plus recurring subscriptions.
 */

export const SUBSCRIPTION_CYCLES = ["monthly", "quarterly", "yearly", "weekly"] as const;
export type SubscriptionCycle = (typeof SUBSCRIPTION_CYCLES)[number];

export const SUBSCRIPTION_CYCLE_LABEL: Record<SubscriptionCycle, string> = {
  monthly: "Every month (Monthly)",
  quarterly: "Every 3 months (Quarterly)",
  yearly: "Once a year (Annual)",
  weekly: "Every week (Weekly)",
};

export type SpendingCategoryOption = {
  value: string;
  label: string;
  hint: string;
  isSubscription?: boolean;
};

export type SpendingCategoryGroup = {
  group: string;
  items: SpendingCategoryOption[];
};

export const SPENDING_CATEGORY_GROUPS: SpendingCategoryGroup[] = [
  {
    group: "Subscriptions & recurring services",
    items: [
      { value: "internet-telecoms", label: "Internet, Starlink & phone plans", hint: "Starlink, Liquid Home, TelOne, mobile data", isSubscription: true },
      { value: "software-saas", label: "Software & apps (SaaS)", hint: "Microsoft 365, Google Workspace, accounting/design tools", isSubscription: true },
      { value: "security-tracking", label: "Security, alarms & vehicle tracking", hint: "Safeguard, Fawcett, Cartrack, rapid response", isSubscription: true },
      { value: "insurance-medical", label: "Insurance & medical aid", hint: "Vehicle, business, crop or equipment insurance, Cimas", isSubscription: true },
      { value: "hosting-domains", label: "Website, domain & cloud hosting", hint: "Domain renewals, servers, cloud backups", isSubscription: true },
      { value: "memberships-licences", label: "Trade memberships & recurring licences", hint: "Professional bodies, council or radio licences", isSubscription: true },
    ],
  },
  {
    group: "Rent, utilities & premises",
    items: [
      { value: "rent-lease", label: "Rent & lease", hint: "Shop, office, warehouse, or yard rent" },
      { value: "electricity-zesa", label: "Electricity, ZESA & solar", hint: "Prepaid ZESA tokens, power bill, solar upkeep" },
      { value: "water-rates", label: "Water, council rates & refuse", hint: "City council bill, bulk water delivery, refuse" },
      { value: "generator-power", label: "Generator fuel & backup power", hint: "Diesel/petrol for generator, inverter servicing" },
      { value: "cleaning-upkeep", label: "Cleaning, guards & premises upkeep", hint: "Cleaning supplies, guard services, building repairs" },
    ],
  },
  {
    group: "Stock, materials & trade inputs (Retail, Agri, Construction, Hospitality)",
    items: [
      { value: "stock-for-resale", label: "Stock & goods to resell", hint: "Retail inventory, wholesale goods, beverages, spares" },
      { value: "raw-materials", label: "Raw materials & workshop supplies", hint: "Timber, steel, fabric, paint, consumables for jobs" },
      { value: "agri-inputs", label: "Seeds, fertilizer, feed & farm inputs", hint: "Seed, fertilizer, chemicals, stockfeed, vet medicine" },
      { value: "construction-site", label: "Building, hardware & site materials", hint: "Cement, bricks, aggregates, plumbing, electricals" },
      { value: "hospitality-fb", label: "Food, ingredients & kitchen supplies", hint: "Groceries, meat, fresh produce, catering supplies" },
      { value: "packaging-labels", label: "Packaging, bags, boxes & labels", hint: "Cartons, bottles, wrapping, printed labels" },
      { value: "freight-customs", label: "Freight, courier, shipping & customs", hint: "Transport of stock, ZIMRA duty & clearing agents" },
    ],
  },
  {
    group: "Vehicles, fuel & equipment",
    items: [
      { value: "fuel-oil", label: "Fuel & oil (vehicles & fleet)", hint: "Diesel, petrol, engine oil at service station" },
      { value: "vehicle-repairs", label: "Vehicle service, tyres & licensing", hint: "Mechanic, tyres, battery, ZINARA licence & COF" },
      { value: "transport-tolls", label: "Transport, bus fares & tollgates", hint: "Staff transport, tollgates, local delivery" },
      { value: "tools-equipment", label: "Tools, machinery & equipment", hint: "Workshop tools, spares, machinery parts" },
      { value: "plant-hire", label: "Hire of plant, trucks & equipment", hint: "TLB, scaffolding, generator, or truck hire" },
      { value: "ppe-safety", label: "Workwear, boots & safety gear (PPE)", hint: "Overalls, safety boots, helmets, gloves" },
    ],
  },
  {
    group: "People, subcontractors & field costs",
    items: [
      { value: "subcontractors", label: "Subcontractors & outside trades", hint: "Electrician, fitter, plumber, technician, freelancer" },
      { value: "casual-labour", label: "Casual labour & day wages", hint: "Loading, offloading, piecework, site hands" },
      { value: "meals-subsistence", label: "Meals & field allowances", hint: "Lunch on site, staff tea/bread, travel allowance" },
      { value: "travel-accommodation", label: "Travel & overnight accommodation", hint: "Lodge, hotel, or flights for out-of-town work" },
      { value: "staff-training", label: "Staff training, uniforms & welfare", hint: "First aid course, trade test, staff medical" },
    ],
  },
  {
    group: "Office, marketing & professional",
    items: [
      { value: "marketing-ads", label: "Advertising, flyers & marketing", hint: "Social media ads, banners, signage, printing" },
      { value: "office-stationery", label: "Stationery, printing & office supplies", hint: "Receipt books, paper, toner, pens" },
      { value: "professional-fees", label: "Accounting, legal & consulting fees", hint: "Accountant, lawyer, tax advisor, auditor" },
      { value: "permits-licences", label: "Permits, council licences & statutory fees", hint: "Shop licence, EMA, PRAZ, health permit" },
      { value: "bank-charges", label: "Bank charges & mobile money fees", hint: "Monthly account fee, EcoCash/transfer fees" },
      { value: "general-expense", label: "General business expense", hint: "Everyday operating cost" },
    ],
  },
];

export const ALL_SPENDING_CATEGORIES: SpendingCategoryOption[] = SPENDING_CATEGORY_GROUPS.flatMap((group) => group.items);

const CATEGORY_BY_VALUE = new Map(ALL_SPENDING_CATEGORIES.map((item) => [item.value, item]));

export function spendingCategoryLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return CATEGORY_BY_VALUE.get(value)?.label ?? null;
}

export function isSubscriptionCategory(value: string | null | undefined): boolean {
  if (!value) return false;
  return Boolean(CATEGORY_BY_VALUE.get(value)?.isSubscription);
}

/** Calculates the next renewal date (`YYYY-MM-DD`) from a billing date and cycle. */
export function nextRenewalDate(billDate: string, cycle: SubscriptionCycle): string {
  const [y, m, d] = billDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  if (cycle === "weekly") {
    dt.setUTCDate(dt.getUTCDate() + 7);
  } else if (cycle === "monthly") {
    dt.setUTCMonth(dt.getUTCMonth() + 1);
  } else if (cycle === "quarterly") {
    dt.setUTCMonth(dt.getUTCMonth() + 3);
  } else if (cycle === "yearly") {
    dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  }
  return dt.toISOString().slice(0, 10);
}

export type SpendingNoteMeta = {
  fdmsCode?: string | null;
  category?: string | null;
  subscription?: {
    cycle: SubscriptionCycle;
    nextRenewal?: string | null;
  } | null;
  note?: string | null;
};

/**
 * Formats FDMS code, spending category, and subscription cycle into `PurchaseBill.notes`.
 * When only `fdmsCode` is present, produces `"FDMS code <code>"` so existing tests pass unchanged.
 */
export function formatSpendingNote(meta: SpendingNoteMeta): string | undefined {
  const parts: string[] = [];
  const fdms = meta.fdmsCode?.trim();
  if (fdms) parts.push(`FDMS code ${fdms}`);
  if (meta.category?.trim()) parts.push(`[cat:${meta.category.trim()}]`);
  if (meta.subscription) {
    const renew = meta.subscription.nextRenewal ? `:${meta.subscription.nextRenewal}` : "";
    parts.push(`[sub:${meta.subscription.cycle}${renew}]`);
  }
  if (meta.note?.trim()) parts.push(meta.note.trim());
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function parseSpendingMeta(raw: string | null | undefined): {
  fdmsCode: string | null;
  category: string | null;
  subscription: { cycle: SubscriptionCycle; nextRenewal: string | null } | null;
  cleanNote: string | null;
} {
  if (!raw) return { fdmsCode: null, category: null, subscription: null, cleanNote: null };
  let text = raw;
  let fdmsCode: string | null = null;
  let category: string | null = null;
  let subscription: { cycle: SubscriptionCycle; nextRenewal: string | null } | null = null;

  const fdmsMatch = text.match(/FDMS code\s+([^\s·]+)/i);
  if (fdmsMatch) {
    fdmsCode = fdmsMatch[1] ?? null;
    text = text.replace(fdmsMatch[0], "");
  }

  const catMatch = text.match(/\[cat:([a-z0-9-]+)\]/i);
  if (catMatch) {
    category = catMatch[1] ?? null;
    text = text.replace(catMatch[0], "");
  }

  const subMatch = text.match(/\[sub:(weekly|monthly|quarterly|yearly)(?::(\d{4}-\d{2}-\d{2}))?\]/i);
  if (subMatch) {
    const cycle = subMatch[1]!.toLowerCase() as SubscriptionCycle;
    subscription = { cycle, nextRenewal: subMatch[2] ?? null };
    text = text.replace(subMatch[0], "");
  }

  const cleaned = text
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");

  return {
    fdmsCode,
    category,
    subscription,
    cleanNote: cleaned || null,
  };
}
