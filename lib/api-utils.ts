// Session-validating API utilities.
//
// Importing this module costs the whole auth + platform-gating closure (it must:
// `validateSession` ends at prisma and the feature catalog). Routes that only
// need response shaping should import `@/lib/api-response` instead — the pure
// helpers are re-exported here so existing `@/lib/api-utils` imports keep
// working either way.
import { NextRequest, NextResponse } from 'next/server';
import { beginActivityRequest } from "@/lib/activity/context";
import { attachActivityActor } from "@/lib/activity/session";
import { requireApiAuthLean } from "@/lib/auth-core/api-guard";
import type { AuthenticatedSession } from "@/lib/auth-core/types";

export type { AuthenticatedSession } from "@/lib/auth-core/types";
export {
  errorResponse,
  successResponse,
  getPaginationParams,
  paginationResponse,
  isValidUUID,
  sanitizeString,
} from "@/lib/api-response";

/**
 * Validates user session and returns it or sends 401 response.
 *
 * Also where the activity log starts: a mutating request that passes this
 * guard has every write it makes recorded against the signed-in user, and
 * written as one event once the response is sent (`lib/activity`). The record
 * is opened before the first `await` — see `beginActivityRequest` for why
 * that order is the whole mechanism.
 */
export async function validateSession(
  request: NextRequest
): Promise<{ session: AuthenticatedSession } | NextResponse> {
  const activity = beginActivityRequest(request);
  const result = await requireApiAuthLean({ request });
  if (activity && !(result instanceof NextResponse)) {
    attachActivityActor(activity, result.session);
  }
  return result;
}

/**
 * Validates if user has required role
 */
export function hasRole(session: AuthenticatedSession, allowedRoles: string[]): boolean {
  return allowedRoles.includes(session.user.role);
}
