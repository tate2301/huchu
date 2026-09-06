import { describe, expect, it } from "vitest";

import { describeChange, diffFields, fieldLabel, isHistoryActivity } from "./history";

describe("diffFields", () => {
  it("reports only the watched fields that moved", () => {
    const changes = diffFields(
      { name: "Delta", city: "Harare", notes: "old" },
      { name: "Delta Interiors", city: "Harare", notes: "new" },
      ["name", "city"],
    );
    expect(changes).toEqual([
      { field: "name", label: "Name", from: "Delta", to: "Delta Interiors" },
    ]);
  });

  it("treats undefined and null as the same absence", () => {
    expect(diffFields({ city: undefined }, { city: null }, ["city"])).toEqual([]);
  });

  it("normalises dates so an unchanged timestamp isn't reported", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    expect(
      diffFields({ expectedCloseDate: date }, { expectedCloseDate: new Date(date) }, [
        "expectedCloseDate",
      ]),
    ).toEqual([]);
  });

  it("catches a field being cleared", () => {
    const changes = diffFields({ assignedToId: "u1" }, { assignedToId: null }, ["assignedToId"]);
    expect(changes).toEqual([{ field: "assignedToId", label: "Owner", from: "u1", to: null }]);
  });

  it("compares arrays by value, not identity", () => {
    expect(diffFields({ tags: ["a"] }, { tags: ["a"] }, ["tags"])).toEqual([]);
    expect(diffFields({ tags: ["a"] }, { tags: ["a", "b"] }, ["tags"])).toHaveLength(1);
  });
});

describe("fieldLabel", () => {
  it("gives a readable label for a known field", () => {
    expect(fieldLabel("assignedToId")).toBe("Owner");
    expect(fieldLabel("parentClientId")).toBe("Parent company");
  });

  it("falls back to the raw name for an unmapped field", () => {
    expect(fieldLabel("someNewColumn")).toBe("someNewColumn");
  });
});

describe("describeChange", () => {
  it("reads as a sentence", () => {
    expect(
      describeChange({ field: "value", label: "Value", from: 100, to: 250 }),
    ).toBe("Value: 100 → 250");
  });

  it("says empty rather than null", () => {
    expect(describeChange({ field: "city", label: "City", from: null, to: "Harare" })).toBe(
      "City: empty → Harare",
    );
  });
});

describe("isHistoryActivity", () => {
  it("counts a field-change entry", () => {
    expect(isHistoryActivity({ type: "SYSTEM", metadata: { kind: "FIELD_CHANGE" } })).toBe(true);
  });

  it("counts a stage change", () => {
    expect(isHistoryActivity({ type: "STAGE_CHANGE", metadata: null })).toBe(true);
  });

  it("excludes a logged call — that is interaction, not history", () => {
    expect(isHistoryActivity({ type: "CALL", metadata: null })).toBe(false);
  });

  it("excludes a system entry that isn't a field change, like a conversion note", () => {
    expect(isHistoryActivity({ type: "SYSTEM", metadata: { leadId: "x" } })).toBe(false);
  });
});
