/**
 * The line between running a business and doing the accounting
 * (design/books/spec/books.md, Tiers; design/books/NOTES.md §1), written as
 * data: every Books address names its tier, and the route gate, the API gate,
 * the Books layout, the panel and the upsell read only this. Moving a row
 * between tiers is one line here.
 *
 * - `free`: thin Books, in every workspace. Selling, buying and paying, staff
 *   money, money accounts. Nothing a business needs to trade waits on a plan.
 * - `screens`: the Books screens, $10 a month (`books.screens`).
 * - `advanced`: the $99 plan, Tax, Close the month and the Ledger.
 *
 * Longest prefix wins, so a free row inside a paid level (or the reverse) is
 * written as its own line.
 */

export type BooksTier = "free" | "screens" | "advanced";

/** The feature each paid tier needs. The engine (`accounting.core`) is always on. */
export const BOOKS_SCREENS_KEY = "books.screens";

/**
 * The $99 tier's key: Tax, Close the month and the Ledger. A workspace has it
 * when it holds the screens and is on the larger vertical rate (more than five
 * billed members; `getCompanyFeatureMap`), or when an admin grants it by hand
 * (`ADDON_BOOKS_ADVANCED`, NOTES §5.3).
 */
export const BOOKS_ADVANCED_KEY = "books.advanced";

export const BOOKS_TIER_KEY: Record<Exclude<BooksTier, "free">, string> = {
  screens: BOOKS_SCREENS_KEY,
  advanced: BOOKS_ADVANCED_KEY,
};

/** What each paid tier costs, as the panel and the upsell write it. */
export const BOOKS_TIER_PRICE: Record<Exclude<BooksTier, "free">, string> = { screens: "$10", advanced: "$99" };

type TierRow = readonly [prefix: string, tier: BooksTier];

/** Books' pages. */
const PAGES: readonly TierRow[] = [
  ["/books", "screens"], // Money, the overview
  // Sales
  ["/books/invoices", "free"],
  ["/books/quotes", "free"],
  ["/books/payments", "free"],
  ["/books/credit-notes", "free"],
  ["/books/customers", "free"],
  ["/books/statements", "free"],
  // Bills & spending
  ["/books/expenses", "screens"], // All spending
  ["/books/bills", "free"],
  ["/books/payments-made", "free"],
  ["/books/orders", "free"],
  ["/books/requisitions", "free"],
  ["/books/claims", "free"],
  ["/books/suppliers", "free"],
  // Bank & cash
  ["/books/accounts", "free"],
  ["/books/bank", "screens"], // To match, statement upload
  ["/books/reconciliations", "screens"],
  ["/books/takings", "free"],
  // Tax
  ["/books/tax", "advanced"],
  ["/books/vat", "advanced"],
  ["/books/withholding", "advanced"],
  ["/books/provisional-tax", "advanced"],
  ["/books/fiscal", "advanced"],
  // Close the month
  ["/books/periods", "advanced"],
  ["/books/needs-posting", "advanced"],
  ["/books/rates", "screens"], // revaluation is on the $10 screens
  ["/books/year-end", "advanced"],
  // Ledger
  ["/books/journals", "advanced"],
  ["/books/trial-balance", "advanced"],
  ["/books/financials", "advanced"],
  ["/books/ledger", "advanced"],
  ["/books/chart", "advanced"],
  ["/books/cost-centres", "advanced"],
  ["/books/posting-rules", "advanced"],
  ["/books/audit", "advanced"],
  // Settings
  ["/books/settings", "screens"],
  ["/books/reports", "free"], // Reports from Books run without the screens (integrations.md)
];

/** The APIs, by the page that calls them. A free page's API is free. */
const APIS: readonly TierRow[] = [
  ["/api/books", "screens"],
  ["/api/books/core", "free"], // void, revise, delete on any record, by role
  ["/api/books/nav", "free"],
  ["/api/books/accountant-export", "free"],
  ["/api/books/money-and-tax", "free"],
  ["/api/books/money-accounts", "free"],
  ["/api/books/attachments", "free"],
  ["/api/books/forms", "free"],
  ["/api/books/money", "screens"],
  ["/api/books/invoices", "free"],
  ["/api/books/quotes", "free"],
  ["/api/books/payments", "free"],
  ["/api/books/credit-notes", "free"],
  ["/api/books/customers", "free"],
  ["/api/books/expenses", "screens"],
  ["/api/books/bills", "free"],
  ["/api/books/payments-made", "free"],
  ["/api/books/purchase-orders", "free"],
  ["/api/books/requisitions", "free"],
  ["/api/books/claims", "free"],
  ["/api/books/petty-cash", "free"],
  ["/api/books/suppliers", "free"],
  ["/api/books/accounts", "free"],
  ["/api/books/bank", "screens"],
  ["/api/books/bank/entries", "free"], // transfers, charges and IMTT between money accounts
  ["/api/books/reconciliations", "screens"],
  ["/api/books/rates", "screens"],
  ["/api/books/settings", "screens"],
  ["/api/books/tax", "advanced"],
  ["/api/books/vat", "advanced"],
  ["/api/books/withholding", "advanced"],
  ["/api/books/provisional-tax", "advanced"],
  ["/api/books/fiscal", "advanced"],
  ["/api/books/close", "advanced"],
  ["/api/books/needs-posting", "advanced"],
  ["/api/books/year-end", "advanced"],
  ["/api/books/journals", "advanced"],
  ["/api/books/trial-balance", "advanced"],
  ["/api/books/financials", "advanced"],
  ["/api/books/ledger", "advanced"],
  ["/api/books/chart", "advanced"],
  ["/api/books/cost-centres", "advanced"],
  ["/api/books/posting-rules", "advanced"],
  ["/api/books/audit", "advanced"],
];

/**
 * Views inside a free page that are paid: the views by age (customers and
 * suppliers), read from the `view` search parameter. The page draws the
 * upsell in their place and the API refuses them (`booksTierForView`).
 */
export const BOOKS_PAID_VIEWS: ReadonlyArray<{ prefix: string; view: string; tier: Exclude<BooksTier, "free"> }> = [
  { prefix: "/books/customers", view: "by-age", tier: "screens" },
  { prefix: "/books/suppliers", view: "by-age", tier: "screens" },
  { prefix: "/api/books/customers", view: "by-age", tier: "screens" },
  { prefix: "/api/books/suppliers", view: "by-age", tier: "screens" },
];

/**
 * What the $10 screens add on a free list: saved views across documents and
 * bulk actions. The list draws neither without the screens, and the bulk API
 * (`/api/books/core/bulk`) refuses on the plan as well as the role.
 */
export const BOOKS_PAID_FEATURES = { savedViews: "screens", bulk: "screens" } as const satisfies Record<string, Exclude<BooksTier, "free">>;

const normalise = (path: string) => (path.split("?")[0] ?? "").replace(/\/+$/, "").toLowerCase() || "/";
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

function sorted(rows: readonly TierRow[]) {
  return [...rows].sort((a, b) => b[0].length - a[0].length);
}
const PAGE_ROWS = sorted(PAGES);
const API_ROWS = sorted(APIS);

/** The tier of a Books address, page or API; null when it is not Books'. */
export function booksTierForPath(pathname: string): BooksTier | null {
  const path = normalise(pathname);
  const rows = path.startsWith("/api/") ? API_ROWS : PAGE_ROWS;
  return rows.find(([prefix]) => under(path, prefix))?.[1] ?? null;
}

/** The tier of a paid view on a free page (`?view=by-age`), else null. */
export function booksTierForView(pathname: string, view: string | null | undefined): Exclude<BooksTier, "free"> | null {
  if (!view) return null;
  const path = normalise(pathname);
  return BOOKS_PAID_VIEWS.find((row) => row.view === view && under(path, row.prefix))?.tier ?? null;
}

/** The feature a Books address needs on top of the engine; null for a free one. */
export function booksTierKeyForPath(pathname: string): string | null {
  const tier = booksTierForPath(pathname);
  return tier && tier !== "free" ? BOOKS_TIER_KEY[tier] : null;
}

/** Whether a workspace with these features has a tier. */
export function hasBooksTier(enabledFeatures: readonly string[] | undefined, tier: BooksTier): boolean {
  if (tier === "free") return true;
  const features = enabledFeatures ?? [];
  if (!features.includes(BOOKS_SCREENS_KEY)) return false;
  return tier === "screens" || features.includes(BOOKS_TIER_KEY.advanced);
}

/** The highest tier a workspace has: what the panel and the upsell draw against. */
export function booksPlanOf(enabledFeatures: readonly string[] | undefined): BooksTier {
  if (hasBooksTier(enabledFeatures, "advanced")) return "advanced";
  if (hasBooksTier(enabledFeatures, "screens")) return "screens";
  return "free";
}

/** Every Books address with its tier, for the tests and the gate's coverage check. */
export function booksTierRows(): ReadonlyArray<{ prefix: string; tier: BooksTier; api: boolean }> {
  return [...PAGES.map(([prefix, tier]) => ({ prefix, tier, api: false })), ...APIS.map(([prefix, tier]) => ({ prefix, tier, api: true }))];
}
