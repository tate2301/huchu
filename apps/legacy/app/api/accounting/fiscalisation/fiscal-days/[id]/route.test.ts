import { NextRequest, NextResponse } from "next/server";

/**
 * FD-7.1 / FD-2.2 — one fiscal day, and the refusal to close it.
 *
 * Two claims are worth protecting here and both are about honesty rather than
 * mechanism. First, a day that will not close must come back as a 409 carrying
 * findable document numbers — a supervisor cannot act on "3 pending receipts",
 * only on "till sale RS-1043, FAILED 40 minutes ago". Second, a Z-report built
 * without per-tax breakdowns must announce that it under-reports; a report that
 * merely looks finished is how a taxpayer finds out from ZIMRA instead.
 *
 * Prisma is mocked: aggregation and signing are `lib/accounting/fiscal-day.ts`
 * and tested there. What is asserted here is what reaches the screen.
 */

const { validateSessionMock, closeFiscalDayMock, prismaMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  closeFiscalDayMock: vi.fn(),
  prismaMock: {
    fiscalDay: { findFirst: vi.fn() },
    fiscalReceipt: { groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@corelithzw/platform/api-utils", () => ({
  validateSession: validateSessionMock,
  errorResponse: (message: string, status = 500, details?: unknown) =>
    NextResponse.json({ error: message, ...(details !== undefined ? { details } : {}) }, { status }),
  successResponse: <T,>(data: T, status = 200) => NextResponse.json(data, { status }),
}));

vi.mock("@corelithzw/db/client", () => ({ prisma: prismaMock }));

vi.mock("@corelithzw/module-books/fiscal-day", async () => {
  const actual = await vi.importActual<typeof import("@corelithzw/module-books/fiscal-day")>(
    "@corelithzw/module-books/fiscal-day",
  );
  return { ...actual, closeFiscalDay: closeFiscalDayMock };
});

import {
  FiscalDayHasPendingReceiptsError,
  FiscalDayNotFoundError,
  FiscalDayNotOpenError,
} from "@corelithzw/module-books/fiscal-day";
import { GET, POST } from "./route";

const COMPANY_ID = "company-1";
const DAY_ID = "day-1";

const params = { params: Promise.resolve({ id: DAY_ID }) };

function getRequest() {
  return new NextRequest(`http://test.local/api/accounting/fiscalisation/fiscal-days/${DAY_ID}`);
}

function postRequest(body: unknown) {
  return new NextRequest(`http://test.local/api/accounting/fiscalisation/fiscal-days/${DAY_ID}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signedInAs(role: string) {
  validateSessionMock.mockResolvedValue({ session: { user: { companyId: COMPANY_ID, role } } });
}

function dayRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DAY_ID,
    companyId: COMPANY_ID,
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
    closingSignature: null,
    countersJson: null,
    providerConfig: { providerKey: "ZIMRA_FDMS", metadataJson: null },
    ...overrides,
  };
}

function receiptRow(index: number) {
  return {
    id: `receipt-${index}`,
    status: "FAILED",
    receiptNumber: `00${index}`,
    fiscalNumber: null,
    receiptCounter: index,
    receiptGlobalNo: 800 + index,
    createdAt: new Date("2026-08-19T14:05:00.000Z"),
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
    retailSale: { saleNo: `RS-104${index}` },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  signedInAs("MANAGER");
  prismaMock.fiscalDay.findFirst.mockResolvedValue(dayRow());
  prismaMock.fiscalReceipt.groupBy.mockResolvedValue([]);
  prismaMock.fiscalReceipt.findMany.mockResolvedValue([]);
  prismaMock.fiscalReceipt.count.mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/accounting/fiscalisation/fiscal-days/[id]", () => {
  it("makes another tenant's day indistinguishable from one that does not exist", async () => {
    prismaMock.fiscalDay.findFirst.mockResolvedValue(null);

    const response = await GET(getRequest(), params);

    expect(response.status).toBe(404);
    expect(prismaMock.fiscalDay.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DAY_ID, companyId: COMPANY_ID } }),
    );
  });

  it("returns no counters for an open day rather than a zero-filled report", async () => {
    // A table of zeroes reads as a reconciled Z-report. The honest answer
    // before close is that the counter set does not exist yet.
    const body = await (await GET(getRequest(), params)).json();

    expect(body.counters).toBeNull();
    expect(body.receiptsWithoutTaxLines).toEqual([]);
    expect(body.day).toMatchObject({ fiscalDayNo: 12, status: "OPENED", closingSignature: null });
  });

  it("reads back the signed counters of a closed day", async () => {
    prismaMock.fiscalDay.findFirst.mockResolvedValue(
      dayRow({
        status: "CLOSED",
        closedAt: new Date("2026-08-19T18:30:00.000Z"),
        closingSignature: "sig",
        countersJson: JSON.stringify({
          counters: [
            {
              fiscalCounterType: "SaleByTax",
              fiscalCounterCurrency: "USD",
              fiscalCounterTaxID: 3,
              fiscalCounterTaxPercent: "15.00",
              fiscalCounterValueCents: "1250000",
            },
          ],
          receiptsWithoutTaxLines: ["receipt-9"],
        }),
      }),
    );

    const body = await (await GET(getRequest(), params)).json();

    expect(body.counters).toHaveLength(1);
    // Minor units as a string on the last hop to the screen — an exact fiscal
    // figure must not travel as a JSON number (FD-0.3).
    expect(body.counters[0].fiscalCounterValueCents).toBe("1250000");
    expect(typeof body.counters[0].fiscalCounterValueCents).toBe("string");
    expect(body.receiptsWithoutTaxLines).toEqual(["receipt-9"]);
  });

  it("still renders the day when its counters cannot be parsed", async () => {
    // An unreadable Z-report is an auditor's problem, not a reason to fail the
    // page that would reveal it.
    prismaMock.fiscalDay.findFirst.mockResolvedValue(
      dayRow({ status: "CLOSED", countersJson: "{broken" }),
    );

    const response = await GET(getRequest(), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.counters).toEqual([]);
  });

  it("counts receipts from the group-by and names the blocking ones", async () => {
    prismaMock.fiscalReceipt.groupBy.mockResolvedValue([
      { status: "SUCCESS", _count: { _all: 90 } },
      { status: "FAILED", _count: { _all: 4 } },
      { status: "PENDING", _count: { _all: 1 } },
    ]);
    prismaMock.fiscalReceipt.findMany.mockResolvedValue([receiptRow(1), receiptRow(2)]);
    prismaMock.fiscalReceipt.count.mockResolvedValue(5);

    const body = await (await GET(getRequest(), params)).json();

    expect(body.receiptCounts).toEqual({
      total: 95,
      accepted: 90,
      pending: 1,
      failed: 4,
      blocking: 5,
    });
    expect(body.blockingReceipts[0]).toMatchObject({
      sourceKind: "till-sale",
      sourceRef: "RS-1041",
      lastError: "connect ETIMEDOUT",
    });
    // The count is the true total; the list was cut. Saying so is the point.
    expect(body.blockingTruncated).toBe(true);
  });

  it("labels the day from provider metadata when it carries a site", async () => {
    prismaMock.fiscalDay.findFirst.mockResolvedValue(
      dayRow({
        providerConfig: {
          providerKey: "ZIMRA_FDMS",
          metadataJson: JSON.stringify({ branch: "Msasa" }),
        },
      }),
    );

    const body = await (await GET(getRequest(), params)).json();
    expect(body.day.siteLabel).toBe("Msasa");
  });
});

describe("POST /api/accounting/fiscalisation/fiscal-days/[id]", () => {
  it("closes the day and reports the counter set", async () => {
    closeFiscalDayMock.mockResolvedValue({
      day: {
        id: DAY_ID,
        fiscalDayNo: 12,
        status: "CLOSED",
        closedAt: new Date("2026-08-19T18:30:00.000Z"),
      },
      alreadyClosed: false,
      counters: { receiptCount: 95, counters: [], receiptsWithoutTaxLines: [] },
    });

    const response = await POST(postRequest({ action: "close" }), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      dayId: DAY_ID,
      status: "CLOSED",
      receiptCount: 95,
      countersIncomplete: false,
    });
    expect(closeFiscalDayMock).toHaveBeenCalledWith({ dayId: DAY_ID, companyId: COMPANY_ID });
  });

  it("flags a Z-report that under-reports rather than letting it look finished", async () => {
    // The signed per-tax breakdown is built at issue time and is not persisted
    // on FiscalReceipt, so a console close cannot reconstruct it. Finding that
    // out from ZIMRA is the outcome this flag exists to prevent.
    closeFiscalDayMock.mockResolvedValue({
      day: { id: DAY_ID, fiscalDayNo: 12, status: "CLOSED", closedAt: new Date() },
      alreadyClosed: false,
      counters: {
        receiptCount: 95,
        counters: [],
        receiptsWithoutTaxLines: ["receipt-3", "receipt-7"],
      },
    });

    const body = await (await POST(postRequest({ action: "close" }), params)).json();

    expect(body.countersIncomplete).toBe(true);
    expect(body.receiptsWithoutTaxLines).toEqual(["receipt-3", "receipt-7"]);
  });

  it("refuses a close with findable document numbers, at 409", async () => {
    closeFiscalDayMock.mockRejectedValue(
      new FiscalDayHasPendingReceiptsError(DAY_ID, [
        { id: "receipt-1", status: "FAILED", receiptGlobalNo: 801 },
        { id: "receipt-2", status: "PENDING", receiptGlobalNo: 802 },
      ]),
    );
    prismaMock.fiscalReceipt.findMany.mockResolvedValue([receiptRow(1), receiptRow(2)]);
    prismaMock.fiscalReceipt.count.mockResolvedValue(2);

    const response = await POST(postRequest({ action: "close" }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.details.blockingCount).toBe(2);
    expect(body.details.blockingReceipts).toHaveLength(2);
    // Nothing is broken — a receipt is queued and the day is correctly
    // declining to sign a report covering something ZIMRA has never seen.
    expect(body.details.blockingReceipts[0]).toMatchObject({
      sourceKind: "till-sale",
      sourceRef: "RS-1041",
    });
    expect(body.details.blockingTruncated).toBe(false);
  });

  it("marks the refusal list truncated when more receipts block than it lists", async () => {
    closeFiscalDayMock.mockRejectedValue(
      new FiscalDayHasPendingReceiptsError(DAY_ID, [
        { id: "receipt-1", status: "FAILED", receiptGlobalNo: 801 },
      ]),
    );
    prismaMock.fiscalReceipt.findMany.mockResolvedValue([receiptRow(1)]);
    prismaMock.fiscalReceipt.count.mockResolvedValue(140);

    const body = await (await POST(postRequest({ action: "close" }), params)).json();
    expect(body.details.blockingTruncated).toBe(true);
  });

  it("returns 404 for a day the service does not find", async () => {
    closeFiscalDayMock.mockRejectedValue(new FiscalDayNotFoundError(DAY_ID));
    expect((await POST(postRequest({ action: "close" }), params)).status).toBe(404);
  });

  it("returns 409 for a day that is not open", async () => {
    closeFiscalDayMock.mockRejectedValue(
      new FiscalDayNotOpenError({ dayId: DAY_ID, status: "CLOSED" }),
    );

    const response = await POST(postRequest({ action: "close" }), params);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.details.status).toBe("CLOSED");
  });

  it("refuses a cashier before touching the service", async () => {
    signedInAs("CASHIER");
    const response = await POST(postRequest({ action: "close" }), params);

    expect(response.status).toBe(403);
    expect(closeFiscalDayMock).not.toHaveBeenCalled();
  });

  it("rejects an unrecognised action", async () => {
    const response = await POST(postRequest({ action: "reopen" }), params);
    expect(response.status).toBe(400);
    expect(closeFiscalDayMock).not.toHaveBeenCalled();
  });
});
