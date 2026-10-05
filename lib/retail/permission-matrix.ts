/**
 * Who can do what in retail: the Roles board as code (80-admin 3.1, ADM-01).
 *
 * One explicit grant table per role key, default deny. The board itself — its
 * sections, rows, letters and limit sentences — is `roles-matrix.ts`, and
 * `roles-matrix.test.ts` derives every letter on the board from the grants
 * below, cell by cell. Change a grant here and that test says which cell of
 * the board no longer holds.
 *
 * Nothing in this file is server-only. `permissions.ts` re-exports all of it
 * and adds the 403 helper for route handlers; the split exists because the
 * shell reads the matrix in the browser (each nav item's `requires`,
 * 00-foundations 5.3.4).
 *
 * Row-level rules the matrix cannot state live in their services: managers add
 * and change cashiers and stock clerks only (ADM-02); managers limited to sites
 * see those sites' activity (ADM-06); a manager approves requisitions at or
 * under the owner limit and never their own (BUY-04); cashiers refund and void
 * within the till rules (SET-06); `view-own` lists only the caller's own
 * requisitions (BUY-04); a cashier sees only their own shifts and sales.
 */

/**
 * The 37 surfaces retail authorises against. Not a list of routes: several
 * routes map onto one resource, and one route may ask two questions.
 *
 * Three have no board row of their own: `retail.stock` (On hand and Movements,
 * under the Stock section), `retail.money` (the Money insight, under Insights)
 * and `retail.reports` (report templates and the floor Overview).
 */
export const RETAIL_RESOURCES = [
  "retail.company",
  "retail.sites",
  "retail.tills",
  "retail.payments",
  "retail.zig-rate",
  "retail.till-rules",
  "retail.receipts",
  "retail.fiscal",
  "retail.posting",
  "retail.billing",
  "retail.catalog",
  "retail.prices",
  "retail.promotions",
  "retail.categories",
  "retail.stock",
  "retail.counts",
  "retail.adjustments",
  "retail.transfers",
  "retail.empties",
  "retail.suppliers",
  "retail.purchasing",
  "retail.requisitions",
  "retail.bills",
  "retail.sell",
  "retail.cash-control",
  "retail.laybys",
  "retail.end-of-day",
  "retail.customers",
  "retail.accounts",
  "retail.loyalty",
  "retail.people",
  "retail.approvals",
  "retail.activity",
  "retail.bin",
  "retail.insights",
  "retail.money",
  "retail.reports",
] as const;

export type RetailResource = (typeof RETAIL_RESOURCES)[number];

/**
 * Everything a retail resource can be asked to do.
 *
 * - `view-cost` is field-level: `pos/catalog` stays open to a cashier while the
 *   cost and margin columns it carries do not.
 * - `refund` and `void` are separate from `create` because reversing a posted
 *   sale is the act a shop watches; `approve` on `retail.sell` is the right to
 *   approve one without a manager.
 * - `open-shift` and `close-shift` are the cash drawer, not a record.
 * - `receive` lets a stock clerk book a delivery in without raising an order.
 * - `view-own` reads only the caller's own rows (requisitions). It never makes
 *   an R on the board: a route that lists for it scopes to the caller.
 */
export const RETAIL_ACTIONS = [
  "view",
  "view-own",
  "view-cost",
  "create",
  "update",
  "delete",
  "approve",
  "refund",
  "void",
  "open-shift",
  "close-shift",
  "receive",
] as const;

export type RetailAction = (typeof RETAIL_ACTIONS)[number];

/** The role keys that hold grants. Every other role holds nothing. */
export const RETAIL_ROLE_KEYS = [
  "CORELITH_SUPPORT",
  "SUPERADMIN",
  "MANAGER",
  "SHOP_MANAGER",
  "CASHIER",
  "STOCK_CLERK",
  "FINANCE_OFFICER",
] as const;

export type RetailRoleKey = (typeof RETAIL_ROLE_KEYS)[number];

type Grants = Partial<Record<RetailResource, readonly RetailAction[]>>;

/** Every action except `view-own`: holding `view` already reads every row. */
const ALL: readonly RetailAction[] = RETAIL_ACTIONS.filter((action) => action !== "view-own");
const VIEW: readonly RetailAction[] = ["view"];
const VIEW_UPDATE: readonly RetailAction[] = ["view", "update"];
const CRUD: readonly RetailAction[] = ["view", "create", "update", "delete"];
const CRU: readonly RetailAction[] = ["view", "create", "update"];

/** Owner: the tenant's SUPERADMIN. */
const OWNER: Grants = {
  "retail.company": VIEW_UPDATE,
  "retail.sites": CRUD,
  "retail.tills": CRUD,
  "retail.payments": VIEW_UPDATE,
  "retail.zig-rate": VIEW_UPDATE,
  "retail.till-rules": VIEW_UPDATE,
  "retail.receipts": VIEW_UPDATE,
  "retail.fiscal": VIEW_UPDATE,
  "retail.posting": VIEW_UPDATE,
  "retail.billing": VIEW_UPDATE,
  "retail.catalog": ["view", "view-cost", "create", "update", "delete"],
  "retail.prices": ["view", "create", "update", "delete", "approve"],
  "retail.promotions": CRUD,
  "retail.categories": CRUD,
  "retail.stock": VIEW_UPDATE,
  "retail.counts": ["view", "create", "update", "delete", "approve"],
  "retail.adjustments": ["view", "create", "update", "delete", "approve"],
  "retail.transfers": CRUD,
  "retail.empties": CRUD,
  "retail.suppliers": CRUD,
  "retail.purchasing": ["view", "create", "update", "delete", "approve", "receive"],
  "retail.requisitions": ["view", "create", "update", "delete", "approve"],
  "retail.bills": CRUD,
  "retail.sell": ["view", "create", "update", "delete", "approve", "refund", "void", "open-shift", "close-shift"],
  "retail.cash-control": ["view", "create", "update", "delete", "approve", "open-shift", "close-shift"],
  "retail.laybys": CRUD,
  "retail.end-of-day": CRU,
  "retail.customers": CRUD,
  "retail.accounts": ["view", "create", "update", "delete", "approve"],
  "retail.loyalty": VIEW_UPDATE,
  "retail.people": CRUD,
  "retail.approvals": VIEW_UPDATE,
  "retail.activity": VIEW,
  "retail.bin": ["view", "update", "delete"],
  "retail.insights": VIEW,
  "retail.money": VIEW,
  "retail.reports": CRUD,
};

/** Manager: MANAGER and SHOP_MANAGER. Runs the shop, not the books or the plan. */
const MANAGER: Grants = {
  "retail.company": VIEW,
  "retail.sites": VIEW_UPDATE,
  "retail.tills": CRUD,
  "retail.payments": VIEW,
  "retail.zig-rate": VIEW_UPDATE,
  "retail.till-rules": VIEW_UPDATE,
  "retail.receipts": VIEW_UPDATE,
  "retail.fiscal": VIEW,
  "retail.catalog": ["view", "view-cost", "create", "update", "delete"],
  "retail.prices": CRU,
  "retail.promotions": CRUD,
  "retail.categories": CRU,
  "retail.stock": VIEW_UPDATE,
  "retail.counts": ["view", "create", "update", "delete", "approve"],
  "retail.adjustments": ["view", "create", "update", "approve"],
  "retail.transfers": CRUD,
  "retail.empties": CRUD,
  "retail.suppliers": CRUD,
  "retail.purchasing": ["view", "create", "update", "delete", "approve", "receive"],
  "retail.requisitions": ["view", "create", "update", "approve"],
  "retail.bills": VIEW,
  "retail.sell": OWNER["retail.sell"],
  "retail.cash-control": OWNER["retail.cash-control"],
  "retail.laybys": CRUD,
  "retail.end-of-day": CRU,
  "retail.customers": CRUD,
  "retail.accounts": CRU,
  "retail.loyalty": VIEW,
  "retail.people": CRU,
  "retail.approvals": VIEW,
  "retail.activity": VIEW,
  "retail.bin": VIEW_UPDATE,
  "retail.insights": VIEW,
  "retail.reports": CRUD,
};

/**
 * Cashier: sells, refunds and voids within the till rules, opens and closes
 * their own drawer, adds customers and lay-bys, takes empties back, and asks
 * for money. Never sees cost.
 */
const CASHIER: Grants = {
  "retail.catalog": VIEW,
  "retail.prices": VIEW,
  "retail.promotions": VIEW,
  "retail.empties": ["create"],
  "retail.requisitions": ["view-own", "create"],
  "retail.sell": ["view", "create", "refund", "void", "open-shift", "close-shift"],
  "retail.laybys": CRU,
  "retail.customers": ["view", "create"],
};

/** Stock clerk: counts, moves and receives stock; never sells or orders. */
const STOCK_CLERK: Grants = {
  "retail.sites": VIEW,
  "retail.catalog": VIEW,
  "retail.stock": VIEW,
  "retail.counts": CRU,
  "retail.adjustments": ["create"],
  "retail.transfers": CRU,
  "retail.empties": CRU,
  "retail.suppliers": VIEW,
  "retail.purchasing": ["view", "receive"],
  "retail.requisitions": ["view-own", "create"],
};

/** Bookkeeper: FINANCE_OFFICER. Reads the shop, keeps the books and the bills. */
const BOOKKEEPER: Grants = {
  "retail.company": VIEW,
  "retail.sites": VIEW,
  "retail.payments": VIEW,
  "retail.zig-rate": VIEW,
  "retail.fiscal": VIEW,
  "retail.posting": VIEW_UPDATE,
  "retail.billing": VIEW,
  "retail.catalog": ["view", "view-cost"],
  "retail.prices": VIEW,
  "retail.promotions": VIEW,
  "retail.categories": VIEW,
  "retail.stock": VIEW,
  "retail.counts": VIEW,
  "retail.adjustments": VIEW,
  "retail.transfers": VIEW,
  "retail.empties": VIEW,
  "retail.suppliers": VIEW_UPDATE,
  "retail.purchasing": VIEW,
  "retail.requisitions": VIEW,
  "retail.bills": CRUD,
  "retail.sell": VIEW,
  "retail.cash-control": VIEW,
  "retail.laybys": VIEW,
  "retail.end-of-day": VIEW,
  "retail.customers": VIEW,
  "retail.accounts": VIEW_UPDATE,
  "retail.approvals": VIEW,
  "retail.activity": VIEW,
  "retail.insights": VIEW,
  "retail.money": VIEW,
  "retail.reports": VIEW,
};

/**
 * Superuser: Corelith support acting for the shop, always logged. Everything,
 * except that activity, insights and money are read only. Applies only while a
 * support session is on (`retailRoleKey`).
 */
const VIEW_ONLY_FOR_SUPPORT = new Set<RetailResource>(["retail.activity", "retail.insights", "retail.money"]);
const CORELITH_SUPPORT: Grants = Object.fromEntries(
  RETAIL_RESOURCES.map((resource) => [resource, VIEW_ONLY_FOR_SUPPORT.has(resource) ? VIEW : ALL]),
);

const GRANTS: Record<RetailRoleKey, Grants> = {
  CORELITH_SUPPORT,
  SUPERADMIN: OWNER,
  MANAGER,
  SHOP_MANAGER: MANAGER,
  CASHIER,
  STOCK_CLERK,
  FINANCE_OFFICER: BOOKKEEPER,
};

function grantsFor(role: string | null | undefined): Grants | null {
  if (!role) return null;
  const key = role.trim().toUpperCase();
  return (RETAIL_ROLE_KEYS as readonly string[]).includes(key) ? GRANTS[key as RetailRoleKey] : null;
}

/** Whether a role key holds `action` on `resource`. Absent role, resource or action: deny. */
export function canRetailRoleDo(
  role: string | null | undefined,
  resource: RetailResource,
  action: RetailAction,
): boolean {
  return grantsFor(role)?.[resource]?.includes(action) ?? false;
}

export type SessionLike = {
  user: { role?: string | null; supportSessionId?: string | null };
};

/**
 * The role key a session is measured with: `CORELITH_SUPPORT` while a support
 * session is on, else the user's own role.
 */
export function retailRoleKey(session: SessionLike): string | null {
  if (session.user.supportSessionId) return "CORELITH_SUPPORT";
  return session.user.role ?? null;
}

/**
 * The feature that makes a company a shop. The session test below and the
 * bookkeeper's retail-only template (`lib/platform/user-entitlements.ts`)
 * both read this key, so the two never disagree about who works in a shop.
 */
export const RETAIL_CORE_FEATURE = "retail.core";

/** Whether a list of enabled features is a shop's: `retail.core` is on. */
export function runsRetail(enabledFeatures: readonly string[] | null | undefined): boolean {
  return (enabledFeatures ?? []).some((key) => key.trim().toLowerCase() === RETAIL_CORE_FEATURE);
}

/** The question every guard asks: may this signed-in caller do it. */
export function canRetailSessionDo(session: SessionLike, resource: RetailResource, action: RetailAction): boolean {
  return canRetailRoleDo(retailRoleKey(session), resource, action);
}

/** Reads as a noun after any verb below: "Your role cannot <verb> <label>". */
export const RESOURCE_LABELS: Record<RetailResource, string> = {
  "retail.company": "company settings",
  "retail.sites": "sites",
  "retail.tills": "tills and devices",
  "retail.payments": "payment settings",
  "retail.zig-rate": "the ZiG rate",
  "retail.till-rules": "till rules",
  "retail.receipts": "receipt settings",
  "retail.fiscal": "the fiscal device",
  "retail.posting": "posting to the books",
  "retail.billing": "the plan and billing",
  "retail.catalog": "products",
  "retail.prices": "price lists",
  "retail.promotions": "promotions, bundles and vouchers",
  "retail.categories": "categories",
  "retail.stock": "stock",
  "retail.counts": "stock counts",
  "retail.adjustments": "stock adjustments",
  "retail.transfers": "transfers",
  "retail.empties": "empties",
  "retail.suppliers": "suppliers",
  "retail.purchasing": "orders and deliveries",
  "retail.requisitions": "requisitions",
  "retail.bills": "bills and supplier payments",
  "retail.sell": "sales",
  "retail.cash-control": "shifts and cash",
  "retail.laybys": "lay-bys",
  "retail.end-of-day": "the end of day",
  "retail.customers": "customers",
  "retail.accounts": "accounts",
  "retail.loyalty": "loyalty settings",
  "retail.people": "people",
  "retail.approvals": "approvals",
  "retail.activity": "activity",
  "retail.bin": "the bin",
  "retail.insights": "insights",
  "retail.money": "the money page",
  "retail.reports": "reports",
};

/** The verb a refusal uses, so the person at the counter reads a sentence. */
const ACTION_VERBS: Record<RetailAction, string> = {
  view: "view",
  "view-own": "view",
  "view-cost": "see cost price on",
  create: "create",
  update: "change",
  delete: "delete",
  approve: "approve",
  refund: "refund",
  void: "void",
  "open-shift": "open a till shift in",
  "close-shift": "close a till shift in",
  receive: "receive against",
};

/**
 * Null when allowed, else the sentence to refuse with. A message rather than a
 * throw: retail routes answer through `errorResponse`, and a throw would read
 * as a 500.
 */
export function retailPermissionDenial(
  session: SessionLike,
  resource: RetailResource,
  action: RetailAction,
): string | null {
  if (canRetailSessionDo(session, resource, action)) return null;
  return `Your role cannot ${ACTION_VERBS[action]} ${RESOURCE_LABELS[resource]}`;
}

/** Whether this role may see what the shop paid: cost, margin, supplier price. */
export function canSeeRetailCostPrice(role: string | null | undefined): boolean {
  return canRetailRoleDo(role, "retail.catalog", "view-cost");
}
