/**
 * What a member of staff may do in Retail.
 *
 * Mirrors `lib/hr/permissions.ts` in shape and for the same reason. Retail's
 * users are the tenant's own `UserRole` values — SHOP_MANAGER, CASHIER,
 * STOCK_CLERK — so this is a matrix over those rather than a persona lookup.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Retail's only gates today are three role sets in `app/api/v2/retail/_helpers.ts`
 * (`RETAIL_MANAGER_ROLES`, `RETAIL_STOCK_ROLES`, `RETAIL_POS_ROLES`) and the POS
 * host's `canAccessPosPortal`. A role set can answer "is this person a stock
 * person". It cannot answer "may a cashier read the catalogue but not its cost
 * price", because that is a field on a row rather than a route, and it is exactly
 * the question a bottle store asks: the shelf price is public, the buying price is
 * the owner's business.
 *
 * Nor do the gates cover the reads. 22 of retail's 24 `GET` handlers have no role
 * check at all (`lib/retail/route-guard-coverage.test.ts` pins the list), so a
 * cashier can currently pull the trading dashboard and the catalogue's margin
 * column. The route registry does not close that: it answers "is retail switched
 * on for this tenant" and never "which signed-in person is calling".
 *
 * The default is deny. A role absent from the matrix below can do nothing in
 * retail, which is deliberate — `UserRole` is one enum shared by every vertical,
 * so TEACHER, BURSAR and SALES_EXEC all exist alongside CASHIER and none of them
 * has any business at the till.
 *
 * ── On `lib/platform/personas.ts` ──────────────────────────────────────────
 *
 * That catalogue also carries retail grants, under a different vocabulary
 * (`retail.pos`, `retail.refunds`, `retail.shifts`, `retail.promotions`). They are
 * not the resources this plan names and nothing in retail reads them. Rather than
 * bend one vocabulary to the other in passing, this module owns retail's answer
 * and the divergence is written down; reconciling the catalogue is its own ticket.
 */

import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-utils";

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
 */
export const RETAIL_RESOURCES = [
  "retail.sell",
  "retail.catalog",
  "retail.purchasing",
  "retail.stock",
  "retail.cash-control",
  "retail.reports",
  "retail.setup",
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
};

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
  SUPERADMIN: MANAGE_THE_SHOP,
  MANAGER: MANAGE_THE_SHOP,
  SHOP_MANAGER: MANAGE_THE_SHOP,

  // The person behind the counter. They sell, they see the shelf price, they open
  // and close their own drawer. They do not see what the shop paid for a bottle,
  // they do not see the day's margin, they do not touch the ordering, and cash-up
  // — the reconciliation of every till against the takings — is not theirs.
  CASHIER: {
    "retail.sell": RUN_A_TILL,
    "retail.catalog": READ_THE_SHELF,
  },

  // The person with the stock. Counts, transfers, adjustments, and receiving what
  // the supplier drops off. Not the till: a shop that lets the person who counts
  // the stock also sell it has removed its own separation of duties.
  STOCK_CLERK: {
    "retail.catalog": READ_THE_SHELF,
    "retail.stock": MOVE_STOCK,
    "retail.purchasing": BOOK_A_DELIVERY_IN,
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
 * The door check, in the shape every retail route already uses.
 *
 * Returns a 403 to hand straight back, or null to carry on — the same
 * `gate && return gate` idiom as `requireRetailManager` and friends, so applying
 * the matrix to a handler is a two-line change rather than a rewrite.
 */
export function requireRetailPermission(
  session: SessionLike,
  resource: RetailResource,
  action: RetailAction,
): NextResponse | null {
  const denial = retailPermissionDenial(session, resource, action);
  return denial ? errorResponse(denial, 403) : null;
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
