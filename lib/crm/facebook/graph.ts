/**
 * The Graph API calls a Lead Ads integration actually needs.
 *
 * Four, and no client abstraction around them: read a leadgen, read a Page,
 * list its forms, and subscribe it. A generic Graph client would be a wrapper
 * over `fetch` with the query string moved, and the only thing it would add is
 * somewhere for the next call to hide.
 *
 * Every call carries an `appsecret_proof`. Meta only demands it when an app
 * turns on "Require app secret", but sending it always means turning that
 * setting on does not silently break a tenant's leads a month later.
 */
import { createHmac } from "node:crypto";

/** Pinned deliberately. A Graph version is a contract with field names in it,
 *  and following "latest" means a rename lands as leads that stop arriving. */
export const GRAPH_API_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const TIMEOUT_MS = 10_000;

export class GraphApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly subcode?: number;

  constructor(message: string, status: number, code?: number, subcode?: number) {
    super(message);
    this.name = "GraphApiError";
    this.status = status;
    this.code = code;
    this.subcode = subcode;
  }

  /** An expired, revoked or wrong-Page token, as opposed to a transient
   *  failure. The difference decides whether a delivery is worth retrying or
   *  whether somebody has to reconnect the Page. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.code === 190 || this.code === 102 || this.code === 10;
  }
}

function appsecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken, "utf8").digest("hex");
}

type GraphCredentials = { accessToken: string; appSecret: string };

async function graphRequest<T>(
  path: string,
  params: Record<string, string>,
  credentials: GraphCredentials,
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const query = new URLSearchParams({
    ...params,
    access_token: credentials.accessToken,
    appsecret_proof: appsecretProof(credentials.accessToken, credentials.appSecret),
  });

  const url = method === "GET" ? `${GRAPH_BASE}${path}?${query}` : `${GRAPH_BASE}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(method === "POST"
        ? {
            body: query,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          }
        : {}),
    });
  } catch (error) {
    // A timeout or a DNS failure is ours to retry, not Meta telling us no.
    throw new GraphApiError(
      `Could not reach the Facebook Graph API: ${error instanceof Error ? error.message : String(error)}`,
      0,
    );
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new GraphApiError(`Graph API returned a non-JSON response: ${text.slice(0, 200)}`, response.status);
  }

  if (!response.ok) {
    const err = (body as { error?: { message?: string; code?: number; error_subcode?: number } }).error;
    throw new GraphApiError(
      err?.message ?? `Graph API request failed with status ${response.status}`,
      response.status,
      err?.code,
      err?.error_subcode,
    );
  }

  return body as T;
}

/** One answer to one question on a lead form. `values` is an array because a
 *  multi-select question answers with several. */
export type LeadFieldDatum = { name: string; values: string[] };

export type LeadgenRecord = {
  id: string;
  created_time?: string;
  field_data?: LeadFieldDatum[];
  form_id?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  /** True for a lead from an organic Page post rather than a paid ad. */
  is_organic?: boolean;
  /** "fb" | "ig" — which surface the form was filled on. */
  platform?: string;
};

const LEADGEN_FIELDS = [
  "id",
  "created_time",
  "field_data",
  "form_id",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "is_organic",
  "platform",
].join(",");

/**
 * Read the submission a webhook delivery only named.
 *
 * This is the call the whole integration exists around: the webhook payload
 * carries a `leadgen_id` and nothing the customer typed, and Meta expires a
 * lead's readability after 90 days, so a delivery that is not fetched now is
 * a lead that is gone later.
 */
export function fetchLeadgen(leadgenId: string, credentials: GraphCredentials): Promise<LeadgenRecord> {
  return graphRequest<LeadgenRecord>(`/${encodeURIComponent(leadgenId)}`, { fields: LEADGEN_FIELDS }, credentials);
}

export function fetchPage(
  pageId: string,
  credentials: GraphCredentials,
): Promise<{ id: string; name?: string }> {
  return graphRequest(`/${encodeURIComponent(pageId)}`, { fields: "id,name" }, credentials);
}

export async function fetchLeadForms(
  pageId: string,
  credentials: GraphCredentials,
): Promise<Array<{ id: string; name?: string; status?: string }>> {
  const result = await graphRequest<{ data?: Array<{ id: string; name?: string; status?: string }> }>(
    `/${encodeURIComponent(pageId)}/leadgen_forms`,
    { fields: "id,name,status", limit: "100" },
    credentials,
  );
  return result.data ?? [];
}

/**
 * Subscribe the Page to the app's `leadgen` field.
 *
 * Pointing an app's webhook at a URL is only half of it: a Page delivers
 * nothing until it is subscribed to the app, and this is the step people miss
 * — the dashboard shows a verified callback, the test button works, and real
 * leads never arrive. Doing it from here means an operator cannot skip it.
 */
export async function subscribePageToLeadgen(
  pageId: string,
  credentials: GraphCredentials,
): Promise<boolean> {
  const result = await graphRequest<{ success?: boolean }>(
    `/${encodeURIComponent(pageId)}/subscribed_apps`,
    { subscribed_fields: "leadgen" },
    credentials,
    "POST",
  );
  return result.success !== false;
}

export async function pageIsSubscribed(
  pageId: string,
  credentials: GraphCredentials,
): Promise<boolean> {
  const result = await graphRequest<{ data?: Array<{ subscribed_fields?: string[] }> }>(
    `/${encodeURIComponent(pageId)}/subscribed_apps`,
    { fields: "subscribed_fields" },
    credentials,
  );
  return (result.data ?? []).some((app) => (app.subscribed_fields ?? []).includes("leadgen"));
}
