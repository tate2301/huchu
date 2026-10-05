/**
 * The retail permission matrix, with nothing server-only in it.
 *
 * `permissions.ts` re-exports all of this and adds the 403 helper for route
 * handlers. The split exists because the shell reads the matrix in the browser
 * (each nav item's `requires`, 00-foundations 5.3.4), and the route helper
 * pulls `next/server` and the request-scoped activity log, which a client
 * bundle cannot load.
 */

/**
 * The seven surfaces retail authorises against.
 *
 * Not a list of routes. Several routes map onto one resource, and one route can
 * ask two questions of the matrix:
 *
 * - `retail.sell` — the till. Sales, held carts, the cashier's own shift, and the
 *   customer and loyalty lookups the till performs mid-sale.
 * - `retail.catalog` — what is on the shelf, its price, and its promotions.
 * - `retail.purchasing` — purchase orders and goods receipts.
 * - `retail.stock` — counts, adjustments and transfers.
 * - `retail.cash-control` — cash-up: every cashier's shift, its variance, and
 *   signing it off. The back-office half of a shift, not the till's half.
 * - `retail.reports` — the trading dashboard. Takings, margin and cost in one view.
 * - `retail.setup` — registers, trading hours, tender and POS policy.
 * - `retail.requisitions` — asking for money to spend on the shop, deciding,
 *   and paying it out. Anybody on staff may ask; the manager decides and pays.
 * - `retail.money` — the Money insight: where the shop's money went. The owner's
 *   alone among the shop's own ("Managers do not see Money", the Roles board).
 * - `retail.posting` — Posting to the books: which ledger accounts the shop's
 *   takings, cost and tax land in. The owner's and the bookkeeper's; the
 *   manager runs the shop, not the books (00-foundations 5.3.4 leaves the M
 *   column blank). The bookkeeper's grants arrive with ADM-01's matrix.
 */
export const RETAIL_RESOURCES = [
  "retail.sell",
  "retail.catalog",
  "retail.purchasing",
  "retail.stock",
  "retail.cash-control",
  "retail.reports",
  "retail.setup",
  "retail.requisitions",
  "retail.money",
  "retail.posting",
] as const;

export type RetailResource = (typeof RETAIL_RESOURCES)[number];

/**
 * Everything a retail resource can be asked to do.
 *
 * The five ordinary ones plus six the module genuinely has routes for:
 *
 * - `view-cost` is the reason a matrix replaces the role sets. It is field-level,
 *   not route-level: `pos/catalog` must stay open to a cashier — a till that
 *   cannot list its stock cannot sell — while the cost and margin columns it
 *   carries must not. No role-set gate can express that.
 * - `refund` and `void` are separate from `create` because reversing a posted sale
 *   is the act a shop watches. They are also separate from each other, as the
 *   ledger already treats them (`RetailSaleType.REFUND` vs `VOID`).
 * - `open-shift` and `close-shift` are separate from `create`/`update` because a
 *   shift is the cash drawer, not a record. Note that "their own shift" is a
 *   row-level scope the matrix cannot state; the route enforces the ownership,
 *   this states the capability.
 * - `receive` is separate from `create` on purchasing so that a stock clerk can
 *   book a delivery in against an order without being able to raise one.
 */
export const RETAIL_ACTIONS = [
  "view",
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

const ALL: RetailAction[] = [...RETAIL_ACTIONS];

/**
 * Run a till for a shift and nothing else. Sell, park a cart, look a customer up,
 * open the drawer at seven and cash it up at close.
 *
 * No `refund` and no `void`: reversing a posted sale is how a till is stolen from,
 * and in a shop this size the manager is on the floor. No `update` or `delete`
 * either — a mistake at the till is corrected by a reversal that leaves a trail,
 * not by editing the sale.
 */
const RUN_A_TILL: RetailAction[] = ["view", "create", "open-shift", "close-shift"];

/**
 * Read the shelf. Deliberately `view` without `view-cost`: this is the whole
 * point of the field-level action, and it is what a cashier gets on the catalogue.
 */
const READ_THE_SHELF: RetailAction[] = ["view"];

/**
 * Count it, move it, correct it. What a stock clerk needs on the stock ledger.
 *
 * Not `approve` — a write-off is the owner's decision — and not `delete`, because
 * a stock movement that can be deleted is a stock ledger that cannot be trusted.
 */
const MOVE_STOCK: RetailAction[] = ["view", "create", "update"];

/**
 * Book a delivery in against an order that already exists.
 *
 * `view` is included on purpose: a clerk cannot receive against an order they
 * cannot see. It is also the grant that carries supplier unit cost, which is why
 * it stops at the two actions and does not extend to raising or approving an
 * order — deciding what the shop buys, and at what price, is not the clerk's.
 */
const BOOK_A_DELIVERY_IN: RetailAction[] = ["view", "receive"];

/**
 * The shop's own. SUPERADMIN, MANAGER and SHOP_MANAGER are the set
 * `RETAIL_MANAGER_ROLES` already names in `_helpers.ts`, and they do everything.
 */
const MANAGE_THE_SHOP: Partial<Record<RetailResource, RetailAction[]>> = {
  "retail.sell": ALL,
  "retail.catalog": ALL,
  "retail.purchasing": ALL,
  "retail.stock": ALL,
  "retail.cash-control": ALL,
  "retail.reports": ALL,
  "retail.setup": ALL,
  "retail.requisitions": ALL,
};

/**
 * Ask for money and follow your own request. `view` reaches only the asker's
 * own requisitions — the route scopes it — and nothing here decides or pays.
 */
const ASK_FOR_MONEY: RetailAction[] = ["view", "create"];

type Matrix = Partial<Record<string, Partial<Record<RetailResource, RetailAction[]>>>>;

/**
 * Role to what it may do. Absent role, absent resource, absent action — deny.
 *
 * CLERK and FINANCE_OFFICER appear in `VERTICAL_ROLE_REGISTRY.RETAIL` and are
 * absent here on purpose: none of retail's three gates admits them today, so
 * granting them anything now would be a widening of access dressed up as a
 * refactor. If the shop wants a finance reviewer on `retail.reports`, that is a
 * line in this table and a decision somebody makes.
 */
const MATRIX: Matrix = {
  SUPERADMIN: { ...MANAGE_THE_SHOP, "retail.money": ALL, "retail.posting": ALL },
  MANAGER: MANAGE_THE_SHOP,
  SHOP_MANAGER: MANAGE_THE_SHOP,

  // The person behind the counter. They sell, they see the shelf price, they open
  // and close their own drawer. They do not see what the shop paid for a bottle,
  // they do not see the day's margin, they do not touch the ordering, and cash-up
  // — the reconciliation of every till against the takings — is not theirs.
  CASHIER: {
    "retail.sell": RUN_A_TILL,
    "retail.catalog": READ_THE_SHELF,
    "retail.requisitions": ASK_FOR_MONEY,
  },

  // The person with the stock. Counts, transfers, adjustments, and receiving what
  // the supplier drops off. Not the till: a shop that lets the person who counts
  // the stock also sell it has removed its own separation of duties.
  STOCK_CLERK: {
    "retail.catalog": READ_THE_SHELF,
    "retail.stock": MOVE_STOCK,
    "retail.purchasing": BOOK_A_DELIVERY_IN,
    "retail.requisitions": ASK_FOR_MONEY,
  },
};

export function canRetailRoleDo(
  role: string | null | undefined,
  resource: RetailResource,
  action: RetailAction,
): boolean {
  if (!role) return false;
  const grants = MATRIX[role.trim().toUpperCase()];
  if (!grants) return false;
  return grants[resource]?.includes(action) ?? false;
}

export type SessionLike = { user: { role?: string | null } };

/** Reads as a noun after any of the verbs below. */
const RESOURCE_LABELS: Record<RetailResource, string> = {
  "retail.sell": "sales",
  "retail.catalog": "catalogue items",
  "retail.purchasing": "purchase orders",
  "retail.stock": "stock",
  "retail.cash-control": "cash control",
  "retail.reports": "retail reports",
  "retail.setup": "retail setup",
  "retail.requisitions": "requisitions",
  "retail.money": "the money page",
  "retail.posting": "posting to the books",
};

/**
 * The verb the refusal uses. A table rather than the action name interpolated,
 * because "view-cost catalogue items" is not a sentence and the person reading it
 * is a cashier mid-queue, not a developer.
 */
const ACTION_VERBS: Record<RetailAction, string> = {
  view: "view",
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
 * Returns null when allowed, or the message to refuse with.
 *
 * A message rather than a thrown error, for the same reason as the HR and schools
 * versions: every retail route returns through `errorResponse`, and a throw would
 * be caught by the generic handler and reported as a 500 — telling a cashier the
 * shop's system is broken when in fact they simply may not.
 */
export function retailPermissionDenial(
  session: SessionLike,
  resource: RetailResource,
  action: RetailAction,
): string | null {
  if (canRetailRoleDo(session.user.role, resource, action)) return null;
  return `Your role cannot ${ACTION_VERBS[action]} ${RESOURCE_LABELS[resource]}`;
}

/**
 * Whether this caller may see what the shop paid.
 *
 * A single boolean because that is what the serialisers need: `pos/catalog`,
 * `catalog`, `purchasing/*` and the trading dashboard all carry cost, margin or
 * supplier price on rows a cashier is otherwise entitled to read, so the decision
 * has to be passed down into the row shaping rather than taken at the door.
 */
export function canSeeRetailCostPrice(role: string | null | undefined): boolean {
  return canRetailRoleDo(role, "retail.catalog", "view-cost");
}
