import { NextRequest, NextResponse } from "next/server";

/**
 * FD-7.1 — the fleet read, and opening a day.
 *
 * Prisma is mocked rather than driven against a database because what this
 * route does is *shape* and *refusal*, not persistence: fiscal logic lives in
 * `lib/accounting/fiscal-day.ts` and is tested there against real rows. What
 * can only go wrong here is the console being told something untrue — a count
 * that is the preview length rather than the real total, a device offered an
 * Open button that is guaranteed to fail, one stuck till starving the rest out
 * of the preview. Each of those is a claim about the response object, so the
 * response object is what is asserted.
 */

const { validateSessionMock, openFiscalDayMock, prismaMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  openFiscalDayMock: vi.fn(),
  prismaMock: {
    fiscalisationProviderConfig: { findMany: vi.fn() },
    fiscalDay: { findMany: vi.fn(), findFirst: vi.fn() },
    fiscalReceipt: { groupBy: vi.fn(), findMany: vi.fn() },
    site: { findMany: vi.fn() },
    retailRegister: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/api-utils", () => ({
  validateSession: validateSessionMock,
  errorResponse: (message: string, status = 500, details?: unknown) =>
    NextResponse.json({ error: message, ...(details !== undefined ? { details } : {}) }, { status }),
  successResponse: <T,>(data: T, status = 200) => NextResponse.json(data, { status }),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/accounting/fiscal-day", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounting/fiscal-day")>(
    "@/lib/accounting/fiscal-day",
  );
  return { ...actual, openFiscalDay: openFiscalDayMock };
});

import { FiscalDayAlreadyOpenError, FiscalDayConfigError } from "@/lib/accounting/fiscal-day";
import { GET, POST } from "./route";

const COMPANY_ID = "company-1";

function getRequest() {
  return new NextRequest("http://test.local/api/accounting/fiscalisation/fiscal-days");
}

function postRequest(body: unknown) {
  return new NextRequest("http://test.local/api/accounting/fiscalisation/fiscal-days", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signedInAs(role: string) {
  validateSessionMock.mockResolvedValue({
    session: { user: { companyId: COMPANY_ID, role } },
  });
}

function provider(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "provider-1",
    providerKey: "ZIMRA_FDMS",
    deviceId: "device-1",
    isActive: true,
    metadataJson: null,
    ...overrides,
  };
}

function openDay(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "day-1",
    providerConfigId: "provider-1",
    fiscalDayNo: 12,
    status: "OPENED",
    deviceId: "device-1",
    openedAt: new Date("2026-08-19T06:00:00.000Z"),
    closedAt: null,
    lastReceiptCounter: 40,
    lastReceiptGlobalNo: 810,
    lastReceiptHash: "hash",
    lastError: null,
    ...overrides,
  };
}

function receiptRow(index: number, createdAt: string) {
  return {
    id: `receipt-${index}`,
    status: "FAILED",
    receiptNumber: `00${index}`,
    fiscalNumber: null,
    receiptCounter: index,
    receiptGlobalNo: 800 + index,
    createdAt: new Date(createdAt),
    lastError: "connect ETIMEDOUT",
    attemptCount: 2,
    nextRetryAt: null,
    invoiceId: null,
    schoolReceiptId: null,
    creditNoteId: null,
    retailSaleId: `sale-${index}`,
    invoice: null,
    schoolReceipt: null,
    creditNote: null,
    retailSale: { saleNo: `RS-10${index}` },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  signedInAs("MANAGER");
  prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([]);
  prismaMock.fiscalDay.findMany.mockResolvedValue([]);
  prismaMock.fiscalDay.findFirst.mockResolvedValue(null);
  prismaMock.fiscalReceipt.groupBy.mockResolvedValue([]);
  prismaMock.fiscalReceipt.findMany.mockResolvedValue([]);
  prismaMock.site.findMany.mockResolvedValue([]);
  prismaMock.retailRegister.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/accounting/fiscalisation/fiscal-days", () => {
  it("scopes every read to the caller's company", async () => {
    prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([provider()]);
    await GET(getRequest());

    expect(prismaMock.fiscalisationProviderConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: COMPANY_ID } }),
    );
    expect(prismaMock.fiscalDay.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_ID }) }),
    );
  });

  it("returns an honest empty fleet for a tenant with no devices", async () => {
    const body = await (await GET(getRequest())).json();

    expect(body.devices).toEqual([]);
    expect(body.summary).toMatchObject({
      devices: 0,
      daysOpen: 0,
      devicesWithoutOpenDay: 0,
      blockingReceipts: 0,
      oldestBlockingAt: null,
    });
  });

  it("counts blocking receipts from the group-by, not from the capped preview", async () => {
    // The bug this exists to prevent: a device that lost the network for an
    // hour holds hundreds of failed receipts, the preview shows eight, and a
    // supervisor closes the shift believing eight is the whole problem.
    prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([provider()]);
    prismaMock.fiscalDay.findMany.mockResolvedValue([openDay()]);
    prismaMock.fiscalReceipt.groupBy.mockResolvedValue([
      { status: "SUCCESS", _count: { _all: 120 } },
      { status: "FAILED", _count: { _all: 37 } },
      { status: "PENDING", _count: { _all: 3 } },
    ]);
    prismaMock.fiscalReceipt.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => receiptRow(i, `2026-08-19T1${i}:00:00.000Z`)),
    );

    const body = await (await GET(getRequest())).json();
    const device = body.devices[0];

    expect(device.receiptCounts).toEqual({
      total: 160,
      accepted: 120,
      pending: 3,
      failed: 37,
      blocking: 40,
    });
    expect(device.blockingReceipts).toHaveLength(8);
    expect(device.blockingTruncated).toBe(true);
    expect(body.summary.blockingReceipts).toBe(40);
  });

  it("does not mark the list truncated when it is complete", async () => {
    prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([provider()]);
    prismaMock.fiscalDay.findMany.mockResolvedValue([openDay()]);
    prismaMock.fiscalReceipt.groupBy.mockResolvedValue([
      { status: "FAILED", _count: { _all: 2 } },
    ]);
    prismaMock.fiscalReceipt.findMany.mockResolvedValue([
      receiptRow(1, "2026-08-19T10:00:00.000Z"),
      receiptRow(2, "2026-08-19T11:00:00.000Z"),
    ]);

    const body = await (await GET(getRequest())).json();
    expect(body.devices[0].blockingTruncated).toBe(false);
    expect(body.devices[0].oldestBlockingAt).toBe("2026-08-19T10:00:00.000Z");
  });

  it("reads no receipts at all for a device with no open day", async () => {
    prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([provider()]);
    prismaMock.fiscalDay.findMany.mockResolvedValue([]);

    const body = await (await GET(getRequest())).json();

    expect(prismaMock.fiscalReceipt.groupBy).not.toHaveBeenCalled();
    expect(body.devices[0].activeDay).toBeNull();
    expect(body.devices[0].receiptCounts.blocking).toBe(0);
    expect(body.summary.devicesWithoutOpenDay).toBe(1);
  });

  it("says why a device cannot be opened instead of offering a doomed action", async () => {
    prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([
      provider({ id: "p-open" }),
      provider({ id: "p-inactive", isActive: false }),
      provider({ id: "p-unregistered", deviceId: null }),
      provider({ id: "p-ready" }),
    ]);
    prismaMock.fiscalDay.findMany.mockResolvedValue([openDay({ providerConfigId: "p-open" })]);

    const body = await (await GET(getRequest())).json();
    const reasonFor = (id: string) =>
      body.devices.find((d: { providerConfigId: string }) => d.providerConfigId === id)
        .openBlockedReason;

    expect(reasonFor("p-open")).toContain("already open");
    expect(reasonFor("p-inactive")).toContain("not active");
    expect(reasonFor("p-unregistered")).toContain("register the device with ZIMRA");
    expect(reasonFor("p-ready")).toBeNull();
  });

  it("distinguishes a day still closing from one accepting receipts", async () => {
    prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([provider()]);
    prismaMock.fiscalDay.findMany.mockResolvedValue([openDay({ status: "CLOSING" })]);

    const body = await (await GET(getRequest())).json();

    expect(body.summary.daysOpen).toBe(0);
    expect(body.summary.daysClosing).toBe(1);
    expect(body.devices[0].openBlockedReason).toContain("still closing");
  });

  it("reports the oldest blocking receipt across the whole fleet", async () => {
    prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([
      provider({ id: "p-1" }),
      provider({ id: "p-2" }),
    ]);
    prismaMock.fiscalDay.findMany.mockResolvedValue([
      openDay({ id: "day-1", providerConfigId: "p-1" }),
      openDay({ id: "day-2", providerConfigId: "p-2" }),
    ]);
    prismaMock.fiscalReceipt.groupBy.mockResolvedValue([
      { status: "FAILED", _count: { _all: 1 } },
    ]);
    prismaMock.fiscalReceipt.findMany.mockImplementation(
      async ({ where }: { where: { fiscalDayId: string } }) =>
        where.fiscalDayId === "day-1"
          ? [receiptRow(1, "2026-08-19T15:00:00.000Z")]
          : [receiptRow(2, "2026-08-19T09:30:00.000Z")],
    );

    const body = await (await GET(getRequest())).json();
    expect(body.summary.oldestBlockingAt).toBe("2026-08-19T09:30:00.000Z");
  });

  it("labels a device from its site when metadata names a real one", async () => {
    prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([
      provider({ metadataJson: JSON.stringify({ siteId: "site-1" }) }),
    ]);
    prismaMock.site.findMany.mockResolvedValue([{ id: "site-1", name: "Msasa Branch" }]);
    prismaMock.retailRegister.findMany.mockResolvedValue([
      { siteId: "site-1", code: "T1", name: "Front till" },
    ]);

    const body = await (await GET(getRequest())).json();
    expect(body.devices[0].siteLabel).toBe("Msasa Branch");
    expect(body.devices[0].registerLabels).toEqual(["T1 — Front till"]);
  });

  it("survives unparseable provider metadata rather than failing the fleet", async () => {
    // metadataJson is a free-text field on the config form. A typo in one
    // device's metadata must not blank the console for every other till.
    prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([
      provider({ metadataJson: "{not json" }),
    ]);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.devices[0].siteLabel).toBeNull();
    expect(body.devices[0].registerLabels).toEqual([]);
  });

  it("never invents a site label metadata does not carry", async () => {
    prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([
      provider({ metadataJson: JSON.stringify({ siteId: "site-gone" }) }),
    ]);
    prismaMock.site.findMany.mockResolvedValue([]);

    const body = await (await GET(getRequest())).json();
    expect(body.devices[0].siteLabel).toBeNull();
    expect(body.devices[0].siteId).toBe("site-gone");
  });

  it("renders read-only for a role that rings sales but does not sign off a day", async () => {
    signedInAs("CASHIER");
    prismaMock.fiscalisationProviderConfig.findMany.mockResolvedValue([provider()]);

    const body = await (await GET(getRequest())).json();
    expect(body.canManage).toBe(false);
    expect(body.devices).toHaveLength(1);
  });

  it("passes an unauthenticated response straight through", async () => {
    validateSessionMock.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await GET(getRequest())).status).toBe(401);
  });
});

describe("POST /api/accounting/fiscalisation/fiscal-days", () => {
  it("opens a day for a shift-running role", async () => {
    openFiscalDayMock.mockResolvedValue(openDay());
    const response = await POST(postRequest({ providerConfigId: "8f2b1d1e-0a2c-4c7f-9a1b-1f2e3d4c5b6a" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.day).toMatchObject({ id: "day-1", fiscalDayNo: 12, status: "OPENED" });
    expect(openFiscalDayMock).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      providerConfigId: "8f2b1d1e-0a2c-4c7f-9a1b-1f2e3d4c5b6a",
    });
  });

  it("refuses a cashier before touching the service", async () => {
    signedInAs("CASHIER");
    const response = await POST(postRequest({ providerConfigId: "8f2b1d1e-0a2c-4c7f-9a1b-1f2e3d4c5b6a" }));

    expect(response.status).toBe(403);
    expect(openFiscalDayMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    const response = await POST(postRequest({ providerConfigId: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(openFiscalDayMock).not.toHaveBeenCalled();
  });

  it("answers a double-click with 409 and the day that already exists", async () => {
    // A retried request must be reconcilable by refetching, not alarming: the
    // console needs the open day's id to show what happened instead of
    // reporting a server fault for a state that is entirely correct.
    openFiscalDayMock.mockRejectedValue(
      new FiscalDayAlreadyOpenError({ id: "day-1", fiscalDayNo: 12, status: "OPENED" }),
    );

    const response = await POST(postRequest({ providerConfigId: "8f2b1d1e-0a2c-4c7f-9a1b-1f2e3d4c5b6a" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.details).toMatchObject({ openDayId: "day-1", fiscalDayNo: 12 });
  });

  it("returns a misconfigured device as a 4xx, not a server fault", async () => {
    openFiscalDayMock.mockRejectedValue(new FiscalDayConfigError("Device is not registered"));

    const response = await POST(postRequest({ providerConfigId: "8f2b1d1e-0a2c-4c7f-9a1b-1f2e3d4c5b6a" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Device is not registered");
  });
});
