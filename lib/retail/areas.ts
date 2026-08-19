/**
 * Retail's seven areas, and the screens inside each.
 *
 * R-4.7. `RetailShell` was a title and a slot — it did not earn its name the
 * way `GoldShell` and `PayrollShell` do, which carry a tab rail for the section
 * you are in. This is the definition that rail is built from.
 *
 * ── Why this is not a second navigation ────────────────────────────────────
 *
 * R-4.6 deleted `RETAIL_TABS` precisely because retail had two nav definitions
 * that could disagree, and reintroducing one would undo it. So this is not a
 * list of destinations: it is a **grouping** of the destinations
 * `lib/navigation.ts` already declares, and `areas.test.ts` asserts the two
 * agree — every href here exists there, and every retail href there appears
 * here exactly once.
 *
 * The sidebar answers "which area", the rail answers "which screen in it".
 *
 * S-5 already bands the sidebar — Run the Floor, Range & Stock, Purchasing,
 * Controls & Growth — so this is not rescuing a flat list of eighteen rows. It
 * is the second click. Moving between POS policy and Accounting Setup meant
 * finding the group, expanding it, and reading five entries; the rail puts the
 * siblings of the screen you are on across the top of it, which is what
 * `GoldShell` and `PayrollShell` have always done.
 *
 * ── The areas are the shop's words, not the URLs ───────────────────────────
 *
 * `/retail/merchandising/pricing` and `/retail/merchandising/promotions` sit
 * under **Range** with `/retail/catalog`, because to a shopkeeper the range,
 * what it costs and what is on offer are one job. The URL says
 * `merchandising`; nobody in a bottle store does.
 *
 * `Overview`, `Sales`, `Shifts` and `Customers` each stand alone — a single
 * screen with no siblings gets no rail, because a rail with one tab is a
 * decoration that costs a row of vertical space on a laptop.
 */

export type RetailAreaId =
  | "overview"
  | "sales"
  | "shifts"
  | "customers"
  | "range"
  | "stock"
  | "purchasing"
  | "reports"
  | "setup";

export type RetailAreaScreen = {
  /** Must match an href in `lib/navigation.ts`. Asserted by the test. */
  href: string;
  label: string;
};

export type RetailArea = {
  id: RetailAreaId;
  /** What the rail is announced as, for a screen reader. */
  label: string;
  screens: RetailAreaScreen[];
};

export const RETAIL_AREAS: readonly RetailArea[] = [
  { id: "overview", label: "Overview", screens: [{ href: "/retail", label: "Overview" }] },
  { id: "sales", label: "Sales", screens: [{ href: "/retail/sales", label: "Sales" }] },
  { id: "shifts", label: "Shifts", screens: [{ href: "/retail/shifts", label: "Shifts" }] },
  {
    id: "customers",
    label: "Customers",
    screens: [{ href: "/retail/customers", label: "Customers" }],
  },
  {
    id: "range",
    label: "Range",
    screens: [
      { href: "/retail/catalog", label: "Catalog" },
      { href: "/retail/merchandising/pricing", label: "Pricing" },
      { href: "/retail/merchandising/promotions", label: "Promotions" },
    ],
  },
  {
    id: "stock",
    label: "Stock",
    screens: [
      { href: "/retail/stock", label: "Overview" },
      { href: "/retail/stock/count", label: "Count" },
      { href: "/retail/stock/transfers", label: "Transfers" },
    ],
  },
  {
    id: "purchasing",
    label: "Purchasing",
    screens: [
      { href: "/retail/purchasing/orders", label: "Purchase orders" },
      { href: "/retail/purchasing/receipts", label: "Goods receipts" },
    ],
  },
  { id: "reports", label: "Reports", screens: [{ href: "/retail/reports", label: "Reports" }] },
  {
    id: "setup",
    label: "Setup",
    screens: [
      { href: "/retail/setup", label: "Overview" },
      { href: "/retail/setup/operations", label: "Operations" },
      { href: "/retail/setup/branding", label: "Branding" },
      { href: "/retail/setup/pos-policy", label: "POS policy" },
      { href: "/retail/setup/accounting", label: "Accounting" },
    ],
  },
];

/**
 * Which area a path belongs to, and which screen inside it.
 *
 * Longest href wins, so `/retail/stock/count` resolves to the count screen and
 * not to the stock overview it is prefixed by. `/retail` matches everything by
 * prefix and would win every lookup, so matching is on the whole path with a
 * trailing-slash allowance rather than on `startsWith`.
 *
 * Returns null for a path that is not a retail screen — a detail route such as
 * `/retail/sales/{id}` included. A detail page belongs to its list's area, and
 * that is resolved by the caller passing the list's href explicitly rather than
 * by guessing from a uuid in the middle of a URL.
 */
export function resolveRetailArea(
  pathname: string,
): { area: RetailArea; screen: RetailAreaScreen } | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  let best: { area: RetailArea; screen: RetailAreaScreen } | null = null;

  for (const area of RETAIL_AREAS) {
    for (const screen of area.screens) {
      if (path !== screen.href) continue;
      if (!best || screen.href.length > best.screen.href.length) best = { area, screen };
    }
  }

  return best;
}

/**
 * The rail a path should show, or null for no rail at all.
 *
 * A single-screen area returns null: one tab is not navigation, it is a label
 * the page header already carries, and on a laptop it costs a row of the
 * vertical space the tables below it need.
 */
export function retailRailFor(
  pathname: string,
): { area: RetailArea; activeHref: string } | null {
  const resolved = resolveRetailArea(pathname);
  if (!resolved || resolved.area.screens.length < 2) return null;
  return { area: resolved.area, activeHref: resolved.screen.href };
}
