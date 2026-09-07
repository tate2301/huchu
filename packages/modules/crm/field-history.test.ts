import { describe, it, expect } from "vitest";

import { diffFields, fieldLabel, stringifyFieldValue } from "./field-history";

describe("diffFields", () => {
  it("records a field that moved", () => {
    expect(diffFields("LEAD", { stage: "NEW" }, { stage: "CONTACTED" })).toEqual([
      { field: "stage", oldValue: "NEW", newValue: "CONTACTED" },
    ]);
  });

  it("ignores a field the update did not mention", () => {
    // A PATCH that says nothing about the owner is not a claim that it was
    // cleared. Treating absent as null would record every save as wiping half
    // the record.
    expect(diffFields("LEAD", { stage: "NEW", assignedToId: "u1" }, { stage: "NEW" })).toEqual(
      [],
    );
  });

  it("ignores a field that was set to what it already was", () => {
    expect(diffFields("LEAD", { title: "Roof" }, { title: "Roof" })).toEqual([]);
  });

  it("does not read 5 and \"5\" as a change nobody made", () => {
    expect(diffFields("LEAD", { estimatedValue: 5 }, { estimatedValue: "5" })).toEqual([]);
  });

  it("records a value being cleared", () => {
    expect(diffFields("LEAD", { lostReason: "Price" }, { lostReason: null })).toEqual([
      { field: "lostReason", oldValue: "Price", newValue: null },
    ]);
  });

  it("skips fields nobody asked to track", () => {
    expect(diffFields("LEAD", { notes: "a" }, { notes: "b" })).toEqual([]);
  });

  it("knows nothing about an entity it has no list for", () => {
    expect(diffFields("WOMBAT", { a: 1 }, { a: 2 })).toEqual([]);
  });
});

describe("stringifyFieldValue", () => {
  it("reads an empty string as nothing, the same as null", () => {
    // Otherwise clearing a field reads as "changed from Roof to ''".
    expect(stringifyFieldValue("")).toBeNull();
    expect(stringifyFieldValue("   ")).toBeNull();
  });

  it("keeps a date comparable", () => {
    const date = new Date("2026-07-28T10:00:00.000Z");
    expect(stringifyFieldValue(date)).toBe("2026-07-28T10:00:00.000Z");
  });

  it("says yes and no rather than true and false", () => {
    expect(stringifyFieldValue(true)).toBe("Yes");
  });
});

describe("fieldLabel", () => {
  it("uses the written label where there is one", () => {
    expect(fieldLabel("assignedToId")).toBe("Owner");
  });

  it("falls back to splitting the camel case", () => {
    expect(fieldLabel("someNewField")).toBe("Some New Field");
  });
});
