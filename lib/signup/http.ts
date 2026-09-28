import { NextResponse, type NextRequest } from "next/server";

import { getRealHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";
import { checkRateLimit } from "@/lib/auth-core/rate-limit";

/**
 * The plumbing the signup routes share: the cookie that carries a signup from
 * page to page, the caller's address for rate limits, and the origin the
 * browser is really on.
 */

export const SIGNUP_COOKIE = "signup_request";
const SIGNUP_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

export function readSignupCookie(request: NextRequest): string | null {
  return request.cookies.get(SIGNUP_COOKIE)?.value ?? null;
}

export function setSignupCookie(response: NextResponse, request: NextRequest, requestId: string) {
  response.cookies.set(SIGNUP_COOKIE, requestId, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: SIGNUP_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearSignupCookie(response: NextResponse) {
  response.cookies.delete(SIGNUP_COOKIE);
}

export function clientAddress(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** A 429 with the wait, or null when the caller is within the limit. */
export function rateLimited(request: NextRequest, scope: string, limit: number, windowMs: number): NextResponse | null {
  const result = checkRateLimit({ key: `signup:${scope}:${clientAddress(request)}`, limit, windowMs });
  if (result.allowed) return null;
  return NextResponse.json(
    { ok: false, reason: "RATE_LIMITED", retryAfterSeconds: result.retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}

/** The URL the browser is on: its real host and scheme, not the server's. */
export function browserUrl(request: NextRequest): string {
  const host = getRealHostHeaderFromRequestHeaders(request.headers) ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}${request.nextUrl.pathname}`;
}

const STATUS_BY_REASON: Record<string, number> = {
  NOT_FOUND: 404,
  NOT_VERIFIED: 409,
  ALREADY_VERIFIED: 409,
  ACCOUNT_EXISTS: 409,
  SLUG_TAKEN: 409,
  TOO_SOON: 429,
  TOO_MANY: 429,
  LOCKED: 429,
  EMAIL_FAILED: 502,
};

/** A refused step, as JSON with a status that says what kind of refusal. */
export function refusal(result: { ok: false; reason: string }): NextResponse {
  return NextResponse.json(result, { status: STATUS_BY_REASON[result.reason] ?? 400 });
}
