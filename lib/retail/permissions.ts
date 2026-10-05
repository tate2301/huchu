/**
 * What a member of staff may do in retail, for route handlers.
 *
 * The matrix itself — 37 resources, the grant table per role key, the labels
 * and the session form — is `permission-matrix.ts`, re-exported here. The
 * board it transcribes is `roles-matrix.ts` (80-admin 3.1). This file adds
 * only the door check, which needs `next/server` and so cannot ride in a
 * client bundle.
 */

import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { hasRole, type UserRole } from "@/lib/roles";

import {
  canRetailSessionDo,
  retailPermissionDenial,
  type RetailAction,
  type RetailResource,
  type SessionLike,
} from "./permission-matrix";

export * from "./permission-matrix";

/**
 * The door check: a 403 `{ error: "Your role cannot <verb> <label>" }` to hand
 * straight back, or null to carry on. Measured with the session's role key, so
 * a support session is answered as `CORELITH_SUPPORT`.
 */
export function requireRetailPermission(
  session: SessionLike,
  resource: RetailResource,
  action: RetailAction,
): NextResponse | null {
  const denial = retailPermissionDenial(session, resource, action);
  return denial ? errorResponse(denial, 403) : null;
}

type SharedRouteSession = SessionLike & { user: { workspaceProfile?: string | null } };

/** Whether the caller works in a shop. */
export function isRetailSession(session: SharedRouteSession): boolean {
  return (session.user.workspaceProfile ?? "").trim().toUpperCase() === "RETAIL";
}

/**
 * Whether the caller may do it on a route a shop shares with other products —
 * the accounting module's fiscalisation and setup routes. A shop asks the
 * matrix (the Fiscal device and Posting to the books rows of the Roles board);
 * any other product keeps the route's own role list.
 */
export function canOnSharedRoute(
  session: SharedRouteSession,
  resource: RetailResource,
  action: RetailAction,
  otherProductRoles: readonly UserRole[] | null,
): boolean {
  if (isRetailSession(session)) return canRetailSessionDo(session, resource, action);
  return otherProductRoles === null || hasRole(session.user.role, [...otherProductRoles]);
}

/**
 * The door check for `canOnSharedRoute`: a shop is refused with the matrix's
 * sentence ("Your role cannot change the fiscal device"), any other product
 * with the route's own. Null to carry on.
 */
export function requireOnSharedRoute(
  session: SharedRouteSession,
  resource: RetailResource,
  action: RetailAction,
  otherProductRoles: readonly UserRole[] | null,
  otherProductRefusal: string,
): NextResponse | null {
  if (isRetailSession(session)) return requireRetailPermission(session, resource, action);
  return canOnSharedRoute(session, resource, action, otherProductRoles)
    ? null
    : errorResponse(otherProductRefusal, 403);
}
