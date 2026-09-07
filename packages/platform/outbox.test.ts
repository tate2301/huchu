import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
