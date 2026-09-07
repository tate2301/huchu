import { describe, expect, it } from "vitest";

import {
  describeAutomation,
  dueDateFromDays,
  evaluateCondition,
  isSettableField,
  matchesConditions,
  matchesTrigger,
  readField,
  type AutomationAction,
  type AutomationCondition,
} from "./automation";

const lead = {
  id: "l-1",
  estimatedValue: 25_000,
  source: "Referral",
  lostReason: null,
  services: ["solar", "roofing"],
  assignedToId: null,
  client: { name: "Chi Ltd" },
};

describe("readField", () => {
  it("reads a nested field", () => {
    expect(readField(lead, "client.name")).toBe("Chi Ltd");
  });

  it("returns nothing rather than throwing on a missing path", () => {
    expect(readField(lead, "client.address.city")).toBeUndefined();
    expect(readField(lead, "nope.nope")).toBeUndefined();
  });
});

describe("evaluateCondition", () => {
  const check = (condition: AutomationCondition) => evaluateCondition(lead, condition);

  it("compares as strings so a form's '25000' matches the number", () => {
    expect(check({ field: "estimatedValue", operator: "equals", value: "25000" })).toBe(true);
    expect(check({ field: "estimatedValue", operator: "equals", value: 25_000 })).toBe(true);
  });

  it("treats null and missing as empty", () => {
    expect(check({ field: "lostReason", operator: "is_empty" })).toBe(true);
    expect(check({ field: "assignedToId", operator: "is_empty" })).toBe(true);
    expect(check({ field: "source", operator: "is_not_empty" })).toBe(true);
  });

  it("looks inside a list for contains", () => {
    expect(check({ field: "services", operator: "contains", value: "solar" })).toBe(true);
    expect(check({ field: "services", operator: "contains", value: "plumbing" })).toBe(false);
  });

  it("does substring matching on text", () => {
    expect(check({ field: "source", operator: "contains", value: "refer" })).toBe(true);
  });

  it("never fires a numeric comparison on a field that isn't there", () => {
    // Treating a missing value as zero would make "value is less than 1000"
    // fire on every record with no value recorded.
    expect(check({ field: "missing", operator: "less_than", value: 1000 })).toBe(false);
    expect(check({ field: "missing", operator: "greater_than", value: 0 })).toBe(false);
    expect(check({ field: "lostReason", operator: "greater_than", value: 0 })).toBe(false);
  });

  it("compares numbers as numbers", () => {
    expect(check({ field: "estimatedValue", operator: "greater_than", value: 20_000 })).toBe(true);
    expect(check({ field: "estimatedValue", operator: "less_than", value: 20_000 })).toBe(false);
  });
});

describe("matchesConditions", () => {
  it("requires every condition", () => {
    expect(
      matchesConditions(lead, [
        { field: "source", operator: "equals", value: "Referral" },
        { field: "estimatedValue", operator: "greater_than", value: 10_000 },
      ]),
    ).toBe(true);

    expect(
      matchesConditions(lead, [
        { field: "source", operator: "equals", value: "Referral" },
        { field: "estimatedValue", operator: "greater_than", value: 100_000 },
      ]),
    ).toBe(false);
  });

  it("fires on the trigger alone when there are no conditions", () => {
    expect(matchesConditions(lead, [])).toBe(true);
  });
});

describe("matchesTrigger", () => {
  it("only fires on its own trigger", () => {
    expect(
      matchesTrigger({ trigger: "LEAD_CREATED" }, { trigger: "LEAD_STAGE_CHANGED" }),
    ).toBe(false);
  });

  it("scopes a stage rule to that stage", () => {
    const rule = { trigger: "DEAL_STAGE_CHANGED" as const, triggerConfig: { stage: "Won" } };
    expect(matchesTrigger(rule, { trigger: "DEAL_STAGE_CHANGED", stage: "Won" })).toBe(true);
    expect(matchesTrigger(rule, { trigger: "DEAL_STAGE_CHANGED", stage: "Quoted" })).toBe(false);
  });

  it("fires on any stage when the rule names none", () => {
    const rule = { trigger: "DEAL_STAGE_CHANGED" as const };
    expect(matchesTrigger(rule, { trigger: "DEAL_STAGE_CHANGED", stage: "Quoted" })).toBe(true);
  });
});

describe("dueDateFromDays", () => {
  it("lands in the morning, not at whatever second the rule ran", () => {
    const due = dueDateFromDays(2, new Date(2026, 2, 10, 16, 43, 12));
    expect(due.getDate()).toBe(12);
    expect(due.getHours()).toBe(9);
    expect(due.getMinutes()).toBe(0);
  });

  it("means today when the rule says zero days", () => {
    const due = dueDateFromDays(0, new Date(2026, 2, 10, 16, 0, 0));
    expect(due.getDate()).toBe(10);
  });
});

describe("describeAutomation", () => {
  const actions: AutomationAction[] = [
    { type: "CREATE_TASK", title: "Ring them", dueInDays: 1 },
    { type: "ADD_TAG", tag: "hot" },
  ];

  it("reads as a sentence rather than as JSON", () => {
    const text = describeAutomation({
      trigger: "LEAD_CREATED",
      conditions: [{ field: "estimatedValue", operator: "greater_than", value: 10_000 }],
      actions,
    });
    expect(text).toBe(
      'A lead is created, and estimatedValue is more than 10000 → create "Ring them" due in 1 day, then tag it "hot".',
    );
  });

  it("names the stage a stage rule watches", () => {
    const text = describeAutomation({
      trigger: "DEAL_STAGE_CHANGED",
      triggerConfig: { stage: "Won" },
      actions: [{ type: "NOTIFY", recipientIds: [], message: "hi" }],
    });
    expect(text).toContain("A deal moves stage to Won");
    expect(text).toContain("notify the owner");
  });

  it("spells out an idle rule in days", () => {
    const text = describeAutomation({
      trigger: "RECORD_IDLE",
      triggerConfig: { idleDays: 14, entity: "DEAL" },
      actions: [{ type: "ADD_TAG", tag: "stale" }],
    });
    expect(text).toContain("Nothing happens on a deal for 14 days");
  });

  it("drops the value from an emptiness check", () => {
    const text = describeAutomation({
      trigger: "LEAD_CREATED",
      conditions: [{ field: "assignedToId", operator: "is_empty" }],
      actions: [{ type: "ASSIGN_OWNER", assignedToId: null }],
    });
    expect(text).toContain("and assignedToId is empty");
    expect(text).toContain("assign by the usual rule");
  });
});

describe("isSettableField", () => {
  it("allows only the fields a rule is meant to touch", () => {
    expect(isSettableField("LEAD", "probability")).toBe(true);
    // Letting a rule write companyId would move a record between tenants.
    expect(isSettableField("LEAD", "companyId")).toBe(false);
    expect(isSettableField("PERSON", "probability")).toBe(false);
  });
});
