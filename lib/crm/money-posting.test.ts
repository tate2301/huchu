/**
 * What the CRM sends to the ledger, and what it deliberately does not.
 *
 * Two failures here are silent and expensive. Posting a cost entry that a
 * requisition already expensed doubles the cost, and the books balance either
 * way so nothing complains. Skipping the acquittal variance leaves the expense
 * at whatever was handed over, which overstates cost and hides cash somebody
 * is carrying. Both are pinned below.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { captureMock, projectFindFirstMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  projectFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/accounting/integration", () => ({ captureAccountingEvent: captureMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: { crmProject: { findFirst: projectFindFirstMock } },
}));

const {
  postCostEntry,
  postRequisitionAcquittalVariance,
  postRequisitionDisbursement,
} = await import("@/lib/crm/money-posting");

const COMPANY = "company-1";
const ACTOR = "user-1";

function requisition(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    requisitionNo: "REQ-0001",
    category: "FUEL" as const,
    currency: "USD",
    purpose: "Diesel for the Kadoma run",
    amount: new Prisma.Decimal("400.00"),
    approvedAmount: null,
    acquittedAmount: null,
    projectId: null,
    disbursedAt: new Date("2026-05-14T10:00:00.000Z"),
    acquittedAt: new Date("2026-05-16T10:00:00.000Z"),
    ...overrides,
  };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    direction: "SPENT" as const,
    category: "MATERIALS" as const,
    amount: new Prisma.Decimal("75.00"),
    currency: "USD",
    description: "Cement, 4 bags",
    projectId: null,
    requisitionId: null,
    createdAt: new Date("2026-05-14T12:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  projectFindFirstMock.mockResolvedValue(null);
});

describe("disbursement", () => {
  it("expenses the money as it leaves", async () => {
    await postRequisitionDisbursement(COMPANY, requisition(), ACTOR);

    expect(captureMock).toHaveBeenCalledOnce();
    const event = captureMock.mock.calls[0][0];
    expect(event.sourceType).toBe("CRM_REQUISITION_DISBURSEMENT");
    expect(event.amount.toString()).toBe("400");
    // The seeded rules condition on this to pick the expense account.
    expect(event.sourceSubtype).toBe("FUEL");
  });

  it("posts the approved figure when an approver cut it", async () => {
    await postRequisitionDisbursement(
      COMPANY,
      requisition({ approvedAmount: new Prisma.Decimal("250.00") }),
      ACTOR,
    );
    expect(captureMock.mock.calls[0][0].amount.toString()).toBe("250");
  });

  it("says nothing about a requisition worth nothing", async () => {
    await postRequisitionDisbursement(
      COMPANY,
      requisition({ approvedAmount: new Prisma.Decimal(0) }),
      ACTOR,
    );
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("tags the entry with the project's cost centre", async () => {
    projectFindFirstMock.mockResolvedValue({ costCenterId: "cc-7" });
    await postRequisitionDisbursement(COMPANY, requisition({ projectId: "proj-1" }), ACTOR);
    expect(captureMock.mock.calls[0][0].payload.costCenterId).toBe("cc-7");
  });

  it("carries no cost centre when the requisition belongs to no project", async () => {
    // Fuel and airtime, chiefly. The expense is still real.
    await postRequisitionDisbursement(COMPANY, requisition(), ACTOR);
    expect(captureMock.mock.calls[0][0].payload.costCenterId).toBeNull();
  });
});

describe("acquittal", () => {
  it("posts nothing when the acquittal agrees with what was handed over", async () => {
    const result = await postRequisitionAcquittalVariance(
      COMPANY,
      requisition({ acquittedAmount: new Prisma.Decimal("400.00") }),
      ACTOR,
    );
    expect(result.posted).toBeNull();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("brings the expense down when change comes back", async () => {
    const result = await postRequisitionAcquittalVariance(
      COMPANY,
      requisition({ acquittedAmount: new Prisma.Decimal("310.50") }),
      ACTOR,
    );

    expect(result.posted).toBe("REFUND");
    const event = captureMock.mock.calls[0][0];
    expect(event.sourceType).toBe("CRM_REQUISITION_REFUND");
    // The difference only — 400 was already expensed.
    expect(event.amount.toString()).toBe("89.5");
  });

  it("adds the expense when somebody spent their own money", async () => {
    const result = await postRequisitionAcquittalVariance(
      COMPANY,
      requisition({ acquittedAmount: new Prisma.Decimal("445.00") }),
      ACTOR,
    );

    expect(result.posted).toBe("TOPUP");
    const event = captureMock.mock.calls[0][0];
    expect(event.sourceType).toBe("CRM_REQUISITION_TOPUP");
    // Never negative: a posting rule line has a fixed direction, so the sign
    // lives in the choice of source type.
    expect(event.amount.toString()).toBe("45");
  });

  it("measures the variance against the approved figure, not the requested one", async () => {
    // Asked 400, approved 250, spent 250: nothing outstanding, nothing to post.
    const result = await postRequisitionAcquittalVariance(
      COMPANY,
      requisition({
        approvedAmount: new Prisma.Decimal("250.00"),
        acquittedAmount: new Prisma.Decimal("250.00"),
      }),
      ACTOR,
    );
    expect(result.posted).toBeNull();
  });

  it("treats a missing acquittal as nothing spent", async () => {
    const result = await postRequisitionAcquittalVariance(COMPANY, requisition(), ACTOR);
    expect(result.posted).toBe("REFUND");
    expect(captureMock.mock.calls[0][0].amount.toString()).toBe("400");
  });
});

describe("cost entries", () => {
  it("posts a spend that no requisition paid for", async () => {
    const result = await postCostEntry(COMPANY, entry(), ACTOR);

    expect(result.posted).toBe(true);
    const event = captureMock.mock.calls[0][0];
    expect(event.sourceType).toBe("CRM_COST_ENTRY_SPEND");
    expect(event.sourceSubtype).toBe("MATERIALS");
  });

  it("refuses to post a spend the requisition already expensed", async () => {
    // The double-count. Both entries balance, so nothing downstream would
    // notice — the cost would simply be twice what it was.
    const result = await postCostEntry(COMPANY, entry({ requisitionId: "req-1" }), ACTOR);

    expect(result.posted).toBe(false);
    expect(result.reason).toMatch(/already expensed/);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("captures cash received without pretending to know where it came from", async () => {
    const result = await postCostEntry(COMPANY, entry({ direction: "RECEIVED" }), ACTOR);

    expect(result.posted).toBe(true);
    // Captured under a source type with no seeded rule, so it sits PENDING on
    // the integration log for a person rather than posting to a guess.
    expect(captureMock.mock.calls[0][0].sourceType).toBe("CRM_COST_ENTRY_RECEIPT");
  });

  it("tags a project's spend with its cost centre", async () => {
    projectFindFirstMock.mockResolvedValue({ costCenterId: "cc-9" });
    await postCostEntry(COMPANY, entry({ projectId: "proj-2" }), ACTOR);
    expect(captureMock.mock.calls[0][0].payload.costCenterId).toBe("cc-9");
  });
});
