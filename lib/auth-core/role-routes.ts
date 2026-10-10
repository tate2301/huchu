/**
 * Role → allowed-route-prefix restrictions.
 *
 * Some roles are pinned to a single area of the app regardless of which
 * features their company has enabled. A SALES_REP, for example, only ever
 * works inside the CRM; feature gating alone would still let them reach other
 * modules their tenant happens to have. This allowlist is enforced centrally
 * in resolveAccessContext, so it covers every page and every /api/v2 handler
 * that runs through requireApiAuth/validateSession.
 */

const SHARED_ALLOWED_PREFIXES = [
  "/api/auth",
  "/api/notifications",
  "/api/uploads",
  // An export started from anywhere a role may work is fetched through these.
  // Both answer only to the person who asked for the export.
  "/api/documents/render-jobs",
  "/api/documents/artifacts",
  "/help",
  "/access-blocked",
  "/notifications",
  "/settings/profile",
];

export const ROLE_ROUTE_ALLOWLIST: Record<string, string[]> = {
  SALES_REP: ["/crm", "/api/v2/crm", ...SHARED_ALLOWED_PREFIXES],
};

/**
 * The stores module's own screens and its unguarded item, location and
 * movement handlers. They check the session and the feature, never the role:
 * a `PATCH /api/inventory/items/<id>` rewrites `currentStock` and `unitCost`
 * outside the stock ledger.
 */
const STORES_MODULE_PREFIXES = [
  "/stores",
  "/api/inventory",
  "/api/stock-locations",
  "/api/v2/inventory",
];

/**
 * Roles kept out of part of the app, or allowed only to read it, even where
 * their feature template reaches it.
 *
 * The shop-floor roles carry `stores.inventory` (and the stock clerk
 * `stores.movements`) because `retail.catalog` depends on the stock module and
 * the clerk's Counts, Transfers, Movements and Deliveries pages read its items,
 * locations and movements. That grant must not become the stores module's
 * writes: a cashier has no business in it at all, and a stock clerk changes
 * stock only through retail's counts, transfers and deliveries, which go
 * through `recordStockMovement` and the retail permission matrix.
 */
const ROLE_ROUTE_LIMITS: Record<string, { denied: string[]; readOnly: string[] }> = {
  CASHIER: { denied: STORES_MODULE_PREFIXES, readOnly: [] },
  POS_CASHIER: { denied: STORES_MODULE_PREFIXES, readOnly: [] },
  STOCK_CLERK: {
    denied: ["/stores", "/api/v2/inventory"],
    readOnly: ["/api/inventory", "/api/stock-locations"],
  },
  // The bookkeeper reads stock for the retail pages and changes it nowhere.
  // The fiscal device (the Roles board: Fiscal device R) is the matrix's to
  // refuse: its config, registration, fiscal-day and replay handlers ask
  // `retail.fiscal:update` and answer "Your role cannot change the fiscal
  // device". Only the two fiscal writes that never ask it stay read only here.
  FINANCE_OFFICER: {
    denied: ["/stores", "/api/v2/inventory"],
    readOnly: [
      "/api/inventory",
      "/api/stock-locations",
      "/api/accounting/fiscalisation/issue",
      "/api/accounting/fiscalisation/receipts",
    ],
  },
};

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isWithin(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Returns true when the role has no restriction, or the pathname falls within
 * one of the role's allowed prefixes and outside its limits. `method` is the
 * request's; without one (a page, a nav item) the route is being read.
 */
export function isRouteAllowedForRole(
  role: string | null | undefined,
  pathname: string,
  method: string = "GET",
): boolean {
  const normalized = String(role ?? "").trim().toUpperCase();
  const limits = ROLE_ROUTE_LIMITS[normalized];
  if (limits) {
    if (limits.denied.some((prefix) => isWithin(pathname, prefix))) return false;
    if (
      !READ_METHODS.has(method.toUpperCase()) &&
      limits.readOnly.some((prefix) => isWithin(pathname, prefix))
    ) {
      return false;
    }
  }
  const allowlist = ROLE_ROUTE_ALLOWLIST[normalized];
  if (!allowlist) return true;
  return allowlist.some((prefix) => isWithin(pathname, prefix));
}

/**
 * The landing path a restricted role should be redirected to (its first
 * allowed prefix), or null if the role is unrestricted.
 */
export function landingPathForRole(role: string | null | undefined): string | null {
  const normalized = String(role ?? "").trim().toUpperCase();
  const allowlist = ROLE_ROUTE_ALLOWLIST[normalized];
  return allowlist?.[0] ?? null;
}
