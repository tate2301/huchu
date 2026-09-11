/**
 * The inbound half of the Facebook Lead Ads seam.
 *
 * Order of operations, and it is the whole design: **route, verify, record,
 * deduplicate, only then fetch and apply.**
 *
 * Routing comes before verifying because the app secret that verifies a
 * delivery is per-tenant — it lives on the connection the callback token
 * names, so there is nothing to check a signature against until the row is
 * loaded. Recording before fetching is what makes a Graph call that fails
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
  appSecret: string;
  pageAccessToken: string;
  verifyToken: string;
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
  appSecretEnc: true,
  pageAccessTokenEnc: true,
  verifyToken: true,
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
  appSecretEnc: string;
  pageAccessTokenEnc: string;
  verifyToken: string;
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
    appSecret: decryptSecret(row.appSecretEnc),
    pageAccessToken: decryptSecret(row.pageAccessTokenEnc),
    verifyToken: row.verifyToken,
    formIds: row.formIds,
    defaultChannel: row.defaultChannel,
    defaultSourceLabel: row.defaultSourceLabel,
    defaultAssigneeId: row.defaultAssigneeId,
    isActive: row.isActive,
  };
}

async function loadConnection(callbackToken: string): Promise<ResolvedConnection | null> {
  const row = await prisma.crmFacebookConnection.findUnique({
    where: { callbackToken },
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
  | { ok: false; status: 400 | 403 | 404; error: string };

/**
 * Answer `hub.challenge` with the challenge itself, as plain text.
 *
 * Meta compares the response body byte for byte, so a JSON wrapper — the house
 * shape for every other route here — fails the handshake with a 200. The route
 * returns text for this one reason.
 */
export async function verifyWebhookSubscription(input: {
  callbackToken: string;
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
}): Promise<VerificationResult> {
  const connection = await loadConnectionForVerification(input.callbackToken);
  if (!connection) return { ok: false, status: 404, error: "Unknown callback URL" };

  if (input.mode !== "subscribe") return { ok: false, status: 400, error: "Unsupported hub.mode" };
  if (!input.challenge) return { ok: false, status: 400, error: "Missing hub.challenge" };

  if (!verifyTokenMatches(input.verifyToken, connection.verifyToken)) {
    noteConnectionError(connection.id, "Verification failed: the token Meta sent did not match this connection's verify token.");
    return { ok: false, status: 403, error: "Verify token mismatch" };
  }

  await prisma.crmFacebookConnection.update({
    where: { id: connection.id },
    data: { verifiedAt: new Date(), lastError: null, lastErrorAt: null },
  });

  return { ok: true, challenge: input.challenge };
}

/** The handshake needs the verify token and nothing encrypted, so it does not
 *  pay for a decryption that would fail loudly on a half-configured row. */
async function loadConnectionForVerification(
  callbackToken: string,
): Promise<{ id: string; verifyToken: string } | null> {
  return prisma.crmFacebookConnection.findUnique({
    where: { callbackToken },
    select: { id: true, verifyToken: true },
  });
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
  outcome: "UNKNOWN_CALLBACK" | "INACTIVE" | "UNVERIFIED" | "UNREADABLE" | "PROCESSED";
  results: DeliveryOutcome[];
  error?: string;
};

export async function handleFacebookWebhook(input: {
  callbackToken: string;
  /** The bytes as delivered. The signature is over these; re-serialising a
   *  parsed body changes them and fails every real delivery. */
  rawBody: string;
  headers: Record<string, string>;
}): Promise<WebhookResult> {
  let connection: ResolvedConnection | null;
  try {
    connection = await loadConnection(input.callbackToken);
  } catch (error) {
    // Decryption failed — the encryption key was rotated out from under a
    // stored secret. 500 so Meta retries once it is fixed, rather than
    // treating a real lead as refused.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[facebook-webhook] connection could not be read:", message);
    return { httpStatus: 500, outcome: "UNREADABLE", results: [], error: message };
  }

  if (!connection) {
    return { httpStatus: 404, outcome: "UNKNOWN_CALLBACK", results: [], error: "Unknown callback URL" };
  }

  const check = verifySignature(input.rawBody, input.headers[SIGNATURE_HEADER], connection.appSecret);
  if (!check.ok) {
    // Deliberately not recorded as an event row, unlike the payment webhook's
    // unverified deliveries: this endpoint's URL is public, so a row per
    // unsigned POST is a table anybody can fill. The connection carries the
    // signal instead — a rotated app secret reads as a standing error here,
    // which is the case that matters.
    noteConnectionError(
      connection.id,
      `Signature check failed (${check.reason}). The app secret saved here may not match the Meta app sending deliveries.`,
    );
    return { httpStatus: 401, outcome: "UNVERIFIED", results: [], error: `Signature ${check.reason.toLowerCase()}` };
  }

  if (!connection.isActive) {
    // Verified, so it is genuinely Meta — but this Page was paused here. 200,
    // because erroring would have Meta retry and eventually unsubscribe a
    // connection somebody intends to switch back on.
    return { httpStatus: 200, outcome: "INACTIVE", results: [] };
  }

  let payload: { object?: string; entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: LeadgenChangeValue }> }> };
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return { httpStatus: 400, outcome: "UNREADABLE", results: [], error: "Body is not JSON" };
  }

  const results: DeliveryOutcome[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const value = change.value ?? {};
      const leadgenId = String(value.leadgen_id ?? "").trim();
      if (!leadgenId) continue;

      results.push(await processDelivery(connection, entry.id ?? null, leadgenId, value, input.rawBody));
    }
  }

  await prisma.crmFacebookConnection
    .update({ where: { id: connection.id }, data: { lastEventAt: new Date() } })
    .catch(() => {});

  return { httpStatus: 200, outcome: "PROCESSED", results };
}

async function processDelivery(
  connection: ResolvedConnection,
  entryPageId: string | null,
  leadgenId: string,
  value: LeadgenChangeValue,
  rawBody: string,
): Promise<DeliveryOutcome> {
  const pageId = String(value.page_id ?? entryPageId ?? connection.pageId);
  const formId = value.form_id != null ? String(value.form_id) : null;

  // The signature proves the app sent it; it does not prove the app only ever
  // sends this tenant's Pages. One app can serve several, so a delivery for a
  // Page this connection does not own is filed against nobody's CRM.
  if (pageId !== connection.pageId) {
    return { leadgenId, status: "IGNORED", error: `Delivery is for page ${pageId}, which this connection does not own` };
  }

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
      appSecret: connection.appSecret,
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
