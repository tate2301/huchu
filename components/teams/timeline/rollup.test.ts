import { describe, expect, it } from "vitest";

import { dayKey, rollUp, type RollableEvent } from "./rollup";

const at = (iso: string) => new Date(iso).getTime();

function ev(id: string, iso: string, over: Partial<RollableEvent> = {}): RollableEvent {
  return {
    id,
    at: at(iso),
    actor: { kind: "person", id: "rudo" },
    kind: "edit",
    module: "sales",
    recordId: "J-0142",
    ...over,
  };
}

describe("rollUp", () => {
  it("makes one line of a person's edits within an hour", () => {
    const rolled = rollUp([
      ev("a", "2026-10-19T08:40:00Z", { field: "Value" }),
      ev("b", "2026-10-19T08:20:00Z", { field: "Finish" }),
      ev("c", "2026-10-19T08:05:00Z", { field: "Fitting date" }),
    ]);
    expect(rolled).toHaveLength(1);
    const [group] = rolled;
    expect(group.type).toBe("edits");
    if (group.type === "edits") {
      expect(group.events.map((e) => e.id)).toEqual(["a", "b", "c"]);
      expect(group.fields).toEqual(["Value", "Finish", "Fitting date"]);
    }
  });

  it("measures the hour from the first edit, so a window never stretches", () => {
    const rolled = rollUp([
      ev("d", "2026-10-19T09:50:00Z"),
      ev("c", "2026-10-19T09:20:00Z"),
      ev("b", "2026-10-19T08:50:00Z"),
      ev("a", "2026-10-19T08:00:00Z"),
    ]);
    // a opens a window to 09:00; b (08:50) is in it. c (09:20) opens the next; d (09:50) is in that.
    expect(rolled.map((r) => r.type)).toEqual(["edits", "edits"]);
    expect(rolled.map((r) => (r.type === "edits" ? r.events.length : 0))).toEqual([2, 2]);
  });

  it("keeps different people, and different records, apart", () => {
    const rolled = rollUp([
      ev("a", "2026-10-19T08:40:00Z"),
      ev("b", "2026-10-19T08:30:00Z", { actor: { kind: "person", id: "tinashe" } }),
      ev("c", "2026-10-19T08:20:00Z", { recordId: "J-0129" }),
    ]);
    expect(rolled.every((r) => r.type === "single")).toBe(true);
  });

  it("never rolls up a person's words", () => {
    const rolled = rollUp([
      ev("a", "2026-10-19T08:14:00Z", { kind: "comment" }),
      ev("b", "2026-10-19T08:12:00Z", { kind: "comment" }),
    ]);
    expect(rolled.map((r) => r.type)).toEqual(["single", "single"]);
  });

  it("turns machine events of one kind in a day into a count", () => {
    const sale = (id: string, iso: string): RollableEvent =>
      ev(id, iso, { actor: { kind: "machine", id: "till-2" }, kind: "sale", module: "retail", recordId: undefined });
    const rolled = rollUp([
      sale("s3", "2026-10-19T08:15:00Z"),
      sale("s2", "2026-10-19T07:52:00Z"),
      sale("s1", "2026-10-19T05:34:00Z"),
      sale("old", "2026-10-18T10:00:00Z"),
    ]);
    expect(rolled.map((r) => r.type)).toEqual(["count", "single"]);
    const [count] = rolled;
    if (count.type === "count") {
      expect(count.events).toHaveLength(3);
      expect(count.kind).toBe("sale");
    }
  });

  it("counts a day in the workspace's zone, not UTC", () => {
    // 23:30 UTC on the 18th is 01:30 on the 19th in Harare.
    expect(dayKey(at("2026-10-18T23:30:00Z"))).toBe("2026-10-19");
    expect(dayKey(at("2026-10-18T21:30:00Z"))).toBe("2026-10-18");
  });

  it("puts a group where its newest member was", () => {
    const rolled = rollUp([
      ev("a", "2026-10-19T10:40:00Z", { field: "Value" }),
      ev("m", "2026-10-19T10:31:00Z", { kind: "comment" }),
      ev("b", "2026-10-19T10:20:00Z", { field: "Finish" }),
    ]);
    expect(rolled.map((r) => r.type)).toEqual(["edits", "single"]);
  });
});
