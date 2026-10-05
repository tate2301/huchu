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

import { retailPermissionDenial, type RetailAction, type RetailResource, type SessionLike } from "./permission-matrix";

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
