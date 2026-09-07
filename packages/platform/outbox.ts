/**
 * The outbox, and the webhooks it feeds.
 *
 * A module announces what happened by writing an event in the transaction
 * that made it happen (`emitOutboxEvent(tx, …)`): an event is never announced
 * for a change that rolled back and never lost for one that committed. The
 * event fans out, at that moment, to the workspace's active endpoints whose
 * subscription matches its type — one delivery row each. A worker claims the
 * deliveries that are due, posts each to its endpoint signed with the
 * endpoint's secret, and records what came back: delivered, retry later with
 * exponential backoff, or given up after `maxAttempts`.
 *
 * Claiming is a lease, as the fiscal drain's is: one statement pushes
 * `nextAttemptAt` forward under `FOR UPDATE SKIP LOCKED`, so two workers never
 * post the same delivery and a worker that dies mid-attempt leaves a row that
 * comes back on its own.
 *
 * The request a subscriber receives:
 *   POST <url>
 *   Content-Type: application/json
 *   X-Corelith-Event: <type>
 *   X-Corelith-Delivery: <delivery id>
 *   X-Corelith-Signature: t=<unix seconds>,v1=<hex hmac-sha256(secret, `${t}.${body}`)>
 *   body: { id, type, createdAt, companyId, data }
 * A subscriber verifies by recomputing v1 over the raw body with its secret
 * and refusing a `t` older than it likes.
 */
import { createHmac, randomBytes } from "node:crypto";

import type { Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";

export type OutboxDb = Prisma.TransactionClient | typeof prisma;

export const WEBHOOK_DELIVERY_DEFAULTS = {
  batchSize: 25,
  maxAttempts: 8,
  leaseMs: 60_000,
  timeoutMs: 10_000,
} as const;

const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 12 * 60 * 60 * 1000;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function webhookSignatureHeader(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${signWebhook(secret, timestamp, body)}`;
}

/** Whether a subscription (`*`, `books.*`, or an exact type) covers an event type. */
export function endpointSubscribes(events: readonly string[], type: string): boolean {
  return events.some((entry) => entry === "*" || entry === type || (entry.endsWith(".*") && type.startsWith(entry.slice(0, -1))));
}

/** Exponential backoff, capped: attempt 1 waits a minute, attempt 8 waits the twelve-hour ceiling. */
export function webhookRetryDelayMs(attemptCount: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(attemptCount - 1, 0), RETRY_MAX_MS);
}

/**
 * Write the event and its deliveries. Pass the transaction the change is being
 * made in; outside one, `prisma` itself. Returns how many endpoints will hear it.
 */
export async function emitOutboxEvent(
  db: OutboxDb,
  input: { companyId: string; type: string; payload: Record<string, unknown> },
): Promise<{ eventId: string; deliveries: number }> {
  const endpoints = await db.platformWebhookEndpoint.findMany({
    where: { companyId: input.companyId, active: true },
    select: { id: true, events: true },
  });
  const subscribed = endpoints.filter((endpoint) => endpointSubscribes(endpoint.events, input.type));
  const event = await db.platformOutboxEvent.create({
    data: { companyId: input.companyId, type: input.type, payload: input.payload as Prisma.InputJsonValue },
    select: { id: true },
  });
  if (subscribed.length > 0) {
    await db.platformWebhookDelivery.createMany({
      data: subscribed.map((endpoint) => ({ eventId: event.id, endpointId: endpoint.id, nextAttemptAt: new Date() })),
    });
  }
  return { eventId: event.id, deliveries: subscribed.length };
}

export type ClaimedWebhookDelivery = {
  id: string;
  attemptCount: number;
  eventId: string;
  endpointId: string;
};

/** Claim up to `batchSize` due deliveries for this worker; the lease is `leaseMs` of invisibility. */
export async function claimDueWebhookDeliveries(args: {
  batchSize: number;
  maxAttempts: number;
  leaseMs: number;
  companyId?: string | null;
}): Promise<ClaimedWebhookDelivery[]> {
  const leaseSeconds = Math.max(1, Math.round(args.leaseMs / 1000));
  const companyId = args.companyId ?? null;
  return prisma.$queryRaw<ClaimedWebhookDelivery[]>`
    UPDATE "PlatformWebhookDelivery" AS d
       SET "nextAttemptAt" = NOW() + make_interval(secs => ${leaseSeconds}::double precision),
           "updatedAt"     = NOW()
      FROM (
             SELECT x."id"
               FROM "PlatformWebhookDelivery" x
              WHERE x."status" = 'PENDING'::"PlatformWebhookDeliveryStatus"
                AND (x."nextAttemptAt" IS NULL OR x."nextAttemptAt" <= NOW())
                AND x."attemptCount" < ${args.maxAttempts}
                AND (${companyId}::text IS NULL OR EXISTS (
                      SELECT 1 FROM "PlatformOutboxEvent" e WHERE e."id" = x."eventId" AND e."companyId" = ${companyId}::text
                    ))
              ORDER BY COALESCE(x."nextAttemptAt", x."createdAt") ASC, x."createdAt" ASC
              LIMIT ${args.batchSize}
                FOR UPDATE SKIP LOCKED
           ) AS due
     WHERE d."id" = due."id"
    RETURNING d."id", d."attemptCount", d."eventId", d."endpointId"
  `;
}

export type WebhookFetch = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number }>;

export type WebhookDeliveryOutcome = {
  deliveryId: string;
  outcome: "DELIVERED" | "RETRY" | "GAVE_UP" | "SKIPPED";
  statusCode: number | null;
  error: string | null;
};

/** Post one claimed delivery and record what happened. */
export async function deliverWebhook(
  claimed: ClaimedWebhookDelivery,
  deps: { fetch: WebhookFetch; maxAttempts: number; timeoutMs: number; now: () => Date },
): Promise<WebhookDeliveryOutcome> {
  const delivery = await prisma.platformWebhookDelivery.findUnique({
    where: { id: claimed.id },
    select: {
      id: true,
      attemptCount: true,
      event: { select: { id: true, type: true, companyId: true, payload: true, createdAt: true } },
      endpoint: { select: { id: true, url: true, secret: true, active: true } },
    },
  });
  if (!delivery) return { deliveryId: claimed.id, outcome: "SKIPPED", statusCode: null, error: "delivery vanished" };
  if (!delivery.endpoint.active) {
    await prisma.platformWebhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", lastError: "endpoint deactivated", nextAttemptAt: null },
    });
    return { deliveryId: delivery.id, outcome: "GAVE_UP", statusCode: null, error: "endpoint deactivated" };
  }

  const timestamp = Math.floor(deps.now().getTime() / 1000);
  const body = JSON.stringify({
    id: delivery.event.id,
    type: delivery.event.type,
    createdAt: delivery.event.createdAt.toISOString(),
    companyId: delivery.event.companyId,
    data: delivery.event.payload,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const response = await deps.fetch(delivery.endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Corelith-Event": delivery.event.type,
        "X-Corelith-Delivery": delivery.id,
        "X-Corelith-Signature": webhookSignatureHeader(delivery.endpoint.secret, timestamp, body),
      },
      body,
      signal: controller.signal,
    });
    statusCode = response.status;
    if (response.status < 200 || response.status >= 300) error = `endpoint answered ${response.status}`;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    clearTimeout(timer);
  }

  const attemptCount = delivery.attemptCount + 1;
  if (!error) {
    await prisma.platformWebhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "DELIVERED", attemptCount, lastStatusCode: statusCode, lastError: null, deliveredAt: deps.now(), nextAttemptAt: null },
    });
    return { deliveryId: delivery.id, outcome: "DELIVERED", statusCode, error: null };
  }
  const gaveUp = attemptCount >= deps.maxAttempts;
  await prisma.platformWebhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: gaveUp ? "FAILED" : "PENDING",
      attemptCount,
      lastStatusCode: statusCode,
      lastError: error.slice(0, 500),
      nextAttemptAt: gaveUp ? null : new Date(deps.now().getTime() + webhookRetryDelayMs(attemptCount)),
    },
  });
  return { deliveryId: delivery.id, outcome: gaveUp ? "GAVE_UP" : "RETRY", statusCode, error };
}

export type WebhookPassResult = {
  claimed: number;
  delivered: number;
  retried: number;
  gaveUp: number;
  skipped: number;
  outcomes: WebhookDeliveryOutcome[];
};

const defaultFetch: WebhookFetch = async (url, init) => {
  const response = await fetch(url, init);
  return { status: response.status };
};

/** One pass: claim what is due, post each, record each. Safe to run from many workers at once. */
export async function deliverDueWebhooks(args: {
  batchSize?: number;
  maxAttempts?: number;
  leaseMs?: number;
  timeoutMs?: number;
  companyId?: string | null;
  fetch?: WebhookFetch;
  now?: () => Date;
} = {}): Promise<WebhookPassResult> {
  const batchSize = args.batchSize ?? WEBHOOK_DELIVERY_DEFAULTS.batchSize;
  const maxAttempts = args.maxAttempts ?? WEBHOOK_DELIVERY_DEFAULTS.maxAttempts;
  const leaseMs = args.leaseMs ?? WEBHOOK_DELIVERY_DEFAULTS.leaseMs;
  const timeoutMs = args.timeoutMs ?? WEBHOOK_DELIVERY_DEFAULTS.timeoutMs;
  const deps = { fetch: args.fetch ?? defaultFetch, maxAttempts, timeoutMs, now: args.now ?? (() => new Date()) };
  const claimed = await claimDueWebhookDeliveries({ batchSize, maxAttempts, leaseMs, companyId: args.companyId });
  const outcomes: WebhookDeliveryOutcome[] = [];
  for (const row of claimed) outcomes.push(await deliverWebhook(row, deps));
  return {
    claimed: claimed.length,
    delivered: outcomes.filter((o) => o.outcome === "DELIVERED").length,
    retried: outcomes.filter((o) => o.outcome === "RETRY").length,
    gaveUp: outcomes.filter((o) => o.outcome === "GAVE_UP").length,
    skipped: outcomes.filter((o) => o.outcome === "SKIPPED").length,
    outcomes,
  };
}
