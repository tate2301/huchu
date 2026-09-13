/**
 * The one Meta app this deployment speaks to Facebook through.
 *
 * Not a per-tenant credential, and the whole design turns on that. A customer
 * connecting their Page never types an app id, never reveals an app secret and
 * never runs a Graph API call by hand: they press a button, approve Facebook's
 * permission screen, and pick their Page. That flow is only possible with a
 * single OAuth client, which means the app is deployment config.
 *
 * It also moves Meta's app review from every customer to us, once. The
 * `leads_retrieval` permission needs Advanced Access before an app may read a
 * stranger's lead, and a small business is never going to film a screencast
 * and wait a week for Meta. With one app, one approval covers every tenant.
 */

export class FacebookAppConfigError extends Error {}

export type FacebookAppConfig = {
  appId: string;
  appSecret: string;
  /** Echoed back during Meta's one-time webhook handshake. */
  webhookVerifyToken: string;
};

/**
 * The permissions the connect flow asks for, and why each one is needed.
 * Anything not on this list is not asked for — a consent screen that demands
 * more than it uses is the fastest way to lose a customer at the last step.
 */
export const FACEBOOK_OAUTH_SCOPES = [
  /** Read the answers on a lead. Without it the integration does nothing. */
  "leads_retrieval",
  /** List the Pages this person administers, so they can pick one. */
  "pages_show_list",
  /** Read the Page itself — its name, for the settings screen. */
  "pages_read_engagement",
  /** Subscribe the Page to the app's `leadgen` field. This is the step that
   *  actually makes leads arrive, and it is the one a manual setup forgets. */
  "pages_manage_metadata",
] as const;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new FacebookAppConfigError(
      `${name} is not set. Facebook Lead Ads needs the deployment's Meta app credentials; see docs/crm/facebook-lead-ads.md.`,
    );
  }
  return value;
}

export function facebookAppConfig(env: NodeJS.ProcessEnv = process.env): FacebookAppConfig {
  return {
    appId: required(env, "FACEBOOK_APP_ID"),
    appSecret: required(env, "FACEBOOK_APP_SECRET"),
    webhookVerifyToken: required(env, "FACEBOOK_WEBHOOK_VERIFY_TOKEN"),
  };
}

/**
 * Whether this deployment can offer the connect button at all.
 *
 * The settings screen asks before it draws: a button that leads to a 500 is
 * worse than an honest "not configured on this deployment yet".
 */
export function facebookAppConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    facebookAppConfig(env);
    return true;
  } catch {
    return false;
  }
}
