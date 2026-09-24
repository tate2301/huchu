/**
 * The webhook's decisions, against a real database.
 *
 * What is worth proving here is not that a well-formed delivery creates a
 * lead — it is the ways a delivery is refused, absorbed or routed, because
 * each one is a case where getting it wrong means a duplicate lead in
 * somebody's pipeline, a lead in the *wrong* pipeline, or a real lead lost.
 *
 * Routing by Page is the new load-bearing part: one callback URL serves every
 * tenant, so the only thing standing between two workspaces' leads is the
 * lookup these tests cover.
 *
 * The Graph call is stubbed, because the thing under test is what happens
 * around it. `graph.ts` is the seam that talks to Meta and nothing else.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { signPayload } from "./signature";

const KEY = Buffer.alloc(32, 11).toString("base64");
const APP_SECRET = "the-platform-app-secret";

process.env.CRM_INTEGRATION_ENCRYPTION_KEY = KEY;
process.env.FACEBOOK_APP_ID = "120000000000001";
process.env.FACEBOOK_APP_SECRET = APP_SECRET;
process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = "the-handshake-token";

const fetchLeadgen = vi.hoisted(() => vi.fn());
vi.mock("./graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./graph")>();
  return { ...actual, fetchLeadgen };
});

// Imported after the mock is registered, so the handler binds the stub.
const { encryptSecret } = await import("./secrets");
const { handleFacebookWebhook, verifyWebhookSubscription } = await import("./webhook");

const PAGE_ID = "550000000000001";
const OTHER_PAGE_ID = "550000000000002";

let companyId: string;
let otherCompanyId: string;
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

async function makeCompany(label: string) {
  const suffix = `${process.pid.toString(36)}-${label}`;
  const company = await prisma.company.create({
    data: { name: `CRM Facebook ${suffix}`, slug: `crm-facebook-${suffix}` },
  });
  return company.id;
}

beforeAll(async () => {
  await prisma.$connect();
  companyId = await makeCompany("fb");
  otherCompanyId = await makeCompany("fb2");

  connectionId = (
    await prisma.crmFacebookConnection.create({
      data: {
        companyId,
        pageId: PAGE_ID,
        pageName: "Borehole Co",
        pageAccessTokenEnc: encryptSecret("a-page-access-token-long-enough-to-pass"),
        defaultSourceLabel: "Facebook Lead Ads",
      },
      select: { id: true },
    })
  ).id;

  // A second tenant, so the routing tests have somewhere wrong to land.
  await prisma.crmFacebookConnection.create({
    data: {
      companyId: otherCompanyId,
      pageId: OTHER_PAGE_ID,
      pageAccessTokenEnc: encryptSecret("another-page-access-token-long-enough"),
    },
  });

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
  for (const id of [companyId, otherCompanyId]) {
    await prisma.crmFacebookLeadEvent.deleteMany({ where: { companyId: id } });
    await prisma.crmActivity.deleteMany({ where: { companyId: id } });
    await prisma.crmIntakeSubmission.deleteMany({ where: { companyId: id } });
    await prisma.crmLead.deleteMany({ where: { companyId: id } });
    await prisma.crmClient.deleteMany({ where: { companyId: id } });
  }
  await prisma.crmFacebookConnection.update({
    where: { id: connectionId },
    data: { isActive: true, formIds: [], lastError: null, lastErrorAt: null },
  });
});

afterAll(async () => {
  for (const id of [companyId, otherCompanyId]) {
    await prisma.crmFacebookLeadEvent.deleteMany({ where: { companyId: id } });
    await prisma.crmFacebookConnection.deleteMany({ where: { companyId: id } });
    await prisma.notification.deleteMany({ where: { companyId: id } });
    await prisma.idSequence.deleteMany({ where: { companyId: id } });
    await prisma.company.delete({ where: { id } });
  }
  await prisma.$disconnect();
});

describe("handleFacebookWebhook", () => {
  it("creates a lead from a signed delivery, attributed to the ad", async () => {
    const rawBody = delivery("900000000000001");
    const result = await handleFacebookWebhook({ rawBody, headers: signed(rawBody) });

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

  it("routes a delivery to the workspace that owns the Page, and only that one", async () => {
    const rawBody = delivery("900000000000002", OTHER_PAGE_ID);
    const result = await handleFacebookWebhook({ rawBody, headers: signed(rawBody) });

    expect(result.results[0].status).toBe("INGESTED");
    // The lead belongs to the other tenant. One shared callback URL makes this
    // the guarantee everything else rests on.
    expect(await prisma.crmLead.count({ where: { companyId } })).toBe(0);
    expect(await prisma.crmLead.count({ where: { companyId: otherCompanyId } })).toBe(1);
  });

  it("handles a batch naming two Pages in one delivery", async () => {
    const rawBody = JSON.stringify({
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          changes: [{ field: "leadgen", value: { leadgen_id: "900000000000003", page_id: PAGE_ID } }],
        },
        {
          id: OTHER_PAGE_ID,
          changes: [
            { field: "leadgen", value: { leadgen_id: "900000000000004", page_id: OTHER_PAGE_ID } },
          ],
        },
      ],
    });

    const result = await handleFacebookWebhook({ rawBody, headers: signed(rawBody) });

    expect(result.results.map((r) => r.status)).toEqual(["INGESTED", "INGESTED"]);
    expect(await prisma.crmLead.count({ where: { companyId } })).toBe(1);
    expect(await prisma.crmLead.count({ where: { companyId: otherCompanyId } })).toBe(1);
  });

  it("absorbs a redelivery as a no-op rather than a second lead", async () => {
    const rawBody = delivery("900000000000005");
    const headers = signed(rawBody);

    const first = await handleFacebookWebhook({ rawBody, headers });
    const second = await handleFacebookWebhook({ rawBody, headers });

    expect(first.results[0].status).toBe("INGESTED");
    expect(second.results[0]).toEqual({ leadgenId: "900000000000005", status: "DUPLICATE" });
    expect(await prisma.crmLead.count({ where: { companyId } })).toBe(1);
    expect(await prisma.crmFacebookLeadEvent.count({ where: { companyId } })).toBe(1);
  });

  it("refuses a delivery signed with the wrong app secret", async () => {
    const rawBody = delivery("900000000000006");
    const result = await handleFacebookWebhook({
      rawBody,
      headers: signed(rawBody, "a-completely-different-secret"),
    });

    expect(result.httpStatus).toBe(401);
    expect(result.outcome).toBe("UNVERIFIED");
    expect(await prisma.crmLead.count({ where: { companyId } })).toBe(0);
  });

  it("refuses an unsigned delivery without touching the database", async () => {
    const rawBody = delivery("900000000000007");
    const result = await handleFacebookWebhook({ rawBody, headers: {} });

    expect(result.httpStatus).toBe(401);
    expect(result.error).toBe("Signature missing");
    expect(await prisma.crmFacebookLeadEvent.count()).toBe(0);
  });

  it("ignores a Page nobody has connected, and still answers 200", async () => {
    const rawBody = delivery("900000000000008", "550000000000999");
    const result = await handleFacebookWebhook({ rawBody, headers: signed(rawBody) });

    // 200, not an error: Meta would retry forever over a lead that has no
    // owner to give it to.
    expect(result.httpStatus).toBe(200);
    expect(result.results[0].status).toBe("IGNORED");
    expect(await prisma.crmFacebookLeadEvent.count()).toBe(0);
  });

  it("answers a paused connection 200 and creates nothing, so Meta does not unsubscribe it", async () => {
    await prisma.crmFacebookConnection.update({
      where: { id: connectionId },
      data: { isActive: false },
    });

    const rawBody = delivery("900000000000009");
    const result = await handleFacebookWebhook({ rawBody, headers: signed(rawBody) });

    expect(result.httpStatus).toBe(200);
    expect(result.results[0].status).toBe("IGNORED");
    expect(await prisma.crmLead.count({ where: { companyId } })).toBe(0);
  });

  it("records a Graph failure as retryable rather than losing the lead", async () => {
    fetchLeadgen.mockRejectedValueOnce(new Error("Error validating access token"));

    const rawBody = delivery("900000000000010");
    const result = await handleFacebookWebhook({ rawBody, headers: signed(rawBody) });

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

    const rawBody = delivery("900000000000011");
    const result = await handleFacebookWebhook({ rawBody, headers: signed(rawBody) });

    expect(result.results[0].status).toBe("IGNORED");
    expect(await prisma.crmLead.count({ where: { companyId } })).toBe(0);
  });

  it("skips a change that is not a leadgen", async () => {
    const rawBody = JSON.stringify({
      object: "page",
      entry: [{ id: PAGE_ID, changes: [{ field: "feed", value: { item: "status" } }] }],
    });
    const result = await handleFacebookWebhook({ rawBody, headers: signed(rawBody) });
    expect(result.results).toEqual([]);
  });
});

describe("verifyWebhookSubscription", () => {
  it("echoes the challenge when the token matches the deployment's", () => {
    expect(
      verifyWebhookSubscription({
        mode: "subscribe",
        verifyToken: "the-handshake-token",
        challenge: "1158201444",
      }),
    ).toEqual({ ok: true, challenge: "1158201444" });
  });

  it("refuses a wrong verify token with 403", () => {
    expect(
      verifyWebhookSubscription({ mode: "subscribe", verifyToken: "wrong", challenge: "x" }),
    ).toEqual({ ok: false, status: 403, error: "Verify token mismatch" });
  });

  it("refuses a handshake that is missing its parts", () => {
    expect(
      verifyWebhookSubscription({ mode: "subscribe", verifyToken: "the-handshake-token", challenge: null }),
    ).toEqual({ ok: false, status: 400, error: "Missing hub.challenge" });
    expect(
      verifyWebhookSubscription({ mode: null, verifyToken: "the-handshake-token", challenge: "x" }),
    ).toEqual({ ok: false, status: 400, error: "Unsupported hub.mode" });
  });
});
