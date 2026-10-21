import { describe, expect, it } from "vitest";

import { buildTimeline, dayOf, type TimelineRow } from "./timeline";

const sean = { id: "u-sean", name: "Sean" };
const gerald = { id: "u-gerald", name: "Gerald" };
const at = (iso: string) => new Date(`2026-10-19T${iso}:00Z`);

let n = 0;
const id = () => `r${++n}`;

const comment = (when: string, actor = sean, body = "Rang the bursar"): TimelineRow => ({ kind: "comment", id: id(), at: at(when), actor, source: "WEB", module: "CRM", body });
const change = (when: string, field: string, actor: typeof sean | null = sean): TimelineRow => ({ kind: "change", id: id(), at: at(when), actor, source: null, module: "CRM", field, from: "a", to: "b" });
const activity = (when: string, type: Extract<TimelineRow, { kind: "activity" }>["type"], over: Partial<Extract<TimelineRow, { kind: "activity" }>> = {}): TimelineRow => ({
  kind: "activity",
  id: id(),
  at: at(when),
  actor: sean,
  source: "WEB",
  module: "CRM",
  type,
  subject: type,
  body: null,
  amount: null,
  ...over,
});
const till = (when: string, amount: number | null): TimelineRow => activity(when, "PAYMENT_RECORDED", { actor: null, source: "TILL", module: "RETAIL", amount });

describe("order", () => {
  it("is newest first, whatever the order the rows came in", () => {
    const rows = [comment("08:00"), activity("11:00", "CALL"), { kind: "file", id: id(), at: at("09:30"), actor: sean, source: null, module: "CRM", name: "Quote.pdf" } as TimelineRow];
    expect(buildTimeline(rows).map((entry) => entry.kind)).toEqual(["activity", "file", "comment"]);
  });
});

describe("what a person wrote", () => {
  it("is never rolled up, however many and however close", () => {
    const rows = [comment("10:00"), comment("10:01"), comment("10:02"), comment("10:03", gerald)];
    expect(buildTimeline(rows)).toHaveLength(4);
  });
});

describe("one person's edits", () => {
  it("within an hour roll into one line that opens to each edit", () => {
    const rows = [change("10:00", "stage"), change("10:20", "value"), change("10:55", "close date")];
    const [line, ...rest] = buildTimeline(rows);
    expect(rest).toHaveLength(0);
    expect(line).toMatchObject({ kind: "edits", actor: sean });
    expect(line.kind === "edits" && line.edits.map((edit) => edit.field)).toEqual(["stage", "value", "close date"]);
    expect(line.at).toEqual(at("10:55"));
  });

  it("start a new line once the hour from the first is up", () => {
    const rows = [change("10:00", "stage"), change("10:59", "value"), change("11:00", "close date")];
    const lines = buildTimeline(rows).filter((entry) => entry.kind === "edits");
    expect(lines.map((line) => line.kind === "edits" && line.edits.length)).toEqual([1, 2]);
  });

  it("do not roll across people, and a comment between does not break a line", () => {
    const rows = [change("10:00", "stage"), change("10:05", "value", gerald), comment("10:10"), change("10:15", "close date")];
    const entries = buildTimeline(rows);
    const lines = entries.filter((entry) => entry.kind === "edits");
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => (line.kind === "edits" ? line.actor?.name : null)).sort()).toEqual(["Gerald", "Sean"]);
    expect(entries.filter((entry) => entry.kind === "comment")).toHaveLength(1);
  });
});

describe("machine events", () => {
  it("of one kind on one day roll into a count and a total", () => {
    const rows = [till("08:10", 12.5), till("09:40", 30), till("15:00", 7.25), till("07:00", null)];
    const [line] = buildTimeline(rows);
    expect(line).toMatchObject({ kind: "machine", source: "TILL", type: "PAYMENT_RECORDED", count: 4, total: 49.75, day: "2026-10-19" });
    expect(line.at).toEqual(at("15:00"));
  });

  it("keep a lone event as it is, and keep days and kinds apart", () => {
    const rows = [
      till("08:00", 5),
      { ...till("08:00", 5), at: new Date("2026-10-20T08:00:00Z") },
      activity("09:00", "SYSTEM", { actor: null, source: "SYSTEM" }),
      activity("10:00", "SYSTEM", { actor: null, source: "BANK" }),
    ];
    expect(buildTimeline(rows).map((entry) => entry.kind)).toEqual(["activity", "activity", "activity", "activity"]);
  });

  it("count the day in Harare time, two hours ahead of UTC", () => {
    expect(dayOf(new Date("2026-10-19T22:30:00Z"))).toBe("2026-10-20");
    const rows = [till("21:30", 1), { ...till("21:30", 1), at: new Date("2026-10-19T22:30:00Z") }];
    expect(buildTimeline(rows).map((entry) => entry.kind)).toEqual(["activity", "activity"]);
  });

  it("do not roll a person's own calls", () => {
    const rows = [activity("09:00", "CALL"), activity("09:30", "CALL"), activity("10:00", "CALL")];
    expect(buildTimeline(rows)).toHaveLength(3);
  });

  it("show a total of nothing when none moved money", () => {
    const [line] = buildTimeline([activity("09:00", "SYSTEM", { actor: null, source: "SYSTEM" }), activity("09:30", "SYSTEM", { actor: null, source: "SYSTEM" })]);
    expect(line).toMatchObject({ kind: "machine", count: 2, total: null });
  });
});

describe("filters", () => {
  const rows = [
    comment("08:00"),
    activity("08:30", "CALL"),
    activity("09:00", "DOCUMENT_SENT"),
    activity("09:30", "STAGE_CHANGE"),
    activity("09:45", "NOTE"),
    { kind: "file", id: id(), at: at("10:00"), actor: sean, source: null, module: "CRM", name: "Quote.pdf" } as TimelineRow,
    change("10:30", "value"),
  ];

  it("Everything keeps all", () => expect(buildTimeline(rows, "everything")).toHaveLength(7));
  it("Comments", () => expect(buildTimeline(rows, "comments").map((entry) => entry.kind)).toEqual(["comment"]));
  it("Documents are files and document events", () => expect(buildTimeline(rows, "documents").map((entry) => entry.kind)).toEqual(["file", "activity"]));
  it("Calls", () => expect(buildTimeline(rows, "calls").map((entry) => entry.kind)).toEqual(["activity"]));
  it("Changes are field edits and stage moves", () => expect(buildTimeline(rows, "changes").map((entry) => entry.kind)).toEqual(["edits", "activity"]));

  it("picks the rows first and rolls up what is left", () => {
    const mixed = [till("08:00", 1), till("09:00", 2), comment("09:30")];
    expect(buildTimeline(mixed, "comments")).toHaveLength(1);
    expect(buildTimeline(mixed, "everything").map((entry) => entry.kind)).toEqual(["comment", "machine"]);
  });
});
