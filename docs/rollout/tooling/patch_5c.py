import pathlib, json
ROOT = pathlib.Path("/home/user/huchu")
def edit(path, old, new, count=1):
    p = ROOT / path; s = p.read_text(); n = s.count(old)
    assert n == count, f"{path}: expected {count} of {old[:60]!r}, found {n}"
    p.write_text(s.replace(old, new)); print("edited", path)
def write(path, s):
    p = ROOT / path; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(s); print("wrote", path)

# --- the schema
edit("packages/db/prisma/schema/platform.prisma", "  platformApiKeys               PlatformApiKey[]\n", "  platformApiKeys               PlatformApiKey[]\n  platformWebhookEndpoints      PlatformWebhookEndpoint[]\n  platformOutboxEvents          PlatformOutboxEvent[]\n")
edit("packages/db/prisma/schema/platform.prisma", '  platformApiKeysCreated            PlatformApiKey[]               @relation("PlatformApiKeyCreatedBy")\n',
     '  platformApiKeysCreated            PlatformApiKey[]               @relation("PlatformApiKeyCreatedBy")\n  platformWebhookEndpointsCreated   PlatformWebhookEndpoint[]      @relation("PlatformWebhookEndpointCreatedBy")\n')
p = ROOT / "packages/db/prisma/schema/platform.prisma"; p.write_text(p.read_text().rstrip("\n") + '''

/// An address a workspace wants told when something happens. The outbox
/// delivers the events it subscribes to (`events`, `*` for every one, or a
/// prefix such as `books.*`), each request signed with `secret`, which is
/// shown once at creation. Deactivating keeps the row and its deliveries.
model PlatformWebhookEndpoint {
  id          String   @id @default(uuid())
  companyId   String
  url         String
  secret      String
  events      String[]
  active      Boolean  @default(true)
  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  company    Company                   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  createdBy  User?                     @relation("PlatformWebhookEndpointCreatedBy", fields: [createdById], references: [id])
  deliveries PlatformWebhookDelivery[]

  @@index([companyId, active])
}

/// Something that happened, written in the transaction that made it happen:
/// never announced for a change that rolled back, never lost for one that
/// committed. Fanned out to the endpoints subscribed at the time.
model PlatformOutboxEvent {
  id        String   @id @default(uuid())
  companyId String
  type      String
  payload   Json
  createdAt DateTime @default(now())

  company    Company                   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  deliveries PlatformWebhookDelivery[]

  @@index([companyId, createdAt])
}

enum PlatformWebhookDeliveryStatus {
  PENDING
  DELIVERED
  FAILED
}

/// One event to one endpoint: claimed by a worker, attempted, backed off,
/// delivered or given up. Never deleted, so the audit reads whole.
model PlatformWebhookDelivery {
  id             String                        @id @default(uuid())
  eventId        String
  endpointId     String
  status         PlatformWebhookDeliveryStatus @default(PENDING)
  attemptCount   Int                           @default(0)
  nextAttemptAt  DateTime?
  lastStatusCode Int?
  lastError      String?
  deliveredAt    DateTime?
  createdAt      DateTime                      @default(now())
  updatedAt      DateTime                      @updatedAt

  event    PlatformOutboxEvent     @relation(fields: [eventId], references: [id], onDelete: Cascade)
  endpoint PlatformWebhookEndpoint @relation(fields: [endpointId], references: [id], onDelete: Cascade)

  @@index([status, nextAttemptAt])
  @@index([endpointId, createdAt])
}
'''); print("appended outbox models")

# --- the manifest: a module declares the events it announces
edit("packages/platform/manifest.ts", "export type ModuleManifest = {\n  id: ModuleId;", '''/** An event a module announces through the outbox, for the endpoints page to offer and the docs to list. */
export type OutboxEventEntry = {
  type: string;
  description: string;
};

export type ModuleManifest = {
  id: ModuleId;''')
edit("packages/platform/manifest.ts", "  /** Routes only some roles may reach. */\n  roleRestrictedRoutes?: readonly RoleRestrictedRoutes[];\n};",
     "  /** Routes only some roles may reach. */\n  roleRestrictedRoutes?: readonly RoleRestrictedRoutes[];\n  /** The events the module announces through the outbox. */\n  events?: readonly OutboxEventEntry[];\n};")
edit("packages/platform/manifest.ts", "/** Every route the registered modules gate; the route registry reads these beside its own. */",
     "/** Every event the registered modules announce through the outbox. */\nexport function registeredOutboxEvents(): OutboxEventEntry[] {\n  return registeredModules().flatMap((manifest) => [...(manifest.events ?? [])]);\n}\n\n/** Every route the registered modules gate; the route registry reads these beside its own. */")
edit("packages/modules/workflow/manifest.ts", '  id: "workflow",\n', '  id: "workflow",\n  events: [{ type: "workflow.approval.actioned", description: "An approval was submitted, approved or rejected." }],\n')
edit("packages/modules/books/manifest.ts", '  requires: ["documents", "notifications"],\n', '''  requires: ["documents", "notifications"],
  events: [
    { type: "books.sales-invoice.created", description: "A sales invoice was issued." },
    { type: "books.sales-receipt.created", description: "A sales receipt was recorded." },
  ],
''')

# --- the kernel
write("packages/platform/outbox.ts", '''/**
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
''')

# --- the routes
write("packages/platform/api/v2/webhooks/route.ts", '''import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@corelithzw/db/client";
import { errorResponse, hasRole, successResponse, validateSession } from "../../../api-utils";
import { registeredOutboxEvents } from "../../../manifest";
import { endpointSubscribes, generateWebhookSecret } from "../../../outbox";

/**
 * A workspace's webhook endpoints: what exists, and registering one. The
 * signing secret comes back once, in the creation response, and never again.
 * A subscription names event types the composed modules announce, `*`, or a
 * module prefix such as `books.*`.
 */
const ENDPOINT_SELECT = {
  id: true,
  url: true,
  events: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

const createSchema = z.object({
  url: z.string().trim().url().max(2000).refine((value) => value.startsWith("https://"), "The endpoint must be https"),
  events: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const endpoints = await prisma.platformWebhookEndpoint.findMany({
      where: { companyId: session.user.companyId },
      select: {
        ...ENDPOINT_SELECT,
        _count: { select: { deliveries: { where: { status: "PENDING" } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return successResponse({
      data: endpoints.map(({ _count, ...endpoint }) => ({ ...endpoint, pendingDeliveries: _count.deliveries })),
      events: registeredOutboxEvents(),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/webhooks error:", error);
    return errorResponse("Failed to fetch webhook endpoints");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("An https URL and at least one event are required", 400, parsed.error.flatten());
    const events = Array.from(new Set(parsed.data.events));
    const known = registeredOutboxEvents().map((entry) => entry.type);
    const unknown = events.filter((entry) => entry !== "*" && !known.some((type) => endpointSubscribes([entry], type)));
    if (unknown.length > 0) {
      return errorResponse("A subscription must name an event this host announces", 400, { code: "EVENT_UNKNOWN", events: unknown });
    }

    const secret = generateWebhookSecret();
    const created = await prisma.platformWebhookEndpoint.create({
      data: { companyId: session.user.companyId, url: parsed.data.url, secret, events, createdById: session.user.id },
      select: ENDPOINT_SELECT,
    });
    return successResponse({ data: { ...created, secret } }, 201);
  } catch (error) {
    console.error("[API] POST /api/v2/webhooks error:", error);
    return errorResponse("Failed to register the webhook endpoint");
  }
}
''')
write("packages/platform/api/v2/webhooks/[id]/route.ts", '''import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { errorResponse, hasRole, successResponse, validateSession } from "../../../../api-utils";

/** Deactivating an endpoint. The row and its deliveries stay; pending deliveries are given up on their next claim. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const { id } = await context.params;
    const existing = await prisma.platformWebhookEndpoint.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, active: true },
    });
    if (!existing) return errorResponse("Webhook endpoint not found", 404);
    if (existing.active) {
      await prisma.platformWebhookEndpoint.update({ where: { id: existing.id }, data: { active: false } });
    }
    return successResponse({ data: { id: existing.id, active: false } });
  } catch (error) {
    console.error("[API] DELETE /api/v2/webhooks/[id] error:", error);
    return errorResponse("Failed to deactivate the webhook endpoint");
  }
}
''')
write("packages/platform/api/v2/webhooks/[id]/deliveries/route.ts", '''import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { errorResponse, hasRole, successResponse, validateSession } from "../../../../../api-utils";

/** The last fifty deliveries to one endpoint, newest first: what was sent, what came back, when it will be retried. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const { id } = await context.params;
    const endpoint = await prisma.platformWebhookEndpoint.findFirst({ where: { id, companyId: session.user.companyId }, select: { id: true } });
    if (!endpoint) return errorResponse("Webhook endpoint not found", 404);

    const deliveries = await prisma.platformWebhookDelivery.findMany({
      where: { endpointId: endpoint.id },
      select: {
        id: true,
        status: true,
        attemptCount: true,
        nextAttemptAt: true,
        lastStatusCode: true,
        lastError: true,
        deliveredAt: true,
        createdAt: true,
        event: { select: { id: true, type: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return successResponse({ data: deliveries });
  } catch (error) {
    console.error("[API] GET /api/v2/webhooks/[id]/deliveries error:", error);
    return errorResponse("Failed to fetch webhook deliveries");
  }
}
''')
write("packages/platform/api/v2/webhooks/deliver/route.ts", '''import { NextRequest, NextResponse } from "next/server";

import { errorResponse, hasRole, successResponse, validateSession } from "../../../../api-utils";
import { deliverDueWebhooks } from "../../../../outbox";

/**
 * One delivery pass for this workspace, run by hand. The webhook worker
 * (`pnpm enterprise worker:webhooks`) is what runs it continuously; this is
 * for an operator who wants a stuck queue moved now, and for a deployment
 * without a worker yet.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const { outcomes, ...summary } = await deliverDueWebhooks({ companyId: session.user.companyId });
    return successResponse({ data: { ...summary, outcomes: outcomes.slice(0, 50) } });
  } catch (error) {
    console.error("[API] POST /api/v2/webhooks/deliver error:", error);
    return errorResponse("Failed to deliver webhooks");
  }
}
''')
edit("packages/platform/gating/route-registry.ts", '  { scope: "api", prefix: "/api/v2/api-keys", featureKey: "core.auth.login" },\n',
     '  { scope: "api", prefix: "/api/v2/api-keys", featureKey: "core.auth.login" },\n  { scope: "api", prefix: "/api/v2/webhooks", featureKey: "core.auth.login" },\n')

# --- the worker, in the enterprise host's scripts as the fiscal and PDF workers are
write("apps/enterprise/scripts/webhook-worker.ts", '''/**
 * The webhook worker: deliver the outbox forever.
 *
 * The house shape (`scripts/fiscal-worker.ts`): read the interval from the
 * environment, do one pass, sleep, log what happened, finish the pass in
 * flight on SIGTERM, back off after a failing pass. Rows are claimed, not
 * selected, so running more than one of these is expected and safe. One
 * worker serves every host: the outbox is per workspace, not per product.
 *
 *   pnpm enterprise worker:webhooks
 */
import { WEBHOOK_DELIVERY_DEFAULTS, deliverDueWebhooks } from "@corelithzw/platform/outbox";

function envNumber(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const intervalMs = envNumber("WEBHOOK_WORKER_INTERVAL_MS", 2000);
  const idleMs = envNumber("WEBHOOK_WORKER_IDLE_MS", 15000);
  const errorMs = envNumber("WEBHOOK_WORKER_ERROR_MS", 60000);
  const batchSize = envNumber("WEBHOOK_WORKER_BATCH_SIZE", WEBHOOK_DELIVERY_DEFAULTS.batchSize);
  const maxAttempts = envNumber("WEBHOOK_WORKER_MAX_ATTEMPTS", WEBHOOK_DELIVERY_DEFAULTS.maxAttempts);

  let running = true;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (!running) return;
      running = false;
      console.log(`[webhook-worker] ${signal} received, finishing the pass in flight`);
    });
  }

  console.log(`[webhook-worker] starting (interval=${intervalMs}ms idle=${idleMs}ms batch=${batchSize} maxAttempts=${maxAttempts})`);

  while (running) {
    try {
      const result = await deliverDueWebhooks({ batchSize, maxAttempts });
      if (result.claimed === 0) {
        await sleep(idleMs);
        continue;
      }
      console.log(
        `[webhook-worker] pass claimed=${result.claimed} delivered=${result.delivered} retrying=${result.retried} gaveUp=${result.gaveUp} skipped=${result.skipped}`,
      );
      for (const outcome of result.outcomes) {
        if (outcome.outcome === "GAVE_UP") {
          console.error(`[webhook-worker] gave up on delivery ${outcome.deliveryId}: ${outcome.error ?? "no reason recorded"}`);
        }
      }
      await sleep(intervalMs);
    } catch (error) {
      console.error("[webhook-worker] loop error", error);
      await sleep(errorMs);
    }
  }

  console.log("[webhook-worker] stopped");
}

void main();
''')
edit("apps/enterprise/package.json", '    "worker:fiscal": "tsx scripts/fiscal-worker.ts",\n', '    "worker:fiscal": "tsx scripts/fiscal-worker.ts",\n    "worker:webhooks": "tsx scripts/webhook-worker.ts",\n')

# --- every host announces the events its modules raise
BRIDGE = '''
// What happened, told to the addresses the workspace registered: the outbox
// fans an event out inside the transaction that made it, and the webhook
// worker delivers it signed. The types are the ones the manifests declare.
onApprovalAction(async (tx, event) => {
  await emitOutboxEvent(tx, { companyId: event.companyId, type: "workflow.approval.actioned", payload: { ...event } });
});
onSalesInvoiceCreated(async (event) => {
  await emitOutboxEvent(prisma, { companyId: event.companyId, type: "books.sales-invoice.created", payload: { ...event } });
});
onSalesReceiptCreated(async (event) => {
  await emitOutboxEvent(prisma, { companyId: event.companyId, type: "books.sales-receipt.created", payload: { ...event } });
});
'''
for host in ("enterprise", "campus", "sell", "crm", "people"):
    path = f"apps/{host}/modules.ts"; s = (ROOT / path).read_text()
    if 'from "@corelithzw/module-books/sales-hooks";' not in s:
        s = s.replace('import { registerDocumentSource } from "@corelithzw/module-documents/source-registry";\n',
                      'import { onSalesInvoiceCreated, onSalesReceiptCreated } from "@corelithzw/module-books/sales-hooks";\nimport { registerDocumentSource } from "@corelithzw/module-documents/source-registry";\n', 1)
        assert "sales-hooks" in s, host
    s = s.replace('import { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";\n',
                  'import { prisma } from "@corelithzw/db/client";\nimport { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";\nimport { emitOutboxEvent } from "@corelithzw/platform/outbox";\n', 1)
    anchor = 'registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);\n'
    assert s.count(anchor) == 1, host
    s = s.replace(anchor, anchor + BRIDGE, 1)
    (ROOT / path).write_text(s); print("wired", path)

# --- the preferences page
edit("packages/platform/preferences/nav.ts", '''  {
    id: "sites",
    group: "organization",
    label: "Sites",''', '''  {
    id: "webhooks",
    group: "organization",
    label: "Webhooks",
    href: "/preferences/organization/webhooks",
    description: "Addresses told when something happens, signed.",
  },
  {
    id: "sites",
    group: "organization",
    label: "Sites",''')
edit("packages/platform/preferences/nav.ts", '  if (itemId === "api-keys") return role === "SUPERADMIN" || role === "MANAGER";\n',
     '  if (itemId === "api-keys" || itemId === "webhooks") return role === "SUPERADMIN" || role === "MANAGER";\n')
t = ROOT / "packages/platform/preferences/nav.test.ts"; s = t.read_text()
assert s.count('      "api-keys",\n      "sites",\n') == 2
s = s.replace('      "api-keys",\n      "sites",\n', '      "api-keys",\n      "webhooks",\n      "sites",\n'); t.write_text(s); print("edited nav.test.ts")
write("packages/shell/pages/preferences/organization/webhooks/page.tsx", '''import { WebhooksPreferences } from "../../../../preferences/organization/webhooks-preferences";
import { PreferencesShell } from "../../../../preferences/preferences-shell";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesWebhooksPage() {
  await requirePreferencesAccess("webhooks");

  return (
    <PreferencesShell
      title="Webhooks"
      description="Addresses told when something happens in this workspace. Each request is signed with the endpoint's secret, shown once."
    >
      <WebhooksPreferences />
    </PreferencesShell>
  );
}
''')
write("packages/shell/preferences/organization/webhooks-preferences.tsx", '''"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Field, Input } from "@corelithzw/react";

import { useToast } from "@corelithzw/ui/components/use-toast";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

type EndpointRow = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  pendingDeliveries: number;
};

type EventEntry = { type: string; description: string };

type DeliveryRow = {
  id: string;
  status: "PENDING" | "DELIVERED" | "FAILED";
  attemptCount: number;
  nextAttemptAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  event: { id: string; type: string; createdAt: string };
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * A workspace's webhook endpoints: register one against the events the
 * composed modules announce, read the secret once, watch what was delivered,
 * deactivate it when it is done.
 */
export function WebhooksPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [url, setUrl] = React.useState("");
  const [events, setEvents] = React.useState<string[]>(["*"]);
  const [revealed, setRevealed] = React.useState<{ url: string; secret: string } | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);

  const endpointsQuery = useQuery({
    queryKey: ["preferences", "organization", "webhooks"],
    queryFn: () => fetchJson<{ data: EndpointRow[]; events: EventEntry[] }>("/api/v2/webhooks"),
  });
  const deliveriesQuery = useQuery({
    queryKey: ["preferences", "organization", "webhooks", selected, "deliveries"],
    queryFn: () => fetchJson<{ data: DeliveryRow[] }>(`/api/v2/webhooks/${selected}/deliveries`),
    enabled: Boolean(selected),
  });

  const createMutation = useMutation({
    mutationFn: (input: { url: string; events: string[] }) =>
      fetchJson<{ data: EndpointRow & { secret: string } }>("/api/v2/webhooks", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (result) => {
      setRevealed({ url: result.data.url, secret: result.data.secret });
      setUrl("");
      setEvents(["*"]);
      void queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "webhooks"] });
    },
    onError: (error) => toast({ title: "Could not register the endpoint", description: getApiErrorMessage(error), variant: "destructive" }),
  });
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => fetchJson<{ data: { id: string } }>(`/api/v2/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Endpoint deactivated" });
      void queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "webhooks"] });
    },
    onError: (error) => toast({ title: "Could not deactivate the endpoint", description: getApiErrorMessage(error), variant: "destructive" }),
  });
  const deliverMutation = useMutation({
    mutationFn: () => fetchJson<{ data: { claimed: number; delivered: number } }>("/api/v2/webhooks/deliver", { method: "POST" }),
    onSuccess: (result) => {
      toast({ title: `Delivery pass: ${result.data.delivered} of ${result.data.claimed} delivered` });
      void queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "webhooks"] });
    },
    onError: (error) => toast({ title: "Delivery pass failed", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  async function deactivate(row: EndpointRow) {
    const confirmed = await dsConfirm({
      title: "Deactivate endpoint",
      description: `${row.url} stops receiving events; its deliveries stay on record.`,
      variant: "warning",
      confirmLabel: "Deactivate",
    });
    if (confirmed) deactivateMutation.mutate(row.id);
  }

  const knownEvents = endpointsQuery.data?.events ?? [];
  const rows = endpointsQuery.data?.data ?? [];
  const choices: Array<{ type: string; description: string }> = [{ type: "*", description: "Every event this host announces." }, ...knownEvents];

  return (
    <div className="space-y-6">
      {revealed ? (
        <Alert tone="success" title={`Endpoint registered: ${revealed.url}`}>
          <p className="text-sm">Copy the signing secret now. It is shown once; verify each request's X-Corelith-Signature with it.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-sm">{revealed.secret}</code>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(revealed.secret);
                toast({ title: "Copied" });
              }}
            >
              Copy
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRevealed(null)}>
              Done
            </Button>
          </div>
        </Alert>
      ) : null}

      <form
        className="space-y-4 rounded-lg border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!url.trim() || events.length === 0) {
            toast({ title: "An https URL and at least one event are required", variant: "destructive" });
            return;
          }
          createMutation.mutate({ url: url.trim(), events });
        }}
      >
        <Field label="Endpoint URL" required>
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/hooks/corelith" required />
        </Field>
        <Field label="Events" required>
          <div className="space-y-1 rounded border border-border p-2">
            {choices.map((choice) => (
              <label key={choice.type} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={events.includes(choice.type)}
                  onChange={(event) =>
                    setEvents((current) =>
                      event.target.checked ? [...current, choice.type] : current.filter((item) => item !== choice.type),
                    )
                  }
                />
                <span>
                  <code>{choice.type}</code> <span className="text-muted-foreground">— {choice.description}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Registering…" : "Register endpoint"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => deliverMutation.mutate()} disabled={deliverMutation.isPending}>
            {deliverMutation.isPending ? "Delivering…" : "Deliver pending now"}
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">URL</th>
              <th className="py-2 pr-4 font-medium">Events</th>
              <th className="py-2 pr-4 font-medium">Pending</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-3 text-muted-foreground" colSpan={5}>
                  {endpointsQuery.isPending ? "Loading…" : "No endpoints yet."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-2 pr-4">
                    <code className="break-all">{row.url}</code>
                  </td>
                  <td className="py-2 pr-4">{row.events.join(", ")}</td>
                  <td className="py-2 pr-4">{row.pendingDeliveries}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={row.active ? "success" : "outline"}>{row.active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => setSelected(selected === row.id ? null : row.id)}>
                        {selected === row.id ? "Hide deliveries" : "Deliveries"}
                      </Button>
                      {row.active ? (
                        <Button type="button" variant="secondary" onClick={() => void deactivate(row)} disabled={deactivateMutation.isPending}>
                          Deactivate
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="overflow-x-auto rounded-lg border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold">Recent deliveries</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Event</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Attempts</th>
                <th className="py-2 pr-4 font-medium">Last answer</th>
                <th className="py-2 pr-4 font-medium">Next attempt</th>
                <th className="py-2 pr-4 font-medium">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {(deliveriesQuery.data?.data ?? []).length === 0 ? (
                <tr>
                  <td className="py-3 text-muted-foreground" colSpan={6}>
                    {deliveriesQuery.isPending ? "Loading…" : "Nothing delivered to this endpoint yet."}
                  </td>
                </tr>
              ) : (
                (deliveriesQuery.data?.data ?? []).map((delivery) => (
                  <tr key={delivery.id} className="border-t border-border">
                    <td className="py-2 pr-4">
                      <code>{delivery.event.type}</code>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={delivery.status === "DELIVERED" ? "success" : delivery.status === "FAILED" ? "danger" : "outline"}>
                        {delivery.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">{delivery.attemptCount}</td>
                    <td className="py-2 pr-4">{delivery.lastStatusCode ?? "—"}{delivery.lastError ? ` · ${delivery.lastError}` : ""}</td>
                    <td className="py-2 pr-4">{formatDate(delivery.nextAttemptAt)}</td>
                    <td className="py-2 pr-4">{formatDate(delivery.deliveredAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
''')
for host in ("enterprise", "campus", "sell", "crm", "people"):
    edit(f"apps/{host}/lib/settings/management-nav.ts", '    { id: "api-keys", label: "API Keys", href: "/preferences/organization/api-keys", icon: ShieldCheck },\n',
         '    { id: "api-keys", label: "API Keys", href: "/preferences/organization/api-keys", icon: ShieldCheck },\n    { id: "webhooks", label: "Webhooks", href: "/preferences/organization/webhooks", icon: ShieldCheck },\n')

# --- tests
write("packages/platform/outbox.test.ts", '''import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@corelithzw/db/client";
import {
  deliverDueWebhooks,
  emitOutboxEvent,
  endpointSubscribes,
  signWebhook,
  webhookRetryDelayMs,
  webhookSignatureHeader,
  type WebhookFetch,
} from "./outbox";

describe("the outbox, without a database", () => {
  it("matches a subscription exactly, by module prefix, or wholesale", () => {
    expect(endpointSubscribes(["*"], "books.sales-invoice.created")).toBe(true);
    expect(endpointSubscribes(["books.*"], "books.sales-invoice.created")).toBe(true);
    expect(endpointSubscribes(["books.sales-invoice.created"], "books.sales-invoice.created")).toBe(true);
    expect(endpointSubscribes(["books.*"], "workflow.approval.actioned")).toBe(false);
    expect(endpointSubscribes([], "books.sales-invoice.created")).toBe(false);
  });

  it("signs the timestamped body with the secret, deterministically", () => {
    const first = signWebhook("whsec_a", 1700000000, "{}");
    expect(first).toBe(signWebhook("whsec_a", 1700000000, "{}"));
    expect(first).not.toBe(signWebhook("whsec_b", 1700000000, "{}"));
    expect(first).not.toBe(signWebhook("whsec_a", 1700000001, "{}"));
    expect(webhookSignatureHeader("whsec_a", 1700000000, "{}")).toBe(`t=1700000000,v1=${first}`);
  });

  it("backs off exponentially to a twelve-hour ceiling", () => {
    expect(webhookRetryDelayMs(1)).toBe(60_000);
    expect(webhookRetryDelayMs(2)).toBe(120_000);
    expect(webhookRetryDelayMs(8)).toBe(128 * 60_000);
    expect(webhookRetryDelayMs(20)).toBe(12 * 60 * 60 * 1000);
  });
});

describe("the outbox, against the database", () => {
  const slug = `outbox-${Date.now().toString(36)}`;
  let companyId = "";
  let everything = "";
  let booksOnly = "";
  let inactive = "";

  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: "Outbox test", slug } });
    companyId = company.id;
    const mk = (url: string, events: string[], active = true) =>
      prisma.platformWebhookEndpoint.create({ data: { companyId, url, secret: `whsec_${url.length}`, events, active }, select: { id: true } });
    everything = (await mk("https://example.test/all", ["*"])).id;
    booksOnly = (await mk("https://example.test/books", ["books.*"])).id;
    inactive = (await mk("https://example.test/off", ["*"], false)).id;
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  });

  it("fans an event out to the active endpoints that subscribe, in the caller's transaction", async () => {
    const result = await prisma.$transaction((tx) =>
      emitOutboxEvent(tx, { companyId, type: "workflow.approval.actioned", payload: { entityId: "e1" } }),
    );
    expect(result.deliveries).toBe(1);
    const deliveries = await prisma.platformWebhookDelivery.findMany({ where: { eventId: result.eventId }, select: { endpointId: true } });
    expect(deliveries.map((d) => d.endpointId)).toEqual([everything]);
    expect(deliveries.map((d) => d.endpointId)).not.toContain(inactive);

    const books = await emitOutboxEvent(prisma, { companyId, type: "books.sales-invoice.created", payload: { invoiceId: "i1" } });
    expect(books.deliveries).toBe(2);
    const booksDeliveries = await prisma.platformWebhookDelivery.findMany({ where: { eventId: books.eventId }, select: { endpointId: true } });
    expect(new Set(booksDeliveries.map((d) => d.endpointId))).toEqual(new Set([everything, booksOnly]));
  });

  it("delivers signed, records the answer, and retries then gives up on a refusing endpoint", async () => {
    const seen: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const answering: WebhookFetch = async (url, init) => {
      seen.push({ url, headers: init.headers, body: init.body });
      return { status: url.endsWith("/books") ? 500 : 204 };
    };
    const now = () => new Date();
    const first = await deliverDueWebhooks({ companyId, fetch: answering, now });
    expect(first.claimed).toBe(3);
    expect(first.delivered).toBe(2);
    expect(first.retried).toBe(1);

    const sent = seen.find((s) => s.url.endsWith("/all"))!;
    const parsed = JSON.parse(sent.body) as { id: string; type: string; companyId: string; data: unknown };
    expect(parsed.companyId).toBe(companyId);
    const [t, v1] = sent.headers["X-Corelith-Signature"].split(",").map((part) => part.split("=")[1]);
    expect(v1).toBe(signWebhook("whsec_24", Number(t), sent.body));
    expect(sent.headers["X-Corelith-Event"]).toBe(parsed.type);

    const refused = await prisma.platformWebhookDelivery.findFirst({ where: { endpointId: booksOnly }, select: { status: true, attemptCount: true, nextAttemptAt: true, lastStatusCode: true } });
    expect(refused).toMatchObject({ status: "PENDING", attemptCount: 1, lastStatusCode: 500 });
    expect(refused!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 30_000);

    // Nothing is due now: the lease and the backoff both hold the refused one back.
    expect((await deliverDueWebhooks({ companyId, fetch: answering, now })).claimed).toBe(0);

    // Make it due again and let the attempts run out.
    for (let attempt = 1; attempt < 8; attempt += 1) {
      await prisma.platformWebhookDelivery.updateMany({ where: { endpointId: booksOnly, status: "PENDING" }, data: { nextAttemptAt: new Date(0) } });
      await deliverDueWebhooks({ companyId, fetch: answering, now, maxAttempts: 8 });
    }
    const exhausted = await prisma.platformWebhookDelivery.findFirst({ where: { endpointId: booksOnly }, select: { status: true, attemptCount: true, nextAttemptAt: true } });
    expect(exhausted).toMatchObject({ status: "FAILED", attemptCount: 8, nextAttemptAt: null });
  });

  it("gives up on a delivery whose endpoint was deactivated meanwhile", async () => {
    const off = await prisma.platformWebhookEndpoint.create({ data: { companyId, url: "https://example.test/late", secret: "whsec_x", events: ["*"] }, select: { id: true } });
    const emitted = await emitOutboxEvent(prisma, { companyId, type: "workflow.approval.actioned", payload: {} });
    expect(emitted.deliveries).toBeGreaterThan(0);
    await prisma.platformWebhookEndpoint.update({ where: { id: off.id }, data: { active: false } });
    const calls: string[] = [];
    const result = await deliverDueWebhooks({ companyId, fetch: async (url) => { calls.push(url); return { status: 204 }; } });
    expect(calls).not.toContain("https://example.test/late");
    expect(result.gaveUp).toBeGreaterThanOrEqual(1);
  });
});
''')

# --- docs
edit("README.md", "| `pnpm enterprise worker:pdf` | Run the PDF render worker loop. |\n", "| `pnpm enterprise worker:pdf` | Run the PDF render worker loop. |\n| `pnpm enterprise worker:webhooks` | Run the outbox's webhook delivery loop (every host's events; one worker serves them all). |\n")
edit("AGENTS.md", "- `packages/modules/private/<id>/` is a client's own module", "- A module announces what happened through the outbox: `emitOutboxEvent(tx, { companyId, type, payload })` from `@corelithzw/platform/outbox`, in the transaction that made the change, with a type its manifest declares under `events`. A host bridges its modules' hooks to the outbox in `modules.ts`; the workspace registers endpoints at `/preferences/organization/webhooks`; `pnpm enterprise worker:webhooks` delivers, signed (`X-Corelith-Signature: t=…,v1=hmac-sha256`), with exponential backoff and a lease-based claim, so many workers may run.\n- `packages/modules/private/<id>/` is a client's own module")
ROW = ("| 2026-09-07 | — | **Phase 5c executed: outbound webhooks from an outbox.** `PlatformOutboxEvent` is written in the transaction that made the "
       "change (`emitOutboxEvent(tx, …)`), so an event is never announced for a change that rolled back and never lost for one that committed; it "
       "fans out at that moment to the workspace's active `PlatformWebhookEndpoint`s whose subscription (`*`, `books.*`, or a type) matches, one "
       "`PlatformWebhookDelivery` each. `deliverDueWebhooks` claims what is due under `FOR UPDATE SKIP LOCKED` with a lease, posts each signed "
       "(`X-Corelith-Signature: t=…,v1=hmac-sha256(secret, t.body)`), and records the answer: delivered, retried with exponential backoff to a "
       "twelve-hour ceiling, or given up after eight attempts; `pnpm enterprise worker:webhooks` runs it forever, `POST /api/v2/webhooks/deliver` "
       "runs one pass by hand. A module declares the events it announces in its manifest (`events`; the workflow's approval, the books' invoice and "
       "receipt), every host bridges those hooks to the outbox in `modules.ts`, and the workspace registers endpoints at "
       "`/preferences/organization/webhooks` (the secret shown once; deliveries visible per endpoint). Covered by `packages/platform/outbox.test.ts` "
       "against the database with an injected transport. With 5b's keys, any developer can integrate with any product from outside the process. |\n")
edit("docs/rollout/product-split-plan.md", "| Date | Commit | Description |\n|---|---|---|\n", "| Date | Commit | Description |\n|---|---|---|\n" + ROW)
print("done")
