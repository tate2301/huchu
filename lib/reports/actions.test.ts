import { describe, expect, it } from "vitest";

import type { FieldDefinition } from "@/lib/forms/fields";

import { answersToBody, fillTemplate } from "./actions";

describe("fillTemplate", () => {
  const row = { id: "q1", dealId: null, leadId: "l 9", date: "2026-09-01" };

  it("fills holes from the row, encoded for a path", () => {
    expect(fillTemplate("/crm/leads/{leadId}", row)).toBe("/crm/leads/l%209");
  });

  it("falls through to the next template when a hole is blank", () => {
    expect(fillTemplate(["/crm/deals/{dealId}", "/crm/leads/{leadId}"], row)).toBe("/crm/leads/l%209");
  });

  it("gives nothing when no template fills", () => {
    expect(fillTemplate("/crm/deals/{dealId}", row)).toBeNull();
  });

  it("leaves prose unencoded when asked", () => {
    expect(fillTemplate("Delete the report for {date}?", row, false)).toBe("Delete the report for 2026-09-01?");
  });
});

describe("answersToBody", () => {
  const fields: FieldDefinition[] = [
    { key: "status", label: "Status", type: "select", required: true, options: [{ value: "LATE", label: "Late" }] },
    { key: "overtime", label: "Overtime", type: "number", required: false },
    { key: "notes", label: "Notes", type: "longText", required: false },
  ];

  it("types each answer by its field and clears blanks", () => {
    expect(answersToBody(fields, { status: "LATE", overtime: "1.5", notes: "" })).toEqual({
      status: "LATE",
      overtime: 1.5,
      notes: null,
    });
  });

  it("sends only what was answered", () => {
    expect(answersToBody(fields, { status: "LATE" })).toEqual({ status: "LATE" });
  });
});
