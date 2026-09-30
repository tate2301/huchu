/**
 * The inbound half of the Facebook Lead Ads seam.
 *
 * Order of operations, and it is the whole design: **verify, route, record,
 * deduplicate, only then fetch and apply.**
 *
 * Verifying comes first now that one Meta app serves every tenant: the secret
 * that authenticates a delivery is the deployment's, so a signature can be
 * checked before anything is looked up. Nothing that follows touches the
 * database until the bytes are proven to be Meta's.
 *
 * Routing is then by Page. A delivery names its Page in `entry[].id` and
 * carries no other id, which is why `CrmFacebookConnection.pageId` is globally
 * unique — with one callback URL for the whole deployment, two workspaces
 * claiming one Page would make a lead's owner a coin toss.
 *
 * Recording before fetching is what makes a Graph call that fails
 * halfway visible: the `CrmFacebookLeadEvent` row exists with its error and
 * can be retried, instead of being a lead a customer filled in that nobody
 * ever saw. And the unique key on (pageId, leadgenId) is what makes Meta's
 * retries — which it sends for anything it did not get a 200 for, and
 * sometimes for things it did — an observable no-op rather than a second lead.
 *
 * Everything past a verified signature answers 200, including a lead we failed
 * to fetch. Meta disables a webhook that keeps erroring, and losing the
 * subscription over one bad token would cost every later lead as well as this
 * one; the failed rows are the retry queue instead.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ingestLead } from "@/lib/crm/intake-ingest";

import { facebookAppConfig } from "./app";
import { mapLeadFields } from "./field-mapping";
import { GraphApiError, fetchLeadgen, type LeadgenRecord } from "./graph";
import { decryptSecret } from "./secrets";
import { SIGNATURE_HEADER, verifySignature, verifyTokenMatches } from "./signature";

export type LeadEventStatus = "RECEIVED" | "INGESTED" | "DUPLICATE" | "IGNORED" | "FAILED";

/** Everything a delivery needs, decrypted once per request. */
type ResolvedConnection = {
  id: string;
  companyId: string;
  pageId: string;
  pageAccessToken: string;
  formIds: string[];
  defaultChannel: string;
  defaultSourceLabel: string | null;
  defaultAssigneeId: string | null;
  isActive: boolean;
};

const CONNECTION_SELECT = {
  id: true,
  companyId: true,
  pageId: true,
  pageAccessTokenEnc: true,
  formIds: true,
  defaultChannel: true,
  defaultSourceLabel: true,
  defaultAssigneeId: true,
  isActive: true,
} as const;

type ConnectionRow = {
  id: string;
  companyId: string;
  pageId: string;
  pageAccessTokenEnc: string;
  formIds: string[];
  defaultChannel: string;
  defaultSourceLabel: string | null;
  defaultAssigneeId: string | null;
  isActive: boolean;
};

function resolve(row: ConnectionRow): ResolvedConnection {
  return {
    id: row.id,
    companyId: row.companyId,
    pageId: row.pageId,
    pageAccessToken: decryptSecret(row.pageAccessTokenEnc),
    formIds: row.formIds,
    defaultChannel: row.defaultChannel,
    defaultSourceLabel: row.defaultSourceLabel,
    defaultAssigneeId: row.defaultAssigneeId,
    isActive: row.isActive,
  };
}

/** The one lookup a delivery gets. `pageId` is unique across the deployment,
 *  so this either finds the workspace that owns the Page or nobody does. */
async function loadConnectionByPage(pageId: string): Promise<ResolvedConnection | null> {
  const row = await prisma.crmFacebookConnection.findUnique({
    where: { pageId },
    select: CONNECTION_SELECT,
  });
  return row ? resolve(row as ConnectionRow) : null;
}

function noteConnectionError(connectionId: string, error: string): void {
  void prisma.crmFacebookConnection
    .update({ where: { id: connectionId }, data: { lastError: error, lastErrorAt: new Date() } })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// GET — Meta's subscription handshake
// ---------------------------------------------------------------------------

export type VerificationResult =
  | { ok: true; challenge: string }
  | { ok: false; status: 400 | 403 | 500; error: string };

/**
 * Answer `hub.challenge` with the challenge itself, as plain text.
 *
 * Meta compares the response body byte for byte, so a JSON wrapper — the house
 * shape for every other route here — fails the handshake with a 200. The route
 * returns text for this one reason.
 *
 * One app, one webhook, one handshake: this runs once when the callback URL is
 * saved in the Meta dashboard, and again whenever somebody re-verifies it. It
 * has nothing to do with any particular tenant.
 */
export function verifyWebhookSubscription(input: {
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
}): VerificationResult {
  let expected: string;
  try {
    expected = facebookAppConfig().webhookVerifyToken;
  } catch (error) {
    // Ours to fix, not Meta's. 500 so the dashboard shows a failure an
    // operator can act on rather than a silent refusal.
    return { ok: false, status: 500, error: error instanceof Error ? error.message : "Facebook app is not configured" };
  }

  if (input.mode !== "subscribe") return { ok: false, status: 400, error: "Unsupported hub.mode" };
  if (!input.challenge) return { ok: false, status: 400, error: "Missing hub.challenge" };
  if (!verifyTokenMatches(input.verifyToken, expected)) {
    return { ok: false, status: 403, error: "Verify token mismatch" };
  }

  return { ok: true, challenge: input.challenge };
}

// ---------------------------------------------------------------------------
// POST — a delivery
// ---------------------------------------------------------------------------

/** The slice of Meta's envelope we read. Everything else in it is ignored. */
type LeadgenChangeValue = {
  leadgen_id?: string;
  page_id?: string | number;
  form_id?: string | number;
  ad_id?: string | number;
  adgroup_id?: string | number;
  created_time?: number;
};

export type DeliveryOutcome = {
  leadgenId: string;
  status: LeadEventStatus;
  leadId?: string;
  error?: string;
};

export type WebhookResult = {
  httpStatus: number;
  outcome: "UNVERIFIED" | "UNREADABLE" | "PROCESSED";
  results: DeliveryOutcome[];
  error?: string;
};

export async function handleFacebookWebhook(input: {
  /** The bytes as delivered. The signature is over these; re-serialising a
   *  parsed body changes them and fails every real delivery. */
  rawBody: string;
  headers: Record<string, string>;
}): Promise<WebhookResult> {
  let appSecret: string;
  try {
    appSecret = facebookAppConfig().appSecret;
  } catch (error) {
    // Our deployment is misconfigured, not Meta's delivery. 500 so Meta
    // retries once somebody sets the variable, instead of a real lead being
    // refused and forgotten.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[facebook-webhook] app is not configured:", message);
    return { httpStatus: 500, outcome: "UNREADABLE", results: [], error: message };
  }

  // Nothing below this line touches the database until the bytes are proven
  // to be Meta's. The URL is public, so an unsigned POST must cost a hash and
  // nothing else — no lookup, no row, no write.
  const check = verifySignature(input.rawBody, input.headers[SIGNATURE_HEADER], appSecret);
  if (!check.ok) {
    return { httpStatus: 401, outcome: "UNVERIFIED", results: [], error: `Signature ${check.reason.toLowerCase()}` };
  }

  let payload: { object?: string; entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: LeadgenChangeValue }> }> };
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return { httpStatus: 400, outcome: "UNREADABLE", results: [], error: "Body is not JSON" };
  }

  const results: DeliveryOutcome[] = [];
  /** One delivery can carry several entries for the same Page; resolving each
   *  Page once keeps a batch to one lookup and one decryption per Page. */
  const byPage = new Map<string, ResolvedConnection | null>();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const value = change.value ?? {};
      const leadgenId = String(value.leadgen_id ?? "").trim();
      if (!leadgenId) continue;

      const pageId = String(value.page_id ?? entry.id ?? "").trim();
      if (!pageId) {
        results.push({ leadgenId, status: "IGNORED", error: "Delivery named no Page" });
        continue;
      }

      if (!byPage.has(pageId)) {
        try {
          byPage.set(pageId, await loadConnectionByPage(pageId));
        } catch (error) {
          // Decryption failed — the encryption key was rotated out from under
          // a stored token. 500 so Meta retries once it is fixed.
          const message = error instanceof Error ? error.message : String(error);
          console.error("[facebook-webhook] connection could not be read:", message);
          return { httpStatus: 500, outcome: "UNREADABLE", results: [], error: message };
        }
      }

      const connection = byPage.get(pageId) ?? null;
      if (!connection) {
        // Genuinely from Meta, for a Page nobody here has connected — a Page
        // subscribed to the app and then disconnected in the CRM, most often.
        // Answered 200: erroring would have Meta retry forever over a lead
        // that has no owner to give it to.
        results.push({ leadgenId, status: "IGNORED", error: `No workspace has connected page ${pageId}` });
        continue;
      }

      if (!connection.isActive) {
        // Paused here on purpose. Also 200, so Meta does not eventually
        // unsubscribe a Page somebody intends to switch back on.
        results.push({ leadgenId, status: "IGNORED", error: "This Page is paused" });
        continue;
      }

      results.push(await processDelivery(connection, pageId, leadgenId, value, input.rawBody));
    }
  }

  const touched = [...byPage.values()].filter((c): c is ResolvedConnection => c !== null);
  if (touched.length) {
    await prisma.crmFacebookConnection
      .updateMany({ where: { id: { in: touched.map((c) => c.id) } }, data: { lastEventAt: new Date() } })
      .catch(() => {});
  }

  return { httpStatus: 200, outcome: "PROCESSED", results };
}

async function processDelivery(
  connection: ResolvedConnection,
  pageId: string,
  leadgenId: string,
  value: LeadgenChangeValue,
  rawBody: string,
): Promise<DeliveryOutcome> {
  const formId = value.form_id != null ? String(value.form_id) : null;

  let event: { id: string };
  try {
    event = await prisma.crmFacebookLeadEvent.create({
      data: {
        connectionId: connection.id,
        companyId: connection.companyId,
        leadgenId,
        pageId,
        formId: formId ?? undefined,
        adId: value.ad_id != null ? String(value.ad_id) : undefined,
        adgroupId: value.adgroup_id != null ? String(value.adgroup_id) : undefined,
        status: "RECEIVED",
        signatureVerified: true,
        payloadJson: rawBody,
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // The unique key did its job. Answered as a success and changing
      // nothing — the first delivery's outcome stands.
      return { leadgenId, status: "DUPLICATE" };
    }
    throw error;
  }

  if (connection.formIds.length && (!formId || !connection.formIds.includes(formId))) {
    await prisma.crmFacebookLeadEvent.update({
      where: { id: event.id },
      data: {
        status: "IGNORED",
        processedAt: new Date(),
        error: `Form ${formId ?? "unknown"} is not in this connection's allowed forms`,
      },
    });
    return { leadgenId, status: "IGNORED" };
  }

  return ingestDelivery(connection, event.id, leadgenId);
}

/**
 * Fetch the answers and create the lead. Shared by a live delivery and by a
 * retry of one that failed, because they are the same work — a retry differs
 * only in already having a row.
 */
async function ingestDelivery(
  connection: ResolvedConnection,
  eventId: string,
  leadgenId: string,
): Promise<DeliveryOutcome> {
  let record: LeadgenRecord;
  try {
    record = await fetchLeadgen(leadgenId, {
      accessToken: connection.pageAccessToken,
      appSecret: facebookAppConfig().appSecret,
    });
  } catch (error) {
    const message =
      error instanceof GraphApiError && error.isAuthFailure
        ? `${error.message} — reconnect this Page to refresh its access token.`
        : error instanceof Error
          ? error.message
          : String(error);
    await failEvent(eventId, message);
    noteConnectionError(connection.id, message);
    return { leadgenId, status: "FAILED", error: message };
  }

  const mapped = mapLeadFields(record.field_data);

  try {
    const lead = await ingestLead({
      companyId: connection.companyId,
      contactName: mapped.contactName,
      email: mapped.email,
      phone: mapped.phone,
      message: mapped.message,
      answers: {
        ...mapped.answers,
        ...(mapped.companyName ? { Company: mapped.companyName } : {}),
        ...(mapped.jobTitle ? { "Job title": mapped.jobTitle } : {}),
        ...(mapped.address ? { Address: mapped.address } : {}),
        "Facebook lead id": leadgenId,
        ...(record.form_id ? { "Lead form id": record.form_id } : {}),
        ...(record.ad_name ? { Ad: record.ad_name } : {}),
        ...(record.campaign_name ? { Campaign: record.campaign_name } : {}),
      },
      source: connection.defaultSourceLabel ?? "Facebook Lead Ads",
      origin: "WEBHOOK",
      // An organic Page-post lead is not paid traffic, and counting it as ad
      // spend is how a source report starts lying about what the ads did.
      explicitChannel: record.is_organic ? "SOCIAL" : connection.defaultChannel,
      utmSource: record.platform === "ig" ? "instagram" : "facebook",
      utmMedium: record.is_organic ? "social" : "paid_social",
      utmCampaign: record.campaign_name ?? record.campaign_id ?? null,
      utmContent: record.ad_name ?? record.ad_id ?? null,
      utmTerm: record.form_id ?? null,
      defaultAssigneeId: connection.defaultAssigneeId,
    });

    await prisma.crmFacebookLeadEvent.update({
      where: { id: eventId },
      data: {
        status: "INGESTED",
        leadId: lead.leadId,
        formId: record.form_id ?? undefined,
        adId: record.ad_id ?? undefined,
        adgroupId: record.adset_id ?? undefined,
        campaignId: record.campaign_id ?? undefined,
        fieldsJson: JSON.stringify(record.field_data ?? []),
        processedAt: new Date(),
        error: null,
      },
    });

    return { leadgenId, status: "INGESTED", leadId: lead.leadId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The answers were fetched even though the lead was not created, and Meta
    // stops serving them after 90 days — so they are stored here and a retry
    // has something to work from.
    await failEvent(eventId, message, JSON.stringify(record.field_data ?? []));
    noteConnectionError(connection.id, message);
    return { leadgenId, status: "FAILED", error: message };
  }
}

async function failEvent(eventId: string, error: string, fieldsJson?: string): Promise<void> {
  await prisma.crmFacebookLeadEvent
    .update({
      where: { id: eventId },
      data: {
        status: "FAILED",
        error: error.slice(0, 1000),
        processedAt: new Date(),
        ...(fieldsJson ? { fieldsJson } : {}),
      },
    })
    .catch(() => {});
}

/**
 * Run a failed delivery again, from the settings screen.
 *
 * The thing that failed is almost always a token, and the fix is almost always
 * outside this system — so the retry has to be something an operator can press
 * after fixing it, not a schedule that has already given up.
 */
export async function retryLeadEvent(
  companyId: string,
  eventId: string,
): Promise<DeliveryOutcome | { leadgenId: null; status: "FAILED"; error: string }> {
  const event = await prisma.crmFacebookLeadEvent.findFirst({
    where: { id: eventId, companyId },
    select: { id: true, leadgenId: true, status: true, connectionId: true },
  });
  if (!event) return { leadgenId: null, status: "FAILED", error: "Delivery not found" };
  if (event.status === "INGESTED") {
    return { leadgenId: event.leadgenId, status: "DUPLICATE", error: "This lead was already created" };
  }
  if (!event.connectionId) {
    return { leadgenId: event.leadgenId, status: "FAILED", error: "This delivery has no connection to retry against" };
  }

  const row = await prisma.crmFacebookConnection.findFirst({
    where: { id: event.connectionId, companyId },
    select: CONNECTION_SELECT,
  });
  if (!row) return { leadgenId: event.leadgenId, status: "FAILED", error: "Connection no longer exists" };

  return ingestDelivery(resolve(row as ConnectionRow), event.id, event.leadgenId);
}
