/**
 * The webhook's decisions, against a real database.
 *
 * What is worth proving here is not that a well-formed delivery creates a
 * lead — it is the four ways a delivery is refused or absorbed, because each
 * one is a case where getting it wrong means either a duplicate lead in
 * somebody's pipeline or a real lead silently lost.
 *
 * The Graph call is stubbed, because the thing under test is what happens
 * around it. `graph.ts` is the seam that talks to Meta and nothing else.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { signPayload } from "./signature";

const KEY = Buffer.alloc(32, 11).toString("base64");
process.env.CRM_INTEGRATION_ENCRYPTION_KEY = KEY;

const fetchLeadgen = vi.hoisted(() => vi.fn());
vi.mock("./graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./graph")>();
  return { ...actual, fetchLeadgen };
});

// Imported after the mock is registered, so the handler binds the stub.
const { encryptSecret } = await import("./secrets");
const { handleFacebookWebhook, verifyWebhookSubscription } = await import("./webhook");

const APP_SECRET = "an-app-secret-for-the-tests";
const PAGE_ID = "550000000000001";
const OTHER_PAGE_ID = "550000000000002";

let companyId: string;
let callbackToken: string;
let verifyToken: string;
let connectionId: string;

function delivery(leadgenId: string, pageId = PAGE_ID) {
  return JSON.stringify({
    object: "page",
    entry: [
      {
        id: pageId,
        time: 1757577600,
        changes: [
          {
            field: "leadgen",
            value: { leadgen_id: leadgenId, page_id: pageId, form_id: "770000000000001" },
          },
        ],
      },
    ],
  });
}

function signed(rawBody: string, secret = APP_SECRET) {
  return { "x-hub-signature-256": signPayload(rawBody, secret) };
}

beforeAll(async () => {
  await prisma.$connect();
  const suffix = `${process.pid.toString(36)}-fb`;
  const company = await prisma.company.create({
    data: { name: `CRM Facebook ${suffix}`, slug: `crm-facebook-${suffix}` },
  });
  companyId = company.id;

  callbackToken = `cb-${suffix}`;
  verifyToken = `vt-${suffix}`;
  const connection = await prisma.crmFacebookConnection.create({
    data: {
      companyId,
      callbackToken,
      verifyToken,
      pageId: PAGE_ID,
      appId: "120000000000001",
      appSecretEnc: encryptSecret(APP_SECRET),
      pageAccessTokenEnc: encryptSecret("a-page-access-token-long-enough-to-pass"),
      defaultSourceLabel: "Facebook Lead Ads",
    },
    select: { id: true },
  });
  connectionId = connection.id;

  fetchLeadgen.mockResolvedValue({
    id: "1",
    form_id: "770000000000001",
    campaign_name: "Borehole Q4",
    ad_name: "Carousel A",
    platform: "fb",
    field_data: [
      { name: "full_name", values: ["Tariro Moyo"] },
      { name: "email", values: ["tariro@example.test"] },
      { name: "what_service_do_you_need?", values: ["Borehole drilling"] },
    ],
  });
});

afterEach(async () => {
  await prisma.crmFacebookLeadEvent.deleteMany({ where: { companyId } });
  await prisma.crmActivity.deleteMany({ where: { companyId } });
  await prisma.crmIntakeSubmission.deleteMany({ where: { companyId } });
  await prisma.crmLead.deleteMany({ where: { companyId } });
  await prisma.crmClient.deleteMany({ where: { companyId } });
  await prisma.crmFacebookConnection.update({
    where: { id: connectionId },
    data: { isActive: true, lastError: null, lastErrorAt: null },
  });
});

afterAll(async () => {
  await prisma.crmFacebookLeadEvent.deleteMany({ where: { companyId } });
  await prisma.crmFacebookConnection.deleteMany({ where: { companyId } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("handleFacebookWebhook", () => {
  it("creates a lead from a signed delivery, attributed to the ad", async () => {
    const rawBody = delivery("900000000000001");
    const result = await handleFacebookWebhook({ callbackToken, rawBody, headers: signed(rawBody) });

    expect(result.httpStatus).toBe(200);
    expect(result.results).toEqual([
      { leadgenId: "900000000000001", status: "INGESTED", leadId: expect.any(String) },
    ]);

    const lead = await prisma.crmLead.findFirstOrThrow({ where: { companyId } });
    expect(lead.contactName).toBe("Tariro Moyo");
    expect(lead.contactEmail).toBe("tariro@example.test");
    expect(lead.sourceChannel).toBe("ADS");
    expect(lead.source).toBe("Facebook Lead Ads");
    expect(lead.utmSource).toBe("facebook");
    expect(lead.utmMedium).toBe("paid_social");
    expect(lead.utmCampaign).toBe("Borehole Q4");
    expect(lead.utmContent).toBe("Carousel A");
    expect(lead.details).toMatchObject({ "What service do you need?": "Borehole drilling" });
  });

  it("absorbs a redelivery as a no-op rather than a second lead", async () => {
    const rawBody = delivery("900000000000002");
    const headers = signed(rawBody);

    const first = await handleFacebookWebhook({ callbackToken, rawBody, headers });
    const second = await handleFacebookWebhook({ callbackToken, rawBody, headers });

    expect(first.results[0].status).toBe("INGESTED");
    expect(second.results[0]).toEqual({ leadgenId: "900000000000002", status: "DUPLICATE" });
    expect(await prisma.crmLead.count({ where: { companyId } })).toBe(1);
    expect(await prisma.crmFacebookLeadEvent.count({ where: { companyId } })).toBe(1);
  });

  it("refuses a delivery signed with the wrong app secret, and records why", async () => {
    const rawBody = delivery("900000000000003");
    const result = await handleFacebookWebhook({
      callbackToken,
      rawBody,
      headers: signed(rawBody, "a-completely-different-secret"),
    });

    expect(result.httpStatus).toBe(401);
    expect(result.outcome).toBe("UNVERIFIED");
    expect(await prisma.crmLead.count({ where: { companyId } })).toBe(0);

    // The standing error on the connection is what a rotated app secret looks
    // like from the settings screen.
    await vi.waitFor(async () => {
      const row = await prisma.crmFacebookConnection.findUniqueOrThrow({
        where: { id: connectionId },
        select: { lastError: true },
      });
      expect(row.lastError).toMatch(/Signature check failed/);
    });
  });

  it("refuses an unsigned delivery", async () => {
    const rawBody = delivery("900000000000004");
    const result = await handleFacebookWebhook({ callbackToken, rawBody, headers: {} });
    expect(result.httpStatus).toBe(401);
    expect(result.error).toBe("Signature missing");
  });

  it("does not file a delivery for a Page this connection does not own", async () => {
    const rawBody = delivery("900000000000005", OTHER_PAGE_ID);
    const result = await handleFacebookWebhook({ callbackToken, rawBody, headers: signed(rawBody) });

    expect(result.results[0].status).toBe("IGNORED");
    expect(await prisma.crmLead.count({ where: { companyId } })).toBe(0);
    expect(await prisma.crmFacebookLeadEvent.count({ where: { companyId } })).toBe(0);
  });

  it("answers 404 for a callback token no connection claims", async () => {
    const rawBody = delivery("900000000000006");
    const result = await handleFacebookWebhook({
      callbackToken: "not-a-real-token",
      rawBody,
      headers: signed(rawBody),
    });
    expect(result.httpStatus).toBe(404);
    expect(result.outcome).toBe("UNKNOWN_CALLBACK");
  });

  it("answers a paused connection 200 and creates nothing, so Meta does not unsubscribe it", async () => {
    await prisma.crmFacebookConnection.update({
      where: { id: connectionId },
      data: { isActive: false },
    });

    const rawBody = delivery("900000000000007");
    const result = await handleFacebookWebhook({ callbackToken, rawBody, headers: signed(rawBody) });

    expect(result.httpStatus).toBe(200);
    expect(result.outcome).toBe("INACTIVE");
    expect(await prisma.crmLead.count({ where: { companyId } })).toBe(0);
  });

  it("records a Graph failure as retryable rather than losing the lead", async () => {
    fetchLeadgen.mockRejectedValueOnce(new Error("Error validating access token"));

    const rawBody = delivery("900000000000008");
    const result = await handleFacebookWebhook({ callbackToken, rawBody, headers: signed(rawBody) });

    // Still 200: erroring at Meta over one bad token costs every later lead too.
    expect(result.httpStatus).toBe(200);
    expect(result.results[0].status).toBe("FAILED");

    const event = await prisma.crmFacebookLeadEvent.findFirstOrThrow({ where: { companyId } });
    expect(event.status).toBe("FAILED");
    expect(event.error).toMatch(/access token/);
    expect(event.leadId).toBeNull();
  });

  it("ignores a delivery for a form outside the connection's allow-list", async () => {
    await prisma.crmFacebookConnection.update({
      where: { id: connectionId },
      data: { formIds: ["770000000000009"] },
    });

    const rawBody = delivery("900000000000009");
    const result = await handleFacebookWebhook({ callbackToken, rawBody, headers: signed(rawBody) });

    expect(result.results[0].status).toBe("IGNORED");
    expect(await prisma.crmLead.count({ where: { companyId } })).toBe(0);

    await prisma.crmFacebookConnection.update({
      where: { id: connectionId },
      data: { formIds: [] },
    });
  });

  it("skips a change that is not a leadgen", async () => {
    const rawBody = JSON.stringify({
      object: "page",
      entry: [{ id: PAGE_ID, changes: [{ field: "feed", value: { item: "status" } }] }],
    });
    const result = await handleFacebookWebhook({ callbackToken, rawBody, headers: signed(rawBody) });
    expect(result.results).toEqual([]);
  });
});

describe("verifyWebhookSubscription", () => {
  it("echoes the challenge and marks the connection verified", async () => {
    const result = await verifyWebhookSubscription({
      callbackToken,
      mode: "subscribe",
      verifyToken,
      challenge: "1158201444",
    });

    expect(result).toEqual({ ok: true, challenge: "1158201444" });
    const row = await prisma.crmFacebookConnection.findUniqueOrThrow({
      where: { id: connectionId },
      select: { verifiedAt: true },
    });
    expect(row.verifiedAt).toBeInstanceOf(Date);
  });

  it("refuses a wrong verify token with 403 and does not mark it verified", async () => {
    await prisma.crmFacebookConnection.update({
      where: { id: connectionId },
      data: { verifiedAt: null },
    });

    const result = await verifyWebhookSubscription({
      callbackToken,
      mode: "subscribe",
      verifyToken: "wrong-token",
      challenge: "1158201444",
    });

    expect(result).toEqual({ ok: false, status: 403, error: "Verify token mismatch" });
    const row = await prisma.crmFacebookConnection.findUniqueOrThrow({
      where: { id: connectionId },
      select: { verifiedAt: true },
    });
    expect(row.verifiedAt).toBeNull();
  });

  it("answers 404 for an unknown callback token", async () => {
    const result = await verifyWebhookSubscription({
      callbackToken: "nope",
      mode: "subscribe",
      verifyToken,
      challenge: "x",
    });
    expect(result).toEqual({ ok: false, status: 404, error: "Unknown callback URL" });
  });
});
