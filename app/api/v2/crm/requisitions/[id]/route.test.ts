/**
 * The guards on a requisition's moves.
 *
 * These are the rules that stop money going out wrongly, and every one of them
 * is enforced on the server rather than by hiding a button:
 *
 *   - nobody approves their own request
 *   - approving and paying out are separate permissions
 *   - the state machine is checked against the row as it is now, so a second
 *     "disburse" on a requisition already paid is refused rather than paying
 *     it twice
 *
 * Mocked at the session and Prisma boundary, like the other route tests here:
 * what is under test is the decision the handler makes, not Postgres.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { validateSessionMock, capabilityMock, prismaMock, notifyMock, emitMock } = vi.hoisted(
  () => ({
    validateSessionMock: vi.fn(),
    capabilityMock: vi.fn(),
    prismaMock: {
      crmRequisition: { findFirst: vi.fn(), update: vi.fn() },
      crmDailyCostEntry: { findMany: vi.fn() },
      bankAccount: { findFirst: vi.fn() },
    },
    notifyMock: vi.fn(),
    emitMock: vi.fn(),
  }),
);

vi.mock("@/lib/api-utils", () => ({
  validateSession: validateSessionMock,
  errorResponse: (message: string, status = 500, details?: unknown) =>
    NextResponse.json({ error: message, ...(details !== undefined ? { details } : {}) }, { status }),
  successResponse: <T>(data: T, status = 200) => NextResponse.json(data, { status }),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/notifications", () => ({ emitCrmNotification: emitMock }));
vi.mock("@/app/api/v2/crm/requisitions/_shared", () => ({ notifyApprovers: notifyMock }));
vi.mock("../../_helpers", () => ({ requireCrmCapability: capabilityMock }));

const { PATCH } = await import("./route");

const REQUESTER = "user-requester";
const APPROVER = "user-approver";

function session(userId: string) {
  return { session: { user: { id: userId, companyId: "company-1", role: "MANAGER" } } };
}

function patch(body: unknown) {
  return new NextRequest("http://localhost/api/v2/crm/requisitions/req-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "req-1" });

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    status: "SUBMITTED",
    requestedById: REQUESTER,
    requisitionNo: "REQ-0001",
    purpose: "Cement",
    currency: "USD",
    amount: new Prisma.Decimal("400.00"),
    approvedAmount: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  capabilityMock.mockResolvedValue(true);
  prismaMock.crmRequisition.update.mockImplementation(async ({ data }: { data: object }) => ({
    ...row(),
    ...data,
  }));
  prismaMock.crmDailyCostEntry.findMany.mockResolvedValue([]);
});

/** A reported line, as the acquittal reads it. */
function line(amount: string, receipt: boolean, direction: "SPENT" | "RECEIVED" = "SPENT") {
  return {
    direction,
    amount: new Prisma.Decimal(amount),
    receiptUrl: receipt ? "https://example.invalid/receipt.jpg" : null,
  };
}

describe("approving", () => {
  it("refuses somebody approving their own request", async () => {
    validateSessionMock.mockResolvedValue(session(REQUESTER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row());

    const response = await PATCH(patch({ action: "decide", approve: true }), { params });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Somebody else has to approve your own request",
    });
    expect(prismaMock.crmRequisition.update).not.toHaveBeenCalled();
  });

  it("refuses somebody without the permission", async () => {
    validateSessionMock.mockResolvedValue(session(APPROVER));
    capabilityMock.mockResolvedValue(false);
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row());

    const response = await PATCH(patch({ action: "decide", approve: true }), { params });

    expect(response.status).toBe(403);
    expect(prismaMock.crmRequisition.update).not.toHaveBeenCalled();
  });

  it("records the approver, the time and the cut amount", async () => {
    validateSessionMock.mockResolvedValue(session(APPROVER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row());

    const response = await PATCH(
      patch({ action: "decide", approve: true, approvedAmount: 250 }),
      { params },
    );

    expect(response.status).toBe(200);
    const update = prismaMock.crmRequisition.update.mock.calls[0][0];
    expect(update.data.status).toBe("APPROVED");
    expect(update.data.approvedById).toBe(APPROVER);
    expect(update.data.approvedAmount).toBe(250);
    // The requester learns the answer without having to go looking.
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: [REQUESTER] }),
    );
  });

  it("clears any approved amount on a rejection", async () => {
    validateSessionMock.mockResolvedValue(session(APPROVER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row());

    await PATCH(
      patch({ action: "decide", approve: false, approvedAmount: 250, decisionNote: "No" }),
      { params },
    );

    const update = prismaMock.crmRequisition.update.mock.calls[0][0];
    expect(update.data.status).toBe("REJECTED");
    expect(update.data.approvedAmount).toBeNull();
  });
});

describe("paying out", () => {
  it("refuses to pay something nobody approved", async () => {
    validateSessionMock.mockResolvedValue(session(APPROVER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "SUBMITTED" }));

    const response = await PATCH(patch({ action: "disburse" }), { params });

    expect(response.status).toBe(409);
    expect(prismaMock.crmRequisition.update).not.toHaveBeenCalled();
  });

  it("refuses to pay the same requisition twice", async () => {
    validateSessionMock.mockResolvedValue(session(APPROVER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "DISBURSED" }));

    const response = await PATCH(patch({ action: "disburse" }), { params });

    expect(response.status).toBe(409);
    expect(prismaMock.crmRequisition.update).not.toHaveBeenCalled();
  });

  it("refuses a bank account belonging to another tenant", async () => {
    validateSessionMock.mockResolvedValue(session(APPROVER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "APPROVED" }));
    prismaMock.bankAccount.findFirst.mockResolvedValue(null);

    const response = await PATCH(
      patch({ action: "disburse", bankAccountId: "11111111-2222-4333-8444-555555555555" }),
      { params },
    );

    expect(response.status).toBe(404);
    expect(prismaMock.crmRequisition.update).not.toHaveBeenCalled();
  });

  it("needs the paying permission, not the approving one", async () => {
    validateSessionMock.mockResolvedValue(session(APPROVER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "APPROVED" }));
    capabilityMock.mockImplementation(async (_session, capability: string) =>
      capability === "money.approve",
    );

    const response = await PATCH(patch({ action: "disburse" }), { params });

    expect(response.status).toBe(403);
  });
});

describe("submitting and withdrawing", () => {
  it("lets only the requester submit", async () => {
    validateSessionMock.mockResolvedValue(session(APPROVER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "DRAFT" }));

    const response = await PATCH(patch({ action: "submit" }), { params });

    expect(response.status).toBe(403);
  });

  it("tells the approvers when a draft is submitted", async () => {
    validateSessionMock.mockResolvedValue(session(REQUESTER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "DRAFT" }));

    const response = await PATCH(patch({ action: "submit" }), { params });

    expect(response.status).toBe(200);
    expect(notifyMock).toHaveBeenCalledOnce();
  });

  it("refuses to cancel money that has already gone", async () => {
    validateSessionMock.mockResolvedValue(session(REQUESTER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "DISBURSED" }));

    const response = await PATCH(patch({ action: "cancel" }), { params });

    // The way back from a disbursement is an acquittal, not a cancellation.
    expect(response.status).toBe(409);
  });
});

describe("accounting for the money", () => {
  it("refuses an acquittal from somebody else", async () => {
    validateSessionMock.mockResolvedValue(session(APPROVER));
    capabilityMock.mockResolvedValue(false);
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "DISBURSED" }));

    const response = await PATCH(patch({ action: "acquit" }), { params });

    expect(response.status).toBe(403);
  });

  it("accepts an acquittal of nothing, which is a real answer", async () => {
    validateSessionMock.mockResolvedValue(session(REQUESTER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "DISBURSED" }));

    const response = await PATCH(patch({ action: "acquit" }), { params });

    expect(response.status).toBe(200);
    const update = prismaMock.crmRequisition.update.mock.calls[0][0];
    expect(update.data.acquittedAmount.toString()).toBe("0");
  });

  it("settles at what the reported spend comes to, not at a typed figure", async () => {
    validateSessionMock.mockResolvedValue(session(REQUESTER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "DISBURSED" }));
    prismaMock.crmDailyCostEntry.findMany.mockResolvedValue([
      line("250.50", true),
      line("60.00", true),
      // The float arriving is not something it was spent on.
      line("400.00", true, "RECEIVED"),
    ]);

    const response = await PATCH(patch({ action: "acquit", acquittedAmount: 1 }), { params });

    expect(response.status).toBe(200);
    const update = prismaMock.crmRequisition.update.mock.calls[0][0];
    expect(update.data.acquittedAmount.toString()).toBe("310.5");
    expect(update.data.status).toBe("ACQUITTED");
  });

  it("refuses while a spend line has no receipt", async () => {
    validateSessionMock.mockResolvedValue(session(REQUESTER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "DISBURSED" }));
    prismaMock.crmDailyCostEntry.findMany.mockResolvedValue([line("90.00", false)]);

    const response = await PATCH(patch({ action: "acquit" }), { params });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("RECEIPTS_MISSING");
    expect(prismaMock.crmRequisition.update).not.toHaveBeenCalled();
  });

  it("will not let the requester waive their own receipts", async () => {
    validateSessionMock.mockResolvedValue(session(REQUESTER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "DISBURSED" }));
    prismaMock.crmDailyCostEntry.findMany.mockResolvedValue([line("90.00", false)]);

    const response = await PATCH(
      patch({ action: "acquit", waiveMissingReceipts: true, waiverNote: "Lost it" }),
      { params },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.crmRequisition.update).not.toHaveBeenCalled();
  });

  it("lets a manager accept them without, and keeps who and why", async () => {
    validateSessionMock.mockResolvedValue(session(APPROVER));
    prismaMock.crmRequisition.findFirst.mockResolvedValue(row({ status: "DISBURSED" }));
    prismaMock.crmDailyCostEntry.findMany.mockResolvedValue([line("90.00", false), line("30.00", true)]);

    const response = await PATCH(
      patch({ action: "acquit", waiveMissingReceipts: true, waiverNote: "Pump till was down" }),
      { params },
    );

    expect(response.status).toBe(200);
    const update = prismaMock.crmRequisition.update.mock.calls[0][0];
    expect(update.data.acquittedAmount.toString()).toBe("120");
    expect(update.data.receiptsWaivedById).toBe(APPROVER);
    expect(update.data.receiptWaiverNote).toBe("Pump till was down");
  });
});
