import { prisma } from "@corelithzw/db/client";

/**
 * Where a marketing lead goes to survive.
 *
 * Until MK-3 the demo form posted to `MARKETING_DEMO_WEBHOOK_URL` and, if that
 * was unset, called `console.error`. Both endings share one property: with the
 * webhook down or the variable unset, the person who typed their phone number
 * into the site is gone and nobody can tell it happened. A form that silently
 * discards is worse than no form, because the visitor believes they have been
 * heard and stops trying.
 *
 * So the row is written first and the webhook is a side effect. The ordering is
 * the whole point of this module: `recordMarketingLead` throws if the lead
 * cannot be stored, `deliverLeadWebhook` never throws at all. Anything that can
 * lose a lead is downstream of the thing that keeps it.
 */

/**
 * `MarketingLead.source` is a free-text column deliberately — a campaign or a
 * new tool must not need a migration to file a lead — but these are the values
 * the product writes today, and the admin surface groups on them.
 */
export const MARKETING_LEAD_SOURCES = {
  DEMO_REQUEST: "DEMO_REQUEST",
  PENALTY_CALCULATOR: "PENALTY_CALCULATOR",
  VAT_THRESHOLD: "VAT_THRESHOLD",
  OTHER: "OTHER",
} as const;

export type MarketingLeadSource =
  (typeof MARKETING_LEAD_SOURCES)[keyof typeof MARKETING_LEAD_SOURCES];

/** Rows a human is expected to work through. */
export const MARKETING_LEAD_STATUS_NEW = "NEW";

/**
 * A submission that left no way to reply.
 *
 * The free tools are useful without an email address, and somebody who runs the
 * penalty calculator for eleven tills has told us something worth knowing even
 * if they never fill in a contact field. Dropping those submissions to keep the
 * queue tidy would be losing leads, which is the one thing this module exists to
 * prevent — so they are stored under their own status and kept out of the queue
 * a salesperson works instead.
 */
export const MARKETING_LEAD_STATUS_ANONYMOUS = "ANONYMOUS";

/**
 * Serialised `payloadJson` ceiling. The column is unbounded text; this is a
 * guard against a public, unauthenticated endpoint being used as free storage,
 * not a statement about what a lead needs.
 */
export const MAX_LEAD_PAYLOAD_CHARS = 16_000;

/** Column-by-column ceilings, applied by truncation rather than rejection. */
const MAX_NAME = 160;
const MAX_EMAIL = 200;
const MAX_PHONE = 60;
const MAX_COMPANY = 200;
const MAX_MESSAGE = 8_000;
const MAX_PAGE_PATH = 300;
const MAX_UTM = 200;
const MAX_SOURCE = 64;

/** Default ceiling on the webhook call. A slow CRM must not hold the visitor. */
const WEBHOOK_TIMEOUT_MS = 5_000;

export type RecordMarketingLeadInput = {
  source: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  message?: string | null;
  /** Tool inputs and anything else that makes the follow-up call specific. */
  payload?: Record<string, unknown> | null;
  pagePath?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

export type RecordedMarketingLead = {
  id: string;
  source: string;
  status: string;
  createdAt: Date;
};

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function email(value: unknown): string | null {
  const normalised = text(value, MAX_EMAIL);
  return normalised ? normalised.toLowerCase() : null;
}

/**
 * The source is uppercased and punctuation-normalised so `book-demo`,
 * `Book Demo` and `BOOK_DEMO` group as one thing in the admin list. A lead
 * filed under three spellings of the same campaign is a lead nobody counts.
 */
export function normaliseLeadSource(value: unknown, fallback: string = MARKETING_LEAD_SOURCES.OTHER): string {
  const raw = text(value, MAX_SOURCE);
  if (!raw) return fallback;
  const normalised = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalised || fallback;
}

export type UtmFields = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

/**
 * Pull UTM tags out of whatever the caller has: the posted body, or the query
 * string of the page the visitor was on. Accepting both means the client does
 * not have to remember to forward them — the route can fall back to the
 * referer, which is where they actually live on a campaign landing page.
 */
export function readUtmFields(
  source: Record<string, unknown> | URLSearchParams | null | undefined,
): UtmFields {
  if (!source) return { utmSource: null, utmMedium: null, utmCampaign: null };

  const get = (key: string): unknown =>
    source instanceof URLSearchParams ? source.get(key) : source[key];

  return {
    utmSource: text(get("utmSource") ?? get("utm_source"), MAX_UTM),
    utmMedium: text(get("utmMedium") ?? get("utm_medium"), MAX_UTM),
    utmCampaign: text(get("utmCampaign") ?? get("utm_campaign"), MAX_UTM),
  };
}

/**
 * Read UTM tags and the page path off a `Referer` header.
 *
 * A visitor who lands on `/home/tools/fiscalisation-penalty?utm_campaign=zimra`
 * and submits from that page sends the campaign in the referer whether or not
 * the form thought to include it. Losing attribution is not losing the lead,
 * so a malformed header is swallowed rather than raised.
 */
export function readRefererContext(referer: string | null | undefined): UtmFields & { pagePath: string | null } {
  if (!referer) return { utmSource: null, utmMedium: null, utmCampaign: null, pagePath: null };
  try {
    const url = new URL(referer);
    return {
      ...readUtmFields(url.searchParams),
      pagePath: text(url.pathname, MAX_PAGE_PATH),
    };
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null, pagePath: null };
  }
}

/** True when the lead left some way of being answered. */
export function isReachableLead(input: Pick<RecordMarketingLeadInput, "email" | "phone">): boolean {
  return Boolean(email(input.email) || text(input.phone, MAX_PHONE));
}

export function serialiseLeadPayload(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  const keys = Object.keys(payload);
  if (keys.length === 0) return null;
  const serialised = JSON.stringify(payload);
  if (serialised.length > MAX_LEAD_PAYLOAD_CHARS) {
    throw new Error(
      `Lead payload is ${serialised.length} characters; the maximum is ${MAX_LEAD_PAYLOAD_CHARS}.`,
    );
  }
  return serialised;
}

/**
 * Write the lead. Throws if it cannot be written — the caller is expected to
 * treat that as the failure it is rather than carry on and answer `ok`.
 */
export async function recordMarketingLead(
  input: RecordMarketingLeadInput,
): Promise<RecordedMarketingLead> {
  const payloadJson = serialiseLeadPayload(input.payload);
  const reachable = isReachableLead(input);

  const lead = await prisma.marketingLead.create({
    data: {
      source: normaliseLeadSource(input.source),
      name: text(input.name, MAX_NAME),
      email: email(input.email),
      phone: text(input.phone, MAX_PHONE),
      companyName: text(input.companyName, MAX_COMPANY),
      message: text(input.message, MAX_MESSAGE),
      payloadJson,
      pagePath: text(input.pagePath, MAX_PAGE_PATH),
      utmSource: text(input.utmSource, MAX_UTM),
      utmMedium: text(input.utmMedium, MAX_UTM),
      utmCampaign: text(input.utmCampaign, MAX_UTM),
      status: reachable ? MARKETING_LEAD_STATUS_NEW : MARKETING_LEAD_STATUS_ANONYMOUS,
    },
    select: { id: true, source: true, status: true, createdAt: true },
  });

  return lead;
}

export type LeadWebhookOutcome =
  | { attempted: false; delivered: false; reason: "not-configured" }
  | { attempted: true; delivered: true; reason: null }
  | { attempted: true; delivered: false; reason: string };

/**
 * Best-effort notification of whatever the founder has the webhook pointed at.
 *
 * Every failure mode — unset URL, refused connection, DNS, timeout, a 500 from
 * the CRM — resolves rather than throws, because by the time this is called the
 * lead is already durable and there is nothing left worth failing the request
 * over. The failure is logged with the lead id so the row can be found and
 * replayed by hand.
 */
export async function deliverLeadWebhook(input: {
  url: string | null | undefined;
  payload: unknown;
  leadId?: string | null;
  timeoutMs?: number;
}): Promise<LeadWebhookOutcome> {
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (!url) return { attempted: false, delivered: false, reason: "not-configured" };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.payload),
      signal: AbortSignal.timeout(input.timeoutMs ?? WEBHOOK_TIMEOUT_MS),
    });

    if (response.ok) return { attempted: true, delivered: true, reason: null };

    const reason = `webhook responded ${response.status}`;
    console.error("[marketing] lead webhook failed", { leadId: input.leadId ?? null, reason });
    return { attempted: true, delivered: false, reason };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown webhook error";
    console.error("[marketing] lead webhook failed", { leadId: input.leadId ?? null, reason });
    return { attempted: true, delivered: false, reason };
  }
}
