import { describe, expect, it } from "vitest";

import type { FieldDefinition } from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";

import { applyFormChange, changedKey, hasChange, type FormDraft } from "./form-changes";

const draft: FormDraft = {
  fields: [
    { key: "subfloor", label: "Subfloor", type: "select", required: false, options: [{ value: "concrete", label: "Concrete" }] } as FieldDefinition,
    { key: "notes", label: "Notes", type: "text", required: false } as FieldDefinition,
  ],
  quoteLines: [
    { id: "laminate", description: "Laminate planks", unitPrice: 24.5, quantity: { from: "field", key: "areas", factor: 1.1 } } as QuoteLine,
    { id: "callout", description: "Call-out", unitPrice: 20, quantity: { from: "fixed", value: 1 } } as QuoteLine,
  ],
};
const said = { title: "", why: "", read: "Site visit answers" };

describe("keeping Vane's changes to a form", () => {
  it("make a question required, add a choice, or change a line's waste, in the draft only", () => {
    const required = applyFormChange(draft, { kind: "require", key: "subfloor", ...said });
    expect(required.fields[0]!.required).toBe(true);
    expect(draft.fields[0]!.required).toBe(false);

    const screed = applyFormChange(draft, { kind: "add_option", key: "subfloor", option: { value: "screed", label: "Screed" }, ...said });
    expect(screed.fields[0]!.options).toEqual([
      { value: "concrete", label: "Concrete" },
      { value: "screed", label: "Screed" },
    ]);

    const waste = applyFormChange(draft, { kind: "quote_factor", lineId: "laminate", factor: 1.13, ...said });
    expect(waste.quoteLines[0]!.quantity).toEqual({ from: "field", key: "areas", factor: 1.13 });
    expect(hasChange(waste, { kind: "quote_factor", lineId: "laminate", factor: 1.13, ...said })).toBe(true);
  });

  it("change nothing when its question or line has gone, or it is already so", () => {
    expect(applyFormChange(draft, { kind: "require", key: "gone", ...said })).toBe(draft);
    expect(applyFormChange(draft, { kind: "quote_factor", lineId: "callout", factor: 1.1, ...said })).toBe(draft);
    expect(applyFormChange(draft, { kind: "add_option", key: "subfloor", option: { value: "concrete", label: "Concrete" }, ...said })).toBe(draft);
    expect(changedKey({ kind: "quote_factor", lineId: "laminate", factor: 1.13, ...said })).toBeNull();
  });
});
