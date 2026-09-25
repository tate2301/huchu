import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindFirst, mockCreate } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformAuditEvent: { findFirst: mockFindFirst, create: mockCreate },
  },
}));

import { runWithActivityRequest, type ActivityRequest } from "./context";
import { flushActivity } from "./flush";
import { recordActivityWrite } from "./record";

function openRequest(overrides: Partial<ActivityRequest> = {}): ActivityRequest {
  return {
    method: "PATCH",
    path: "/api/v2/schools/students/s1",
    companyId: "company-1",
    actorId: "user-1",
    actorName: "Tendai",
    actorRole: "MANAGER",
    changes: [],
    failed: false,
    explicit: false,
    flushed: false,
    ...overrides,
  };
}

describe("activity recording and flush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});
  });

  it("writes one event per request, named by its first change", async () => {
    const record = openRequest();
    runWithActivityRequest(record, () => {
      recordActivityWrite({
        model: "SchoolStudent",
        operation: "update",
        queryArgs: { data: { status: "ENROLLED" } },
        result: { id: "s1", firstName: "Chipo", lastName: "Dube" },
      });
      // The same record again: merged, not listed twice.
      recordActivityWrite({
        model: "SchoolStudent",
        operation: "update",
        queryArgs: { data: { classId: "c1" } },
        result: { id: "s1", firstName: "Chipo", lastName: "Dube" },
      });
      recordActivityWrite({
        model: "SchoolGuardian",
        operation: "create",
        queryArgs: { data: {} },
        result: { id: "g1", name: "Mrs Dube" },
      });
    });

    await flushActivity(record);

    expect(mockCreate).toHaveBeenCalledOnce();
    const data = mockCreate.mock.calls[0][0].data;
    expect(data.eventType).toBe("SCHOOL_STUDENT.UPDATED");
    expect(data.entityType).toBe("SchoolStudent");
    expect(data.entityId).toBe("s1");
    expect(data.actor).toBe("user-1");
    const payload = JSON.parse(data.payloadJson);
    expect(payload.module).toBe("schools");
    expect(payload.actorName).toBe("Tendai");
    expect(payload.changes).toHaveLength(2);
    expect(payload.changes[0].fields).toEqual([
      { name: "status", value: "ENROLLED" },
      { name: "classId", value: "c1" },
    ]);
    expect(data.payloadJson.startsWith('{"module":"schools"')).toBe(true);
  });

  it("writes nothing for a failed request, an explicit one, or one with no changes", async () => {
    const change = {
      model: "Site",
      action: "created" as const,
      recordId: "x",
      label: "Main",
    };
    await flushActivity(openRequest({ failed: true, changes: [change] }));
    await flushActivity(openRequest({ explicit: true, changes: [change] }));
    await flushActivity(openRequest());
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("writes once, and ignores writes recorded after", async () => {
    const record = openRequest({
      changes: [{ model: "Site", action: "created", recordId: "x", label: "Main" }],
    });
    await flushActivity(record);
    await flushActivity(record);
    runWithActivityRequest(record, () =>
      recordActivityWrite({ model: "Site", operation: "create", queryArgs: {}, result: { id: "y" } }),
    );
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(record.changes).toHaveLength(1);
  });
});
