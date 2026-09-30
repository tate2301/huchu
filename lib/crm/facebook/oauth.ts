/**
 * Facebook Login, which is the three Graph API calls a manual setup made
 * somebody run by hand — done server-side from an authorisation code.
 *
 *   1. the customer is sent to Facebook and approves the permissions
 *   2. Facebook redirects back with a `code`
 *   3. we trade the code for a short-lived user token
 *   4. we extend it to a long-lived one
 *   5. we read `/me/accounts`, which returns their Pages *and* a Page access
 *      token for each — and a Page token minted from a long-lived user token
 *      does not expire
 *
 * Step 5 is why the customer never sees a Page id either: the id arrives
 * alongside the token, so the picker shows Page names and stores ids.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { absoluteUrl } from "@/lib/site-url";

import { facebookAppConfig, FACEBOOK_OAUTH_SCOPES, type FacebookAppConfig } from "./app";
import { GRAPH_API_VERSION } from "./graph";

const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const DIALOG_BASE = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const TIMEOUT_MS = 10_000;

export class FacebookOAuthError extends Error {}

/** Where Facebook sends the customer back to. Registered on the Meta app as a
 *  Valid OAuth Redirect URI, and sent identically on both the dialog and the
 *  code exchange — Meta compares them and refuses a mismatch. */
export function redirectUri(): string {
  return absoluteUrl("/api/v2/crm/integrations/facebook/callback");
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * The `state` parameter, signed rather than stored.
 *
 * It has to survive a round trip through Facebook and come back proving two
 * things: that this redirect answers a request *we* started (CSRF), and which
 * workspace started it. Signing both into the value keeps the flow stateless —
 * no row to write, no row to expire, no row to clean up — and the timestamp
 * caps how long a captured link is worth anything.
 */
const STATE_TTL_MS = 15 * 60 * 1000;

export function signState(companyId: string, config?: FacebookAppConfig): string {
  const { appSecret } = config ?? facebookAppConfig();
  const payload = `${companyId}.${Date.now()}.${randomBytes(9).toString("base64url")}`;
  const mac = createHmac("sha256", appSecret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export type StateCheck =
  | { ok: true; companyId: string }
  | { ok: false; reason: "MALFORMED" | "MISMATCH" | "EXPIRED" };

export function verifyState(state: string | null | undefined, config?: FacebookAppConfig): StateCheck {
  if (!state) return { ok: false, reason: "MALFORMED" };
  const parts = state.split(".");
  if (parts.length !== 4) return { ok: false, reason: "MALFORMED" };

  const [companyId, issuedAt, nonce, mac] = parts;
  const { appSecret } = config ?? facebookAppConfig();
  const expected = createHmac("sha256", appSecret)
    .update(`${companyId}.${issuedAt}.${nonce}`)
    .digest("base64url");

  const a = Buffer.from(mac, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "MISMATCH" };

  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > STATE_TTL_MS) return { ok: false, reason: "EXPIRED" };

  return { ok: true, companyId };
}

// ---------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------

export function authorizeUrl(state: string, config?: FacebookAppConfig): string {
  const { appId } = config ?? facebookAppConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri(),
    state,
    response_type: "code",
    scope: FACEBOOK_OAUTH_SCOPES.join(","),
  });
  return `${DIALOG_BASE}?${params}`;
}

// ---------------------------------------------------------------------------
// The exchanges
// ---------------------------------------------------------------------------

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${GRAPH_BASE}${path}?${new URLSearchParams(params)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new FacebookOAuthError(
      `Could not reach Facebook: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new FacebookOAuthError(`Facebook returned a non-JSON response: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const err = (body as { error?: { message?: string } }).error;
    throw new FacebookOAuthError(err?.message ?? `Facebook rejected the request (${response.status}).`);
  }
  return body as T;
}

/** Trade the authorisation code for a user token. Short-lived; extended next. */
export async function exchangeCodeForUserToken(code: string, config?: FacebookAppConfig): Promise<string> {
  const { appId, appSecret } = config ?? facebookAppConfig();
  const result = await graphGet<{ access_token?: string }>("/oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri(),
    code,
  });
  if (!result.access_token) throw new FacebookOAuthError("Facebook did not return an access token.");
  return result.access_token;
}

/**
 * Extend a short-lived user token to a ~60-day one.
 *
 * Skipping this is the mistake that makes an integration work all afternoon
 * and stop overnight: a Page token inherits its lifetime from the user token
 * it was minted from, so a Page token derived from a one-hour user token also
 * lasts an hour.
 */
export async function extendUserToken(shortLivedToken: string, config?: FacebookAppConfig): Promise<string> {
  const { appId, appSecret } = config ?? facebookAppConfig();
  const result = await graphGet<{ access_token?: string }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  if (!result.access_token) throw new FacebookOAuthError("Facebook did not return a long-lived token.");
  return result.access_token;
}

export type AuthorizedPage = {
  id: string;
  name: string;
  /** This Page's own access token — what every later Graph call uses. */
  accessToken: string;
};

/**
 * The Pages this person administers, each with its Page access token.
 *
 * `/me/accounts` is paginated, and an agency's login can easily hold more
 * Pages than one page of results. Following `paging.next` matters: a customer
 * whose Page is on result 26 would otherwise be told they have no Pages.
 */
export async function listAuthorizedPages(userToken: string): Promise<AuthorizedPage[]> {
  const pages: AuthorizedPage[] = [];
  let after: string | undefined;

  for (let guard = 0; guard < 20; guard += 1) {
    const result = await graphGet<{
      data?: Array<{ id?: string; name?: string; access_token?: string }>;
      paging?: { cursors?: { after?: string }; next?: string };
    }>("/me/accounts", {
      fields: "id,name,access_token",
      limit: "100",
      access_token: userToken,
      ...(after ? { after } : {}),
    });

    for (const row of result.data ?? []) {
      if (row.id && row.access_token) {
        pages.push({ id: row.id, name: row.name?.trim() || `Page ${row.id}`, accessToken: row.access_token });
      }
    }

    if (!result.paging?.next || !result.paging.cursors?.after) break;
    after = result.paging.cursors.after;
  }

  return pages;
}

/** The name on the Facebook account that authorised the connection, for the
 *  audit trail. Best effort — a missing name must not fail the connect. */
export async function fetchAuthorizingUser(userToken: string): Promise<string | null> {
  try {
    const me = await graphGet<{ name?: string }>("/me", { fields: "name", access_token: userToken });
    return me.name?.trim() || null;
  } catch {
    return null;
  }
}
