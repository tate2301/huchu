/**
 * Site-visit questions as builder fields, and measured answers as columns.
 */
import { describe, expect, it } from "vitest";

import { valueColumnsFor } from "@/lib/crm/site-visits/answers";
import {
  answerValue,
  fieldFromQuestion,
  QUESTION_TYPES,
  questionFromField,
  quoteLinesOf,
  SITE_VISIT_FIELD_TYPES,
  type StoredAnswer,
} from "@/lib/crm/site-visits/fields";
import { draftSectionQuote, toQuotationLine } from "@/lib/crm/site-visits/visit-quote";
import { fieldDefinitionSchema, type FieldDefinition } from "@/lib/forms/fields";
import { draftQuote } from "@/lib/forms/quote";

const stored = (questionType: string, columns: Partial<StoredAnswer>): StoredAnswer => ({
  questionType,
  valueText: null,
  valueNumber: null,
  valueBool: null,
  valueOptions: [],
  valueDate: null,
  valueJson: null,
  ...columns,
});

describe("a question as a field", () => {
  it("round-trips every kind a site visit can ask", () => {
    for (const type of SITE_VISIT_FIELD_TYPES) {
      const field: FieldDefinition = {
        key: "q",
        label: "Question",
        type,
        required: type !== "section" && type !== "note",
        ...(type === "select" || type === "multiSelect" ? { options: [{ value: "a", label: "A" }] } : {}),
        ...(type === "area" ? { shape: "rect" as const, unit: "m" } : {}),
      };
      expect(fieldFromQuestion({ ...questionFromField(field) })).toEqual(field);
    }
  });

  it("keeps the builder's settings: a warning range and the answer that shows it", () => {
    const field: FieldDefinition = {
      key: "moisture",
      label: "Moisture reading",
      type: "reading",
      required: true,
      unit: "%",
      warnAbove: 4,
      warning: "Over 4% — add a damp-proof primer",
      showWhen: { key: "substrate", op: "is", value: "concrete" },
    };
    const row = questionFromField(field);
    expect(row).toMatchObject({ type: "READING", unit: "%", settings: { warnAbove: 4, showWhen: { key: "substrate" } } });
    expect(fieldFromQuestion(row)).toEqual(field);
  });

  it("reads an old width × height question as an area in metres", () => {
    const field = fieldFromQuestion({ key: "mat_size", label: "Mat size", helpText: null, type: "DIMENSION", unit: null, isRequired: false });
    expect(field).toMatchObject({ type: "area", unit: "m", shape: "rect" });
    expect(fieldDefinitionSchema.safeParse(field).success).toBe(true);
    expect(questionFromField(field).type).toBe("AREA");
  });

  it("drops settings that no longer read rather than trusting them", () => {
    const field = fieldFromQuestion({ key: "n", label: "N", helpText: null, type: "NUMBER", unit: null, isRequired: false, settings: { warnAbove: "lots" } });
    expect(field.warnAbove).toBeUndefined();
  });

  it("has a field kind for every stored type", () => {
    for (const type of QUESTION_TYPES) {
      expect(fieldFromQuestion({ key: "q", label: "Q", helpText: null, type, unit: null, isRequired: false }).type).toBeTruthy();
    }
  });
});

describe("a measured answer", () => {
  const areas: FieldDefinition = { key: "areas", label: "Areas to be coated", type: "areas", required: true, unit: "m" };

  it("keeps the areas and puts what they come to in valueNumber", () => {
    const columns = valueColumnsFor("AREAS", [
      { name: "Bay 1", length: "12", width: 10 },
      { name: "", length: 12, width: 10 },
    ], areas);
    expect(columns.valueNumber).toBe(240);
    expect(columns.valueJson).toEqual([
      { name: "Bay 1", length: 12, width: 10 },
      { name: "Area 2", length: 12, width: 10 },
    ]);
  });

  it("adds up a run and rounds a count", () => {
    expect(valueColumnsFor("RUN", [12.5, "7.5", "x"]).valueNumber).toBe(20);
    expect(valueColumnsFor("COUNT", "3.4").valueNumber).toBe(3);
  });

  it("reads back in the shape its input takes, old dimensions included", () => {
    expect(answerValue(stored("DIMENSION", { valueJson: { widthM: 1.2, heightM: 1.8 } }))).toEqual({ length: 1.8, width: 1.2 });
    expect(answerValue(stored("AREAS", { valueJson: [{ name: "Bay 1", length: 12, width: 10 }] }))).toEqual([{ name: "Bay 1", length: 12, width: 10 }]);
    expect(answerValue(stored("DATE", { valueDate: new Date("2026-10-06T00:00:00Z") }))).toBe("2026-10-06");
    expect(answerValue(stored("SINGLE_SELECT", { valueText: "concrete", valueOptions: ["concrete"] }))).toBe("concrete");
  });

  it("keeps photo addresses with the answer, and only addresses", () => {
    const columns = valueColumnsFor("PHOTO_EVIDENCE", ["https://blob.example/a.jpg", "javascript:alert(1)"]);
    expect(columns.valueJson).toEqual(["https://blob.example/a.jpg"]);
    expect(columns.valueBool).toBe(true);
  });

  it("drafts the quote from what was saved", () => {
    const saved = valueColumnsFor("AREAS", [{ name: "Bay 1", length: 12, width: 20 }], areas);
    const value = answerValue(stored("AREAS", { valueJson: saved.valueJson, valueNumber: saved.valueNumber }));
    const lines = quoteLinesOf([
      { id: "coat", description: "Epoxy coating", unit: "m²", unitPrice: 35, quantity: { from: "field", key: "areas", factor: 1 } },
      { id: "broken", description: "", unitPrice: -1, quantity: { from: "fixed", value: 1 } },
    ]);
    expect(lines.map((line) => line.id)).toEqual(["coat"]);
    expect(draftQuote(lines, [areas], { areas: value })[0]).toMatchObject({ quantity: 240, amount: 8400 });
  });
});

describe("a visit's drafted quote", () => {
  const questions = [
    questionFromField({ key: "areas", label: "Areas to be coated", type: "areas", required: true, unit: "m" }),
    questionFromField({ key: "moisture", label: "Moisture reading", type: "reading", required: true, unit: "%" }),
  ];
  const quoteLines = [
    { id: "coat", description: "Epoxy coating", unit: "m²", unitPrice: 35, quantity: { from: "field", key: "areas", factor: 1 } },
    { id: "primer", description: "Damp-proof primer", unit: "m²", unitPrice: 7.5, quantity: { from: "field", key: "areas", factor: 1 }, showWhen: { key: "moisture", op: "above", value: 4 } },
  ];
  const saved = (moisture: number, notApplicable = false) => ({
    name: "Epoxy flooring",
    questionSet: { questions, quoteLines },
    answers: [
      { ...stored("AREAS", { valueJson: [{ name: "Bay 1", length: 12, width: 20 }], valueNumber: 240 }), questionKey: "areas", notApplicable: false },
      { ...stored("READING", { valueNumber: moisture }), questionKey: "moisture", notApplicable },
    ],
  });

  it("drafts from the saved answers, the primer only when it is damp", () => {
    expect(draftSectionQuote(saved(3.8)).map((line) => line.lineId)).toEqual(["coat"]);
    expect(draftSectionQuote(saved(4.6)).map((line) => line.lineId)).toEqual(["coat", "primer"]);
    // Not applicable is not an answer.
    expect(draftSectionQuote(saved(4.6, true)).map((line) => line.lineId)).toEqual(["coat"]);
  });

  it("becomes quotation lines that keep their unit", () => {
    expect(draftSectionQuote(saved(3.8)).map(toQuotationLine)).toEqual([{ description: "Epoxy coating (m²)", quantity: 240, unitPrice: 35 }]);
  });

  it("drafts nothing for a section whose form has gone", () => {
    expect(draftSectionQuote({ name: "Gone", questionSet: null, answers: [] })).toEqual([]);
  });
});
