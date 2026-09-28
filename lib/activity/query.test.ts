import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEvents, mockUsers, mockUser } = vi.hoisted(() => ({
  mockEvents: vi.fn(),
  mockUsers: vi.fn(),
  mockUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformAuditEvent: { findMany: mockEvents },
    user: { findMany: mockUsers, findFirst: mockUser },
  },
}));

import { listActivity, parseActivityFilters } from "./query";

function row(id: string, at: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    createdAt: new Date(at),
    actor: "user-1",
    eventType: "SITE.UPDATED",
    entityType: "Site",
    entityId: "site-1",
    reason: null,
    payloadJson: JSON.stringify({
      module: "settings",
      actorName: "Tendai (then)",
      label: "Main shaft",
      changes: [{ model: "Site", action: "updated", recordId: "site-1", label: "Main shaft" }],
      more: 0,
    }),
    ...overrides,
  };
}

describe("listActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsers.mockResolvedValue([{ id: "user-1", name: "Tendai Moyo", email: "t@x.test" }]);
    mockUser.mockResolvedValue({ email: "t@x.test" });
  });

  it("describes activity events and names the person from the directory", async () => {
    mockEvents.mockResolvedValue([row("b", "2026-09-25T10:00:00Z")]);
    const page = await listActivity({ companyId: "c1", filters: {} });

    expect(page.nextCursor).toBeNull();
    expect(page.entries[0]).toMatchObject({
      summary: "Updated site",
      recordLabel: "Main shaft",
      module: "settings",
      moduleLabel: "Settings",
      action: "updated",
      actor: { id: "user-1", name: "Tendai Moyo" },
    });
  });

  it("words a module's own audit event from its type", async () => {
    mockEvents.mockResolvedValue([
      row("a", "2026-09-25T10:00:00Z", {
        eventType: "schools.fee.invoice.written-off",
        entityType: "SchoolFeeInvoice",
        payloadJson: JSON.stringify({ amount: 10 }),
      }),
    ]);
    const page = await listActivity({ companyId: "c1", filters: {} });
    expect(page.entries[0]).toMatchObject({
      summary: "Fee invoice written off",
      module: "schools",
      action: null,
    });
  });

  it("pages by (createdAt, id) and continues from the cursor", async () => {
    mockEvents.mockResolvedValueOnce([
      row("c", "2026-09-25T12:00:00Z"),
      row("b", "2026-09-25T11:00:00Z"),
      row("a", "2026-09-25T10:00:00Z"),
    ]);
    const first = await listActivity({ companyId: "c1", filters: {}, limit: 2 });
    expect(first.entries.map((entry) => entry.id)).toEqual(["c", "b"]);
    expect(first.nextCursor).toBeTruthy();

    mockEvents.mockResolvedValueOnce([row("a", "2026-09-25T10:00:00Z")]);
    await listActivity({ companyId: "c1", filters: {}, cursor: first.nextCursor, limit: 2 });
    const where = mockEvents.mock.calls[1][0].where;
    expect(where.AND).toContainEqual({
      OR: [
        { createdAt: { lt: new Date("2026-09-25T11:00:00Z") } },
        { createdAt: new Date("2026-09-25T11:00:00Z"), id: { lt: "b" } },
      ],
    });
  });

  it("turns the filters into the query", async () => {
    mockEvents.mockResolvedValue([]);
    const filters = parseActivityFilters(
      new URLSearchParams("actorId=user-1&module=gold&action=deleted&action2=x"),
    );
    await listActivity({ companyId: "c1", filters });
    const and = mockEvents.mock.calls[0][0].where.AND;
    expect(and).toContainEqual({ companyId: "c1" });
    expect(and).toContainEqual({ actor: { in: ["user-1", "t@x.test"] } });
    expect(and).toContainEqual({
      OR: [
        { payloadJson: { startsWith: '{"module":"gold"' } },
        { eventType: { startsWith: "gold.", mode: "insensitive" } },
      ],
    });
    expect(and).toContainEqual({ eventType: { endsWith: ".deleted", mode: "insensitive" } });
  });

  it("ignores an action it does not know", () => {
    expect(parseActivityFilters(new URLSearchParams("action=exploded")).action).toBeUndefined();
  });
});
