// API utility functions for production-ready endpoints
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from "@/lib/auth-core/guards";
import type { AuthenticatedSession } from "@/lib/auth-core/types";

export type { AuthenticatedSession } from "@/lib/auth-core/types";

/**
 * Validates user session and returns it or sends 401 response
 */
export async function validateSession(
  request: NextRequest
): Promise<{ session: AuthenticatedSession } | NextResponse> {
  return requireApiAuth({ request });
}

/**
 * Validates if user has required role
 */
export function hasRole(session: AuthenticatedSession, allowedRoles: string[]): boolean {
  return allowedRoles.includes(session.user.role);
}

/**
 * Standard error response for API
 */
export function errorResponse(
  message: string,
  status: number = 500,
  details?: unknown,
) {
  return NextResponse.json(
    {
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    { status }
  );
}

/**
 * Standard success response for API
 */
export function successResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Parse pagination params from request
 */
export function getPaginationParams(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
}

/**
 * Format pagination response
 */
export function paginationResponse<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

/**
 * Validates UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sanitize input string
 */
export function sanitizeString(input: string, maxLength: number = 500): string {
  return input.trim().substring(0, maxLength);
}
