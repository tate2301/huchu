import { describe, expect, it } from "vitest";

import type { FieldDefinition } from "@/lib/forms/fields";
import { draftQuote, draftSubtotal, quoteLineProblems, type QuoteLine } from "@/lib/forms/quote";

/** Floorcode's epoxy survey, and the job at Avondale Fresh Mart. */
const fields: FieldDefinition[] = [
  { key: "areas", label: "Areas to be coated", type: "areas", required: true, unit: "m" },
  { key: "coves", label: "Coves", type: "run", required: false, unit: "m" },
  { key: "cracks", label: "Cracks to repair", type: "length", required: false, unit: "m" },
  { key: "moisture", label: "Moisture in the slab", type: "reading", required: false, unit: "%", warnAbove: 4 },
  { key: "notes", label: "Notes", type: "longText", required: false },
];

const lines: QuoteLine[] = [
  { id: "grind", description: "Diamond grind and vacuum", unit: "m²", unitPrice: 4.5, quantity: { from: "field", key: "areas", factor: 1 } },
  { id: "primer", description: "Epoxy primer", unit: "m²", unitPrice: 3.2, quantity: { from: "field", key: "areas", factor: 1 } },
  { id: "dpm", description: "Damp-proof primer", unit: "m²", unitPrice: 6, quantity: { from: "field", key: "areas", factor: 1 }, showWhen: { key: "moisture", op: "above", value: 4 } },
  { id: "epoxy", description: "Self-levelling epoxy, 2 mm, grey", unit: "m²", unitPrice: 28, quantity: { from: "field", key: "areas", factor: 1 } },
  { id: "cracks", description: "Crack repair", unit: "m", unitPrice: 6, quantity: { from: "field", key: "cracks", factor: 1 } },
  { id: "coving", description: "Coving, 100 mm radius", unit: "m", unitPrice: 12, quantity: { from: "field", key: "coves", factor: 1 } },
  { id: "callout", description: "Call-out", unitPrice: 45, quantity: { from: "fixed", value: 0 } },
];

const answers = {
  areas: [
    { name: "Shop floor", length: 18, width: 10.5 },
    { name: "Storeroom", length: 6.2, width: 5 },
    { name: "Loading bay", length: 5, width: 4 },
  ],
  coves: [18, 21, 13],
  cracks: 18,
  moisture: 3.8,
};

describe("a quote drafted from a survey", () => {
  it("takes every quantity from what was measured", () => {
    const drafted = draftQuote(lines, fields, answers);
    expect(drafted.map((line) => [line.description, line.quantity, line.amount])).toEqual([
      ["Diamond grind and vacuum", 240, 1080],
      ["Epoxy primer", 240, 768],
      ["Self-levelling epoxy, 2 mm, grey", 240, 6720],
      ["Crack repair", 18, 108],
      ["Coving, 100 mm radius", 52, 624],
    ]);
    expect(draftSubtotal(drafted)).toBe(9300);
    expect(drafted[0]!.source).toBe("Areas to be coated: 240 m²");
  });

  it("adds a line only when its rule holds", () => {
    const damp = draftQuote(lines, fields, { ...answers, moisture: 4.6 });
    expect(damp.map((line) => line.lineId)).toContain("dpm");
    expect(draftSubtotal(damp)).toBe(10740);
  });

  it("scales for waste and rounds up to whole packs", () => {
    const boxes: QuoteLine = { id: "plank", description: "Vinyl plank, boxes of 2.23 m²", unit: "boxes", unitPrice: 38.5, quantity: { from: "field", key: "areas", factor: 1.08, per: 2.23 } };
    const [line] = draftQuote([boxes], fields, answers);
    // 240 × 1.08 = 259.2 m², in boxes of 2.23 m² is 116.2, so 117 boxes.
    expect(line).toMatchObject({ quantity: 117, amount: 4504.5, source: "Areas to be coated: 240 m² × 1.08, in packs of 2.23" });
  });

  it("leaves out a line whose measurement is not answered yet, rather than quoting zero", () => {
    const drafted = draftQuote(lines, fields, { areas: answers.areas });
    expect(drafted.map((line) => line.lineId)).toEqual(["grind", "primer", "epoxy"]);
  });

  it("names a line that reads a question it cannot measure", () => {
    const problems = quoteLineProblems(
      [
        { id: "a", description: "Notes line", unitPrice: 1, quantity: { from: "field", key: "notes", factor: 1 } },
        { id: "b", description: "Gone line", unitPrice: 1, quantity: { from: "field", key: "gone", factor: 1 } },
      ],
      fields,
    );
    expect(problems).toEqual([
      '"Notes line" takes its quantity from "Notes", which is not a measurement.',
      '"Gone line" takes its quantity from "gone", which is not on the form.',
    ]);
  });
});
