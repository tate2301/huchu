/**
 * The short gap between "approved on Facebook" and "picked a Page".
 *
 * The callback comes back holding a long-lived user token and a list of Pages,
 * and the customer still has to choose one. Something has to hold that token
 * across the redirect, and the options are a database row or a cookie.
 *
 * A cookie wins here. The token is worthless without the CRM session beside
 * it, the value is encrypted with the same key that protects stored tokens,
 * and it is gone in ten minutes whether or not anybody finishes — which is
 * exactly the lifetime a half-finished connect deserves. A row would need a
 * table, an expiry sweep, and a reason to exist between two requests.
 */
import type { NextRequest, NextResponse } from "next/server";

import { decryptSecret, encryptSecret } from "./secrets";

export const CONNECT_COOKIE = "crm_fb_connect";
const TTL_SECONDS = 600;

type ConnectSession = {
  companyId: string;
  userToken: string;
  authorizedByName: string | null;
  issuedAt: number;
};

export function setConnectSession(
  response: NextResponse,
  session: Omit<ConnectSession, "issuedAt">,
): void {
  const payload: ConnectSession = { ...session, issuedAt: Date.now() };
  response.cookies.set(CONNECT_COOKIE, encryptSecret(JSON.stringify(payload)), {
    httpOnly: true,
    sameSite: "lax", // Must survive the top-level redirect back from Facebook.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/**
 * Read the session back, or null for anything that does not check out.
 *
 * `companyId` is compared by the caller against the session's own workspace:
 * a cookie minted while signed into one workspace must not connect a Page to
 * another one the same browser later opened.
 */
export function readConnectSession(request: NextRequest): ConnectSession | null {
  const raw = request.cookies.get(CONNECT_COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decryptSecret(raw)) as ConnectSession;
    if (!parsed?.userToken || !parsed?.companyId) return null;
    if (Date.now() - parsed.issuedAt > TTL_SECONDS * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearConnectSession(response: NextResponse): void {
  response.cookies.set(CONNECT_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
