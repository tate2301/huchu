/**
 * What the CRM sends to the ledger, and what it deliberately does not.
 *
 * Posting a cost entry that a requisition's acquittal posts doubles the cost,
 * and the books balance either way so nothing complains. That is pinned
 * below. A requisition's own money is the Books core's, tested through the
 * CRM's route (`app/api/v2/crm/requisitions/[id]/route.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { captureMock, projectFindFirstMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  projectFindFirstMock: vi.fn(),
}));

// The Books core posts it; here only what the CRM asks of it is under test.
vi.mock("@/lib/books/core", () => ({ postMoney: (_db: unknown, event: unknown) => captureMock(event) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { crmProject: { findFirst: projectFindFirstMock } },
}));

const { postCostEntry } = await import("@/lib/crm/money-posting");

const COMPANY = "company-1";
const ACTOR = "user-1";

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

describe("cost entries", () => {
  it("posts a spend that no requisition paid for", async () => {
    const result = await postCostEntry(COMPANY, entry(), ACTOR);

    expect(result.posted).toBe(true);
    const event = captureMock.mock.calls[0][0];
    expect(event.sourceType).toBe("CRM_COST_ENTRY_SPEND");
    expect(event.sourceSubtype).toBe("MATERIALS");
  });

  it("refuses to post a spend its requisition's acquittal posts", async () => {
    // The double-count. Both entries balance, so nothing downstream would
    // notice — the cost would simply be twice what it was.
    const result = await postCostEntry(COMPANY, entry({ requisitionId: "req-1" }), ACTOR);

    expect(result.posted).toBe(false);
    expect(result.reason).toMatch(/acquittal/);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("captures cash received without pretending to know where it came from", async () => {
    const result = await postCostEntry(COMPANY, entry({ direction: "RECEIVED" }), ACTOR);

    expect(result.posted).toBe(true);
    // Sent under a source type with no seeded rule, so it fails with that
    // reason and waits in Needs posting for a person rather than posting to a guess.
    expect(captureMock.mock.calls[0][0].sourceType).toBe("CRM_COST_ENTRY_RECEIPT");
  });

  it("tags a project's spend with its cost centre", async () => {
    projectFindFirstMock.mockResolvedValue({ costCenterId: "cc-9" });
    await postCostEntry(COMPANY, entry({ projectId: "proj-2" }), ACTOR);
    expect(captureMock.mock.calls[0][0].payload.costCenterId).toBe("cc-9");
  });
});
