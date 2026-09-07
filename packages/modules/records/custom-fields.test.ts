import { describe, expect, it } from "vitest";

import {
  buildCustomFieldValues,
  coerceFieldValue,
  customFieldWhere,
  formatFieldValue,
  groupBySection,
  mergeCustomFields,
  normalizeFieldKey,
  validateDefinition,
  type FieldDefinition,
} from "./custom-fields";

function field(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: "f1",
    entity: "DEAL",
    key: "budget",
    label: "Budget",
    description: null,
    type: "SHORT_TEXT",
    isRequired: false,
    defaultValue: null,
    options: null,
    section: null,
    position: 0,
    showInTable: false,
    ...overrides,
  };
}

describe("normalizeFieldKey", () => {
  it("turns a label into a stable snake_case key", () => {
    expect(normalizeFieldKey("Roof Area (m²)")).toBe("roof_area_m");
    expect(normalizeFieldKey("  Decision Maker  ")).toBe("decision_maker");
  });

  it("collapses punctuation runs without leaving separators at the edges", () => {
    expect(normalizeFieldKey("--Budget--")).toBe("budget");
  });
});

describe("validateDefinition", () => {
  const base = { entity: "DEAL", label: "Priority", type: "SINGLE_SELECT" } as const;

  it("requires options on a select field", () => {
    expect(validateDefinition({ ...base })).toContain("A select field needs at least one option.");
  });

  it("rejects options on a field type that has none", () => {
    const errors = validateDefinition({
      entity: "DEAL",
      label: "Notes",
      type: "LONG_TEXT",
      options: [{ value: "a", label: "A" }],
    });
    expect(errors[0]).toContain("don't take options");
  });

  it("rejects duplicate option values", () => {
    const errors = validateDefinition({
      ...base,
      options: [
        { value: "high", label: "High" },
        { value: "high", label: "High again" },
      ],
    });
    expect(errors.some((error) => error.includes("share the value"))).toBe(true);
  });
});

describe("coerceFieldValue", () => {
  it("clears an optional field on empty input rather than storing a blank", () => {
    expect(coerceFieldValue(field(), "")).toEqual({ ok: true, value: null });
  });

  it("refuses to clear a required field", () => {
    const result = coerceFieldValue(field({ isRequired: true }), "");
    expect(result).toEqual({ ok: false, error: "Budget is required." });
  });

  it("accepts a bare domain as a URL the way an address bar would", () => {
    const result = coerceFieldValue(field({ type: "URL", label: "Site" }), "example.com/x");
    expect(result).toEqual({ ok: true, value: "https://example.com/x" });
  });

  it("rejects a percentage outside 0-100", () => {
    expect(coerceFieldValue(field({ type: "PERCENT" }), 140).ok).toBe(false);
    expect(coerceFieldValue(field({ type: "PERCENT" }), 40)).toEqual({ ok: true, value: 40 });
  });

  it("rejects a negative currency amount", () => {
    expect(coerceFieldValue(field({ type: "CURRENCY" }), -5).ok).toBe(false);
  });

  it("stores a DATE as a calendar day and a DATETIME as an instant", () => {
    const date = coerceFieldValue(field({ type: "DATE" }), "2026-03-04T15:00:00.000Z");
    expect(date).toEqual({ ok: true, value: "2026-03-04" });
    const datetime = coerceFieldValue(field({ type: "DATETIME" }), "2026-03-04T15:00:00.000Z");
    expect(datetime).toEqual({ ok: true, value: "2026-03-04T15:00:00.000Z" });
  });

  it("only accepts a value that is one of the select's choices", () => {
    const definition = field({
      type: "SINGLE_SELECT",
      options: [{ value: "high", label: "High" }],
    });
    expect(coerceFieldValue(definition, "high")).toEqual({ ok: true, value: "high" });
    expect(coerceFieldValue(definition, "urgent").ok).toBe(false);
  });

  it("de-duplicates multi-select values", () => {
    const definition = field({
      type: "MULTI_SELECT",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    expect(coerceFieldValue(definition, ["a", "b", "a"])).toEqual({ ok: true, value: ["a", "b"] });
  });

  it("requires a reference field to hold a record id", () => {
    const definition = field({ type: "PERSON", label: "Surveyor" });
    expect(coerceFieldValue(definition, "John").ok).toBe(false);
    expect(coerceFieldValue(definition, "0f9c1c8e-6a4b-4f6d-9c3a-2b1d5e7f8a90").ok).toBe(true);
  });

  it("stores an unchecked checkbox as false rather than dropping it", () => {
    expect(coerceFieldValue(field({ type: "CHECKBOX" }), false)).toEqual({ ok: true, value: false });
    expect(coerceFieldValue(field({ type: "CHECKBOX" }), "true")).toEqual({ ok: true, value: true });
  });
});

describe("buildCustomFieldValues", () => {
  const definitions = [
    field({ key: "budget", type: "CURRENCY", label: "Budget" }),
    field({ id: "f2", key: "urgent", type: "CHECKBOX", label: "Urgent" }),
  ];

  it("collects every error rather than stopping at the first", () => {
    const { errors } = buildCustomFieldValues(
      [
        field({ key: "a", type: "NUMBER", label: "A" }),
        field({ id: "f2", key: "b", type: "NUMBER", label: "B" }),
      ],
      { a: "x", b: "y" },
    );
    expect(errors).toHaveLength(2);
  });

  it("drops unknown keys instead of failing the save", () => {
    const { values, errors } = buildCustomFieldValues(definitions, {
      budget: 1000,
      archived_field: "stale",
    });
    expect(errors).toHaveLength(0);
    expect(values).toEqual({ budget: 1000 });
  });

  it("only touches supplied keys on a partial update", () => {
    const { values } = buildCustomFieldValues(definitions, { urgent: true }, { partial: true });
    expect(values).toEqual({ urgent: true });
  });

  it("applies defaults on a full write", () => {
    const withDefault = [field({ key: "stage_note", defaultValue: "New enquiry" })];
    const { values } = buildCustomFieldValues(withDefault, {});
    expect(values).toEqual({ stage_note: "New enquiry" });
  });
});

describe("mergeCustomFields", () => {
  it("merges over what is already stored", () => {
    expect(mergeCustomFields({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it("removes cleared keys so a user can empty a field", () => {
    expect(mergeCustomFields({ a: 1, b: 2 }, {}, ["a"])).toEqual({ b: 2 });
  });

  it("copes with a record that has no custom fields yet", () => {
    expect(mergeCustomFields(null, { a: 1 })).toEqual({ a: 1 });
  });
});

describe("customFieldWhere", () => {
  it("builds an equality filter on the JSON path", () => {
    expect(customFieldWhere("budget", 1000)).toEqual({ path: ["budget"], equals: 1000 });
  });

  it("builds a containment filter for multi-select values", () => {
    expect(customFieldWhere("tags", ["a"])).toEqual({ path: ["tags"], array_contains: ["a"] });
  });

  it("narrows nothing for an empty value", () => {
    expect(customFieldWhere("budget", "")).toBeUndefined();
    expect(customFieldWhere("tags", [])).toBeUndefined();
  });
});

describe("formatFieldValue", () => {
  it("renders a select using its option label, not its stored value", () => {
    const definition = field({
      type: "SINGLE_SELECT",
      options: [{ value: "high", label: "High priority" }],
    });
    expect(formatFieldValue(definition, "high")).toBe("High priority");
  });

  it("falls back to the raw value when the option has since been removed", () => {
    const definition = field({ type: "SINGLE_SELECT", options: [] });
    expect(formatFieldValue(definition, "gone")).toBe("gone");
  });

  it("renders an empty value as a dash", () => {
    expect(formatFieldValue(field(), null)).toBe("—");
  });
});

describe("groupBySection", () => {
  it("groups by section and orders fields by position", () => {
    const groups = groupBySection([
      field({ id: "b", key: "b", section: "Qualification", position: 2 }),
      field({ id: "a", key: "a", section: "Qualification", position: 1 }),
      field({ id: "c", key: "c", section: null, position: 0 }),
    ]);
    expect(groups[0].section).toBe("Details");
    expect(groups[1].fields.map((entry) => entry.key)).toEqual(["a", "b"]);
  });
});
