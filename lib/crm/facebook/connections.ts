/**
 * The settings-screen side of a Facebook connection.
 *
 * Everything here exists so the route handlers stay about HTTP: what a
 * connection looks like to the client (never its secrets), how its callback
 * URL is built, and the credential check that has to pass before "connected"
 * means anything.
 */
import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site-url";

import { GraphApiError, fetchPage, pageIsSubscribed, subscribePageToLeadgen } from "./graph";
import { decryptSecret, secretTail } from "./secrets";

/** The URL segment Meta is pointed at. 32 bytes of base64url — not a secret,
 *  but wide enough that the callback is not a tenant directory. */
export function generateCallbackToken(): string {
  return randomBytes(24).toString("base64url");
}

/** The string Meta echoes during the handshake. Generated rather than typed,
 *  because an operator choosing it picks something short and reuses it. */
export function generateVerifyToken(): string {
  return randomBytes(18).toString("base64url");
}

export function callbackUrlFor(callbackToken: string): string {
  return absoluteUrl(`/api/public/crm/webhook/facebook/${callbackToken}`);
}

/** What the settings screen is allowed to see. The app secret and Page access
 *  token are absent by construction — there is no "reveal" for either, because
 *  neither is ours to hand back and both can be replaced. */
export const CONNECTION_CLIENT_SELECT = {
  id: true,
  callbackToken: true,
  pageId: true,
  pageName: true,
  appId: true,
  verifyToken: true,
  formIds: true,
  defaultChannel: true,
  defaultSourceLabel: true,
  defaultAssigneeId: true,
  isActive: true,
  verifiedAt: true,
  lastEventAt: true,
  lastError: true,
  lastErrorAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ConnectionRow = {
  id: string;
  callbackToken: string;
  pageId: string;
  pageName: string | null;
  appId: string;
  verifyToken: string;
  formIds: string[];
  defaultChannel: string;
  defaultSourceLabel: string | null;
  defaultAssigneeId: string | null;
  isActive: boolean;
  verifiedAt: Date | null;
  lastEventAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toClientConnection(row: ConnectionRow) {
  return {
    ...row,
    callbackUrl: callbackUrlFor(row.callbackToken),
  };
}

export type CredentialCheck = {
  ok: boolean;
  pageName: string | null;
  subscribed: boolean;
  error: string | null;
};

/**
 * Prove the saved credentials work, and subscribe the Page while we are here.
 *
 * Subscribing is the step people miss. Pointing an app's webhook at a URL and
 * passing the handshake makes the Meta dashboard look finished, but a Page
 * delivers nothing until it is subscribed to the app's `leadgen` field — so
 * the symptom is a green tick and no leads, which is the hardest kind of
 * broken to notice. Doing it from here means it cannot be skipped.
 */
export async function checkAndSubscribe(connectionId: string, companyId: string): Promise<CredentialCheck> {
  const row = await prisma.crmFacebookConnection.findFirst({
    where: { id: connectionId, companyId },
    select: { id: true, pageId: true, appSecretEnc: true, pageAccessTokenEnc: true },
  });
  if (!row) return { ok: false, pageName: null, subscribed: false, error: "Connection not found" };

  let credentials: { accessToken: string; appSecret: string };
  try {
    credentials = {
      accessToken: decryptSecret(row.pageAccessTokenEnc),
      appSecret: decryptSecret(row.appSecretEnc),
    };
  } catch (error) {
    return {
      ok: false,
      pageName: null,
      subscribed: false,
      error: error instanceof Error ? error.message : "Stored credentials could not be read",
    };
  }

  try {
    const page = await fetchPage(row.pageId, credentials);
    let subscribed = await pageIsSubscribed(row.pageId, credentials);
    if (!subscribed) subscribed = await subscribePageToLeadgen(row.pageId, credentials);

    await prisma.crmFacebookConnection.update({
      where: { id: row.id },
      data: {
        pageName: page.name ?? undefined,
        lastError: subscribed ? null : "Page is not subscribed to the app's leadgen field.",
        lastErrorAt: subscribed ? null : new Date(),
      },
    });

    return { ok: subscribed, pageName: page.name ?? null, subscribed, error: subscribed ? null : "Page is not subscribed to the app's leadgen field." };
  } catch (error) {
    const message =
      error instanceof GraphApiError && error.isAuthFailure
        ? `${error.message} — the Page access token is expired, revoked, or belongs to a different Page.`
        : error instanceof Error
          ? error.message
          : String(error);
    await prisma.crmFacebookConnection
      .update({ where: { id: row.id }, data: { lastError: message, lastErrorAt: new Date() } })
      .catch(() => {});
    return { ok: false, pageName: null, subscribed: false, error: message };
  }
}

/** The last four characters of a saved token, so the screen can say which one
 *  is stored without showing it. */
export function savedSecretHint(encrypted: string): string | null {
  try {
    return secretTail(decryptSecret(encrypted));
  } catch {
    return null;
  }
}
