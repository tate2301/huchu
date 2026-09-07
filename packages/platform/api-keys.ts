/**
 * A tenant's keys for the public API.
 *
 * `CrmApiKey` let a lead-capture form post into one module. This is the same
 * idea for every module: a key is minted by a workspace admin, carries the
 * feature keys it may reach (`scopes`), and is sent as
 * `Authorization: Bearer cz_…`. A route that serves outside developers asks
 * `authenticateApiKey(request, scope)` and gets the tenant back — or the
 * response that explains why not: no key, an unknown or revoked key, a scope
 * the key does not carry, a feature the tenant does not hold.
 *
 * The plaintext is shown once at creation; only its sha256 hash is stored, and
 * the first eleven characters (`cz_` and eight hex) are kept as a display
 * prefix so a person can tell their keys apart.
 */
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { errorResponse } from "./api-response";
import { hasFeature } from "./features";

export const API_KEY_PREFIX = "cz_";
const KEY_BYTES = 20; // → 40 hex characters
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

export type ApiKeyPrincipal = {
  keyId: string;
  companyId: string;
  scopes: string[];
};

export function generatePlatformApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(KEY_BYTES).toString("hex")}`;
  return { key, prefix: key.slice(0, DISPLAY_PREFIX_LENGTH), hash: hashPlatformApiKey(key) };
}

export function hashPlatformApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

/** The key a request carries: `Authorization: Bearer cz_…`, or `x-api-key` for clients that cannot set the former. */
export function readBearerApiKey(request: { headers: Headers }): string | null {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  const candidate = bearer || request.headers.get("x-api-key")?.trim() || "";
  return candidate.startsWith(API_KEY_PREFIX) ? candidate : null;
}

/**
 * Resolve a raw key to the tenant and scopes it stands for, or null. Touches
 * `lastUsedAt` as a fire-and-forget side effect, so a revoked key's last use
 * is on record.
 */
export async function verifyPlatformApiKey(rawKey: string | null | undefined): Promise<ApiKeyPrincipal | null> {
  if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX)) return null;
  const row = await prisma.platformApiKey.findUnique({
    where: { keyHash: hashPlatformApiKey(rawKey) },
    select: { id: true, companyId: true, scopes: true, revokedAt: true },
  });
  if (!row || row.revokedAt) return null;
  void prisma.platformApiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { keyId: row.id, companyId: row.companyId, scopes: row.scopes };
}

/**
 * The gate a public route stands behind. Both axes are checked, as the session
 * gate checks them: the key must carry the scope (what the admin let this key
 * do) and the tenant must hold the feature (what the tenant bought). A 401 says
 * "no valid key", a 403 says which of the two refused, with a `code` a client
 * can act on.
 */
export async function authenticateApiKey(
  request: { headers: Headers },
  scope: string,
): Promise<{ principal: ApiKeyPrincipal } | NextResponse> {
  const rawKey = readBearerApiKey(request);
  if (!rawKey) return errorResponse("An API key is required", 401, { code: "API_KEY_REQUIRED" });
  const principal = await verifyPlatformApiKey(rawKey);
  if (!principal) return errorResponse("The API key is unknown or revoked", 401, { code: "API_KEY_INVALID" });
  if (!principal.scopes.includes(scope)) {
    return errorResponse(`The API key does not carry the scope ${scope}`, 403, { code: "API_KEY_SCOPE", scope });
  }
  if (!(await hasFeature(principal.companyId, scope))) {
    return errorResponse(`This workspace does not hold ${scope}`, 403, { code: "FEATURE_DISABLED", scope });
  }
  return { principal };
}
