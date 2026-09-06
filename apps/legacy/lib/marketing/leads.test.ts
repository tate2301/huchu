/**
 * MK-3, against a real database.
 *
 * The whole story is "a lead is never lost", so the tests are written from the
 * failure the old code had rather than from the happy path: the webhook is made
 * to throw, and the row is expected to be there anyway. A test that only
 * asserts a 200 would have passed against the version that answered `ok` and
 * wrote the lead to `console.error`.
 *
 * Prerequisites: a real Postgres DATABASE_URL with migrations applied.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { POST as postDemoRequest } from "@/app/api/marketing/demo-request/route";
import { POST as postLead } from "@/app/api/marketing/leads/route";
import {
  MARKETING_LEAD_STATUS_ANONYMOUS,
  MARKETING_LEAD_STATUS_NEW,
  MAX_LEAD_PAYLOAD_CHARS,
  deliverLeadWebhook,
  normaliseLeadSource,
  readRefererContext,
} from "./leads";

const STAMP = `mk3-${Date.now()}${Math.floor(process.hrtime()[1] / 1000)}`;
const WEBHOOK_URL = "https://webhook.invalid/corelith-leads";

/** Every row this file writes carries the stamp somewhere findable. */
async function purge() {
  await prisma.marketingLead.deleteMany({
    where: {
      OR: [
        { email: { contains: STAMP } },
        { message: { contains: STAMP } },
        { payloadJson: { contains: STAMP } },
      ],
    },
  });
}

function demoRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest("http://test.local/api/marketing/demo-request", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function leadRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest("http://test.local/api/marketing/leads", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const validDemoRequest = {
  name: "Tariro Moyo",
  email: `tariro+${STAMP}@example.com`,
  company: "Moyo Hardware",
  industry: "Commerce",
  teamSize: "12",
  message: `We need stock, invoices and branch reporting in one place. ${STAMP}`,
  phone: "+263784939111",
  city: "Harare",
  problemArea: "Stock control",
  source: "book-demo",
};

let previousWebhookUrl: string | undefined;

beforeAll(async () => {
  await prisma.$connect();
  previousWebhookUrl = process.env.MARKETING_DEMO_WEBHOOK_URL;
  await purge();
});

afterAll(async () => {
  await purge();
  if (previousWebhookUrl === undefined) delete process.env.MARKETING_DEMO_WEBHOOK_URL;
  else process.env.MARKETING_DEMO_WEBHOOK_URL = previousWebhookUrl;
  await prisma.$disconnect();
});

beforeEach(() => {
  process.env.MARKETING_DEMO_WEBHOOK_URL = WEBHOOK_URL;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await purge();
});

describe("POST /api/marketing/demo-request", () => {
  it("keeps the lead when the webhook throws", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("connect ECONNREFUSED"));

    const response = await postDemoRequest(demoRequest(validDemoRequest));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);

    // The webhook was genuinely attempted and genuinely failed — the row below
    // is not there because delivery was skipped.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();

    const lead = await prisma.marketingLead.findFirstOrThrow({
      where: { email: validDemoRequest.email },
    });
    expect(lead.source).toBe("BOOK_DEMO");
    expect(lead.companyName).toBe("Moyo Hardware");
    expect(lead.phone).toBe("+263784939111");
    expect(lead.status).toBe(MARKETING_LEAD_STATUS_NEW);
    expect(JSON.parse(lead.payloadJson ?? "{}")).toMatchObject({
      industry: "Commerce",
      teamSize: "12",
      city: "Harare",
      problemArea: "Stock control",
    });
  });

  it("keeps the lead when the webhook answers with a server error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream is down", { status: 502 }),
    );

    const response = await postDemoRequest(demoRequest(validDemoRequest));
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);

    expect(await prisma.marketingLead.count({ where: { email: validDemoRequest.email } })).toBe(1);
  });

  it("takes the campaign off the referer when the form did not send it", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));

    await postDemoRequest(
      demoRequest(validDemoRequest, {
        referer: "https://corelith.co.zw/home/pricing?utm_source=google&utm_campaign=zimra-deadline",
      }),
    );

    const lead = await prisma.marketingLead.findFirstOrThrow({
      where: { email: validDemoRequest.email },
    });
    expect(lead.pagePath).toBe("/home/pricing");
    expect(lead.utmSource).toBe("google");
    expect(lead.utmCampaign).toBe("zimra-deadline");
  });

  it("stores nothing for the honeypot", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("never called"));

    const response = await postDemoRequest(
      demoRequest({ ...validDemoRequest, website: "https://spam.example" }),
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await prisma.marketingLead.count({ where: { email: validDemoRequest.email } })).toBe(0);
  });
});

describe("POST /api/marketing/leads", () => {
  it("stores a tool submission's own inputs", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));

    const response = await postLead(
      leadRequest({
        source: "penalty-calculator",
        phone: "+263771000111",
        companyName: "Chikwanha Wholesalers",
        payload: {
          testRun: STAMP,
          tills: 11,
          daysInDefault: 240,
          chargeableDays: 181,
          penaltyUsd: 49_775,
          isCapped: true,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);

    const lead = await prisma.marketingLead.findFirstOrThrow({
      where: { payloadJson: { contains: STAMP } },
    });
    expect(lead.source).toBe("PENALTY_CALCULATOR");
    expect(lead.status).toBe(MARKETING_LEAD_STATUS_NEW);

    // The till count and the day count are the sales context. A lead that
    // arrives without them is a name; with them the first call already knows
    // what the business is exposed to.
    const payload = JSON.parse(lead.payloadJson ?? "{}");
    expect(payload).toMatchObject({
      tills: 11,
      daysInDefault: 240,
      chargeableDays: 181,
      penaltyUsd: 49_775,
      isCapped: true,
    });
  });

  it("keeps a submission that left no way of replying, out of the working queue", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect ECONNREFUSED"));

    const response = await postLead(
      leadRequest(
        {
          source: "VAT_THRESHOLD",
          payload: { testRun: STAMP, annualTaxableSuppliesUsd: 30_000, mustRegister: true },
        },
        { referer: "https://corelith.co.zw/home/tools/vat-threshold?utm_medium=cpc" },
      ),
    );

    expect(response.status).toBe(200);

    const lead = await prisma.marketingLead.findFirstOrThrow({
      where: { payloadJson: { contains: STAMP } },
    });
    expect(lead.source).toBe("VAT_THRESHOLD");
    expect(lead.status).toBe(MARKETING_LEAD_STATUS_ANONYMOUS);
    expect(lead.pagePath).toBe("/home/tools/vat-threshold");
    expect(lead.utmMedium).toBe("cpc");
  });

  it("refuses a submission with nothing in it", async () => {
    const response = await postLead(leadRequest({ source: "penalty-calculator" }));
    expect(response.status).toBe(400);
    expect((await response.json()).ok).toBe(false);
  });

  it("refuses a payload too large to be a lead", async () => {
    const response = await postLead(
      leadRequest({
        source: "penalty-calculator",
        payload: { testRun: STAMP, filler: "x".repeat(MAX_LEAD_PAYLOAD_CHARS + 1) },
      }),
    );

    expect(response.status).toBe(400);
    expect(await prisma.marketingLead.count({ where: { payloadJson: { contains: STAMP } } })).toBe(
      0,
    );
  });

  it("stores nothing for the honeypot", async () => {
    const response = await postLead(
      leadRequest({
        source: "penalty-calculator",
        website: "https://spam.example",
        payload: { testRun: STAMP, tills: 3 },
      }),
    );

    expect(response.status).toBe(200);
    expect(await prisma.marketingLead.count({ where: { payloadJson: { contains: STAMP } } })).toBe(
      0,
    );
  });
});

describe("lead helpers", () => {
  it("files every spelling of a campaign under one source", () => {
    expect(normaliseLeadSource("penalty-calculator")).toBe("PENALTY_CALCULATOR");
    expect(normaliseLeadSource("Penalty Calculator")).toBe("PENALTY_CALCULATOR");
    expect(normaliseLeadSource("  ")).toBe("OTHER");
    expect(normaliseLeadSource(undefined, "DEMO_REQUEST")).toBe("DEMO_REQUEST");
  });

  it("survives a referer that is not a URL", () => {
    expect(readRefererContext("not a url")).toEqual({
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      pagePath: null,
    });
  });

  it("reports an unconfigured webhook without calling anything", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const outcome = await deliverLeadWebhook({ url: "  ", payload: {} });

    expect(outcome).toEqual({ attempted: false, delivered: false, reason: "not-configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
