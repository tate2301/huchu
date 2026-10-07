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

import { errorResponse } from "@/lib/api-response";
import {
  canRetailRoleDo,
  retailPermissionDenial,
  type RetailAction,
  type RetailResource,
  type SessionLike,
} from "@/lib/retail/permission-matrix";

/** The matrix itself lives in `permission-matrix.ts`, which a client bundle can import. */
export {
  RETAIL_RESOURCES,
  RETAIL_ACTIONS,
  canRetailRoleDo,
  retailPermissionDenial,
  type RetailResource,
  type RetailAction,
  type SessionLike,
} from "@/lib/retail/permission-matrix";

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
