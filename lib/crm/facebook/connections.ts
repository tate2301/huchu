/**
 * The settings-screen side of a Facebook connection.
 *
 * Everything here exists so the route handlers stay about HTTP: what a
 * connection looks like to the client (never its token), and the check that
 * has to pass before "connected" means anything.
 */
import { prisma } from "@/lib/prisma";

import { facebookAppConfig } from "./app";
import { GraphApiError, fetchPage, pageIsSubscribed, subscribePageToLeadgen } from "./graph";
import { decryptSecret } from "./secrets";

/** What the settings screen is allowed to see. The Page access token is absent
 *  by construction — there is no "reveal" for it, because it is not the
 *  customer's to read back and reconnecting replaces it in one click. */
export const CONNECTION_CLIENT_SELECT = {
  id: true,
  pageId: true,
  pageName: true,
  authorizedByName: true,
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

export type CredentialCheck = {
  ok: boolean;
  pageName: string | null;
  subscribed: boolean;
  error: string | null;
};

/**
 * Prove the stored token works, and subscribe the Page while we are here.
 *
 * Subscribing is the step everything else depends on. An app can have a
 * verified webhook and a perfectly good token, and still receive nothing,
 * because a Page delivers no leads until it is subscribed to the app's
 * `leadgen` field. The connect flow does this automatically; this function is
 * what re-does it when somebody presses Check, and what proves the token has
 * not since been revoked.
 */
export async function checkAndSubscribe(connectionId: string, companyId: string): Promise<CredentialCheck> {
  const row = await prisma.crmFacebookConnection.findFirst({
    where: { id: connectionId, companyId },
    select: { id: true, pageId: true, pageAccessTokenEnc: true },
  });
  if (!row) return { ok: false, pageName: null, subscribed: false, error: "Connection not found" };

  let credentials: { accessToken: string; appSecret: string };
  try {
    credentials = {
      accessToken: decryptSecret(row.pageAccessTokenEnc),
      appSecret: facebookAppConfig().appSecret,
    };
  } catch (error) {
    return {
      ok: false,
      pageName: null,
      subscribed: false,
      error: error instanceof Error ? error.message : "Stored credentials could not be read",
    };
  }

  return runCheck(row.id, row.pageId, credentials);
}

/** Shared by the Check button and the connect flow, which needs the same three
 *  calls the moment a Page is picked. */
export async function runCheck(
  connectionId: string,
  pageId: string,
  credentials: { accessToken: string; appSecret: string },
): Promise<CredentialCheck> {
  try {
    const page = await fetchPage(pageId, credentials);
    let subscribed = await pageIsSubscribed(pageId, credentials);
    if (!subscribed) subscribed = await subscribePageToLeadgen(pageId, credentials);

    const error = subscribed ? null : "Facebook did not subscribe this Page to lead notifications.";
    await prisma.crmFacebookConnection.update({
      where: { id: connectionId },
      data: {
        pageName: page.name ?? undefined,
        verifiedAt: subscribed ? new Date() : null,
        lastError: error,
        lastErrorAt: error ? new Date() : null,
      },
    });

    return { ok: subscribed, pageName: page.name ?? null, subscribed, error };
  } catch (error) {
    const message =
      error instanceof GraphApiError && error.isAuthFailure
        ? `${error.message} — reconnect this Page to issue a fresh access token.`
        : error instanceof Error
          ? error.message
          : String(error);
    await prisma.crmFacebookConnection
      .update({ where: { id: connectionId }, data: { verifiedAt: null, lastError: message, lastErrorAt: new Date() } })
      .catch(() => {});
    return { ok: false, pageName: null, subscribed: false, error: message };
  }
}
