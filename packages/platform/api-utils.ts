// Session-validating API utilities.
//
// Importing this module costs the whole auth + platform-gating closure (it must:
// `validateSession` ends at prisma and the feature catalog). Routes that only
// need response shaping should import `@/lib/api-response` instead — the pure
// helpers are re-exported here so existing `@/lib/api-utils` imports keep
// working either way.
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuthLean } from "./auth-core/api-guard";
import type { AuthenticatedSession } from "./auth-core/types";

export type { AuthenticatedSession } from "./auth-core/types";
export {
  errorResponse,
  successResponse,
  getPaginationParams,
  paginationResponse,
  isValidUUID,
  sanitizeString,
} from "./api-response";

/**
 * Validates user session and returns it or sends 401 response
 */
export async function validateSession(
  request: NextRequest
): Promise<{ session: AuthenticatedSession } | NextResponse> {
  return requireApiAuthLean({ request });
}

/**
 * Validates if user has required role
 */
export function hasRole(session: AuthenticatedSession, allowedRoles: string[]): boolean {
  return allowedRoles.includes(session.user.role);
}
