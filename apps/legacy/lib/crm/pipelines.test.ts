import { describe, expect, it } from "vitest";

import {
  DEFAULT_STAGE_TEMPLATE,
  firstOpenStage,
  isDealStale,
  missingRequiredFields,
  validateStages,
  type StageInput,
} from "./pipelines";

function stage(overrides: Partial<StageInput> = {}): StageInput {
  return { name: "Stage", status: "OPEN", probability: 0, ...overrides };
}

describe("DEFAULT_STAGE_TEMPLATE", () => {
  it("is a valid pipeline out of the box", () => {
    const stages = DEFAULT_STAGE_TEMPLATE.map((entry) => stage(entry));
    expect(validateStages(stages)).toEqual([]);
  });

  it("keeps the stages the CRM already shipped with", () => {
    expect(DEFAULT_STAGE_TEMPLATE.map((entry) => entry.name)).toEqual([
      "New",
      "Contacted",
      "Qualified",
      "Site visit",
      "Quoted",
      "Invoiced",
      "Won",
      "Lost",
    ]);
  });
});

describe("validateStages", () => {
  it("requires exactly one won stage", () => {
    const errors = validateStages([
      stage({ name: "Open" }),
      stage({ name: "Won", status: "WON" }),
      stage({ name: "Also won", status: "WON" }),
      stage({ name: "Lost", status: "LOST" }),
    ]);
    expect(errors).toContain("A pipeline needs exactly one won stage.");
  });

  it("requires a lost stage, so a deal can always be closed out", () => {
    const errors = validateStages([stage({ name: "Open" }), stage({ name: "Won", status: "WON" })]);
    expect(errors).toContain("A pipeline needs exactly one lost stage.");
  });

  it("requires at least one open stage to work through", () => {
    const errors = validateStages([
      stage({ name: "Won", status: "WON" }),
      stage({ name: "Lost", status: "LOST" }),
    ]);
    expect(errors).toContain("A pipeline needs at least one open stage.");
  });

  it("rejects two stages with the same name", () => {
    const errors = validateStages([
      stage({ name: "Quoted" }),
      stage({ name: "quoted" }),
      stage({ name: "Won", status: "WON" }),
      stage({ name: "Lost", status: "LOST" }),
    ]);
    expect(errors.some((error) => error.includes("both called"))).toBe(true);
  });
});

describe("firstOpenStage", () => {
  it("picks the lowest-positioned open stage, ignoring outcomes", () => {
    const stages = [
      { id: "won", status: "WON" as const, position: 0 },
      { id: "b", status: "OPEN" as const, position: 2 },
      { id: "a", status: "OPEN" as const, position: 1 },
    ];
    expect(firstOpenStage(stages)?.id).toBe("a");
  });

  it("returns undefined when there is nowhere open to start", () => {
    expect(firstOpenStage([{ id: "won", status: "WON" as const, position: 0 }])).toBeUndefined();
  });
});

describe("isDealStale", () => {
  const longAgo = new Date("2026-01-01T00:00:00.000Z");
  const now = new Date("2026-02-01T00:00:00.000Z");

  it("is stale once the stage's inactivity limit has passed", () => {
    expect(
      isDealStale({ stageEnteredAt: longAgo, status: "OPEN" }, { inactivityDays: 7, status: "OPEN" }, now),
    ).toBe(true);
  });

  it("is not stale within the limit", () => {
    expect(
      isDealStale({ stageEnteredAt: longAgo, status: "OPEN" }, { inactivityDays: 90, status: "OPEN" }, now),
    ).toBe(false);
  });

  it("never marks a won or lost deal stale — it is finished, not neglected", () => {
    expect(
      isDealStale({ stageEnteredAt: longAgo, status: "WON" }, { inactivityDays: 1, status: "WON" }, now),
    ).toBe(false);
  });

  it("is never stale when the stage sets no limit", () => {
    expect(
      isDealStale({ stageEnteredAt: longAgo, status: "OPEN" }, { inactivityDays: null, status: "OPEN" }, now),
    ).toBe(false);
  });
});

describe("missingRequiredFields", () => {
  it("finds unfilled top-level fields", () => {
    const deal = { value: null, expectedCloseDate: new Date() };
    expect(missingRequiredFields(deal, ["value", "expectedCloseDate"])).toEqual(["value"]);
  });

  it("looks into customFields for keys that aren't columns", () => {
    const deal = { customFields: { budget_confirmed: true, decision_maker: "" } };
    expect(missingRequiredFields(deal, ["budget_confirmed", "decision_maker"])).toEqual([
      "decision_maker",
    ]);
  });

  it("treats an empty array as unfilled", () => {
    expect(missingRequiredFields({ services: [] }, ["services"])).toEqual(["services"]);
  });

  it("treats false as filled in — a deliberate no is an answer", () => {
    expect(missingRequiredFields({ customFields: { needs_scaffold: false } }, ["needs_scaffold"])).toEqual([]);
  });
});
