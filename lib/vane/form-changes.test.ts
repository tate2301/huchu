/** Vane's changes to a form are only offered when they fit the form as it stands. */
import { describe, expect, it } from "vitest";

import type { FieldDefinition } from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";

import { checkChange } from "./form-changes";

const fields = [
  { key: "subfloor", label: "Subfloor", type: "select", required: false, options: [{ value: "concrete", label: "Concrete" }] },
  { key: "skirting", label: "Skirting wanted", type: "yesNo", required: true },
] as unknown as FieldDefinition[];
const lines = [{ id: "l1", description: "Laminate planks", unitPrice: 24.5, quantity: { from: "field", key: "area", factor: 1.1 } }] as unknown as QuoteLine[];
const why = { why: "Skipped on 18 of 86 visits.", read: "Site visit answers" };

describe("Vane's changes to a form", () => {
  it("offers making an optional question required, and not one already required or missing", () => {
    expect(checkChange({ kind: "require", key: "subfloor", ...why }, fields, lines)).toMatchObject({ title: "Make Subfloor required" });
    expect(checkChange({ kind: "require", key: "skirting", ...why }, fields, lines)).toBeNull();
    expect(checkChange({ kind: "require", key: "nowhere", ...why }, fields, lines)).toBeNull();
  });

  it("adds an option to a pick question only, and not one it has", () => {
    expect(checkChange({ kind: "add_option", key: "subfloor", label: "Screed", ...why }, fields, lines)).toMatchObject({ option: { value: "screed", label: "Screed" }, title: "Add Screed to Subfloor" });
    expect(checkChange({ kind: "add_option", key: "subfloor", label: "concrete", ...why }, fields, lines)).toBeNull();
    expect(checkChange({ kind: "add_option", key: "skirting", label: "Maybe", ...why }, fields, lines)).toBeNull();
  });

  it("changes a measured quote line's waste within reason", () => {
    expect(checkChange({ kind: "quote_factor", lineId: "l1", factor: 1.13, ...why }, fields, lines)).toMatchObject({ title: "Laminate planks: 13% waste, not 10%" });
    expect(checkChange({ kind: "quote_factor", lineId: "l1", factor: 3, ...why }, fields, lines)).toBeNull();
    expect(checkChange({ kind: "quote_factor", lineId: "l1", factor: 1.1, ...why }, fields, lines)).toBeNull();
  });
});
