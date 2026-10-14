import { describe, expect, it } from "vitest";

import type { FieldDefinition } from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";

import { applyFormChange, changeRefusal, hasChange, proposalOf, type FormDraft } from "./form-changes";

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

describe("Vane's changes to a form", () => {
  it("make a question required, add a choice, or change a line's waste, in the draft only", () => {
    const required = applyFormChange(draft, { type: "require", key: "subfloor" });
    expect(required.fields[0]!.required).toBe(true);
    expect(draft.fields[0]!.required).toBe(false);

    const screed = applyFormChange(draft, { type: "add_option", key: "subfloor", option: { value: "screed", label: "Screed, new" } });
    expect(screed.fields[0]!.options).toEqual([
      { value: "concrete", label: "Concrete" },
      { value: "screed", label: "Screed, new" },
    ]);

    const waste = applyFormChange(draft, { type: "waste", lineId: "laminate", factor: 1.13 });
    expect(waste.quoteLines[0]!.quantity).toEqual({ from: "field", key: "areas", factor: 1.13 });
    expect(hasChange(waste, { type: "waste", lineId: "laminate", factor: 1.13 })).toBe(true);
  });

  it("say why one no longer fits, and change nothing", () => {
    expect(changeRefusal(draft, { type: "require", key: "gone" })).toBe("That question is no longer on the form.");
    expect(changeRefusal(draft, { type: "add_option", key: "notes", option: { value: "x", label: "X" } })).toBe("Notes is not a list to pick from.");
    expect(changeRefusal(draft, { type: "waste", lineId: "callout", factor: 1.1 })).toBe("Call-out is a fixed quantity, with no waste to change.");
    expect(applyFormChange(draft, { type: "require", key: "gone" })).toBe(draft);
  });

  it("read a Vane action as the builder's proposal", () => {
    const params = { setId: "s", form: "Floor site visit", change: { type: "require", key: "subfloor" }, headline: "Make Subfloor required", reason: "Skipped on 18 of 86 visits.", read: "Site visit answers", basis: "From 86 visits since July" };
    expect(proposalOf({ id: "a", status: "PROPOSED", params, result: null })).toEqual({
      id: "a",
      status: "proposed",
      headline: "Make Subfloor required",
      reason: "Skipped on 18 of 86 visits.",
      read: "Site visit answers",
      basis: "From 86 visits since July",
      change: { type: "require", key: "subfloor" },
      failed: null,
    });
    expect(proposalOf({ id: "a", status: "DONE", params, result: "Kept" })?.status).toBe("kept");
    expect(proposalOf({ id: "a", status: "DENIED", params, result: null })).toBeNull();
  });
});
