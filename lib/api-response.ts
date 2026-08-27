// Pure API response helpers.
//
// Deliberately dependency-light: this module must stay importable without
// dragging in the auth / platform-gating graph. `lib/api-utils.ts` re-exports
// everything here for the routes that also need `validateSession`; routes that
// only shape responses should import from this module directly so their
// compile closure stays at two modules instead of thirty-four.
import { NextRequest, NextResponse } from 'next/server';
import { serializeDecimals } from "@/lib/serialize-decimals";

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
  return NextResponse.json(serializeDecimals(data), { status });
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
