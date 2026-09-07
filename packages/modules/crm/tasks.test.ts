import { describe, expect, it } from "vitest";

import {
  isTaskOverdue,
  nextOccurrence,
  outcomesForType,
  requiresOutcome,
  suggestsFollowUp,
  taskQueueWhere,
  taskRecordRef,
} from "./tasks";

const params = { companyId: "co-1", userId: "user-1" };

describe("outcomes", () => {
  it("asks a call what happened but lets a general task just be done", () => {
    expect(requiresOutcome("CALL")).toBe(true);
    expect(requiresOutcome("GENERAL")).toBe(false);
    expect(outcomesForType("GENERAL")).toEqual([]);
  });

  it("offers only outcomes that make sense for the type", () => {
    expect(outcomesForType("EMAIL")).toEqual(["REPLIED", "NO_REPLY"]);
    expect(outcomesForType("CALL")).toContain("NO_ANSWER");
    expect(outcomesForType("EMAIL")).not.toContain("NO_ANSWER");
  });

  it("suggests booking the next step when the conversation is unfinished", () => {
    expect(suggestsFollowUp("NO_ANSWER")).toBe(true);
    expect(suggestsFollowUp("CALL_BACK_LATER")).toBe(true);
    expect(suggestsFollowUp("NOT_INTERESTED")).toBe(false);
    expect(suggestsFollowUp(null)).toBe(false);
  });
});

describe("taskQueueWhere", () => {
  it("always scopes to the company", () => {
    const queues = ["MINE", "TODAY", "OVERDUE", "UPCOMING", "COMPLETED", "TEAM", "UNASSIGNED"] as const;
    for (const queue of queues) {
      expect(taskQueueWhere(queue, params).companyId).toBe("co-1");
    }
  });

  it("counts overdue work as part of today", () => {
    const now = new Date("2026-03-10T14:00:00Z");
    const where = taskQueueWhere("TODAY", { ...params, now });
    // An upper bound with no lower bound is what pulls last week's task into
    // today rather than leaving it in a queue nobody opens.
    expect(where.dueAt).toHaveProperty("lt");
    expect(where.dueAt).not.toHaveProperty("gte");
  });

  it("splits overdue from upcoming at different boundaries", () => {
    const now = new Date("2026-03-10T14:00:00Z");
    const overdue = taskQueueWhere("OVERDUE", { ...params, now }).dueAt as { lt: Date };
    const upcoming = taskQueueWhere("UPCOMING", { ...params, now }).dueAt as { gte: Date };
    // Overdue is "before now"; upcoming is "after today ends".
    expect(overdue.lt.getTime()).toBe(now.getTime());
    expect(upcoming.gte.getTime()).toBeGreaterThan(now.getTime());
  });

  it("keeps team and unassigned unscoped to one person", () => {
    expect(taskQueueWhere("TEAM", params).assignedToId).toEqual({ not: null });
    expect(taskQueueWhere("UNASSIGNED", params).assignedToId).toBeNull();
  });

  it("shows completed work only for the person who did it", () => {
    const where = taskQueueWhere("COMPLETED", params);
    expect(where.assignedToId).toBe("user-1");
    expect(where.status).toBe("COMPLETED");
  });
});

describe("nextOccurrence", () => {
  it("returns nothing for a one-off task", () => {
    expect(nextOccurrence(new Date("2026-03-10T09:00:00Z"), "NONE", 1)).toBeNull();
  });

  it("steps by days and weeks", () => {
    const due = new Date("2026-03-10T09:00:00Z");
    expect(nextOccurrence(due, "DAILY", 3)?.getDate()).toBe(13);
    expect(nextOccurrence(due, "WEEKLY", 2)?.getDate()).toBe(24);
  });

  it("clamps a month-end task to the last day of a shorter month", () => {
    // A task due on the 31st must not skip January by rolling into March.
    const due = new Date(2026, 0, 31, 9, 0, 0);
    const next = nextOccurrence(due, "MONTHLY", 1)!;
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });

  it("keeps the day of month when the next month is long enough", () => {
    const due = new Date(2026, 2, 15, 9, 0, 0);
    const next = nextOccurrence(due, "MONTHLY", 2)!;
    expect(next.getMonth()).toBe(4);
    expect(next.getDate()).toBe(15);
  });

  it("treats a nonsense interval as one period rather than standing still", () => {
    const due = new Date("2026-03-10T09:00:00Z");
    expect(nextOccurrence(due, "DAILY", 0)?.getDate()).toBe(11);
  });
});

describe("isTaskOverdue", () => {
  const now = new Date("2026-03-10T14:00:00Z");

  it("is overdue only while still open", () => {
    expect(isTaskOverdue({ dueAt: "2026-03-09T09:00:00Z", status: "OPEN" }, now)).toBe(true);
    expect(isTaskOverdue({ dueAt: "2026-03-09T09:00:00Z", status: "COMPLETED" }, now)).toBe(false);
    expect(isTaskOverdue({ dueAt: "2026-03-11T09:00:00Z", status: "OPEN" }, now)).toBe(false);
  });
});

describe("taskRecordRef", () => {
  it("prefers the deal when a task is filed against several records", () => {
    const ref = taskRecordRef({ dealId: "d-1", clientId: "c-1", siteId: "s-1" });
    expect(ref).toEqual({ kind: "deal", id: "d-1", href: "/crm/deals/d-1" });
  });

  it("returns nothing for a standalone task", () => {
    expect(taskRecordRef({})).toBeNull();
  });
});
