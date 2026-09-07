import { NextRequest } from "next/server";

const { getMarketingDemoWebhookUrlMock, getMarketingSchedulerUrlMock } = vi.hoisted(() => ({
  getMarketingDemoWebhookUrlMock: vi.fn(),
  getMarketingSchedulerUrlMock: vi.fn(),
}));

vi.mock("@/lib/marketing-site", () => ({
  getMarketingDemoWebhookUrl: getMarketingDemoWebhookUrlMock,
  getMarketingSchedulerUrl: getMarketingSchedulerUrlMock,
}));

import { POST } from "./route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://test.local/api/marketing/demo-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validRequest = {
  name: "Tariro Moyo",
  email: "tariro@example.com",
  company: "Moyo Hardware",
  industry: "Commerce",
  teamSize: "12",
  message: "We need stock, invoices and branch reporting in one place.",
};

describe("POST /api/marketing/demo-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    getMarketingDemoWebhookUrlMock.mockReturnValue(null);
    getMarketingSchedulerUrlMock.mockReturnValue("https://calendar.example/demo");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts the expanded setup questionnaire fields", async () => {
    const response = await POST(
      makeRequest({
        ...validRequest,
        phone: "+263784939111",
        city: "Harare",
        locations: "3 branches",
        currentTools: "Excel, WhatsApp and a standalone POS",
        problemArea: "Stock control",
        timeline: "This quarter",
        preferredChannel: "WhatsApp",
        interest: "commerce",
        source: "book-demo",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      scheduleUrl: "https://calendar.example/demo",
    });
    expect(typeof body.submittedAt).toBe("string");
  });

  it("keeps the honeypot path successful without delivering a lead", async () => {
    const response = await POST(makeRequest({ ...validRequest, website: "https://spam.example" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(console.info).not.toHaveBeenCalled();
  });

  it("rejects incomplete required fields", async () => {
    const response = await POST(makeRequest({ ...validRequest, email: "not-an-email" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("required demo request fields");
  });
});
