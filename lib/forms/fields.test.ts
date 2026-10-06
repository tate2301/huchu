import { describe, expect, it } from "vitest";

import {
  answerSchemaFor,
  convertLength,
  emptyField,
  fieldListSchema,
  fieldProblems,
  formatAnswer,
  isShown,
  keyFromLabel,
  measureOf,
  measureWarning,
  retypeField,
  validateAnswers,
  type FieldDefinition,
} from "./fields";

const pick: FieldDefinition = {
  key: "leave_type",
  label: "Leave type",
  type: "select",
  required: true,
  options: [
    { value: "annual", label: "Annual" },
    { value: "sick", label: "Sick" },
  ],
};

describe("keyFromLabel", () => {
  it("turns a label into a snake_case key", () => {
    expect(keyFromLabel("Leave type", new Set())).toBe("leave_type");
  });

  it("does not collide with a key already taken", () => {
    expect(keyFromLabel("Leave type", new Set(["leave_type", "leave_type_2"]))).toBe("leave_type_3");
  });

  it("never starts a key with a digit", () => {
    expect(keyFromLabel("2nd phone", new Set())).toBe("q_2nd_phone");
  });

  it("falls back to a word when the label has none", () => {
    expect(keyFromLabel("???", new Set())).toBe("question");
  });
});

describe("answerSchemaFor", () => {
  it("refuses an option that was never offered", () => {
    expect(answerSchemaFor(pick).safeParse("maternity").success).toBe(false);
    expect(answerSchemaFor(pick).safeParse("sick").success).toBe(true);
  });

  it("holds a number to its bounds", () => {
    const units: FieldDefinition = { key: "units", label: "Units", type: "number", required: true, min: 1, max: 10 };
    expect(answerSchemaFor(units).safeParse("banana").success).toBe(false);
    expect(answerSchemaFor(units).safeParse("0").success).toBe(false);
    expect(answerSchemaFor(units).safeParse("4").data).toBe(4);
  });

  it("rates out of the field's own scale", () => {
    const rating = emptyField("rating", new Set());
    expect(answerSchemaFor(rating).safeParse(5).success).toBe(true);
    expect(answerSchemaFor(rating).safeParse(6).success).toBe(false);
    expect(answerSchemaFor(rating).safeParse(2.5).success).toBe(false);
  });

  it("does not let whitespace answer a required question", () => {
    const text: FieldDefinition = { key: "name", label: "Name", type: "text", required: true };
    expect(answerSchemaFor(text).safeParse("   ").success).toBe(false);
  });

  it("treats a blank optional answer as no answer", () => {
    const text: FieldDefinition = { key: "notes", label: "Notes", type: "longText", required: false };
    expect(answerSchemaFor(text).safeParse("").data).toBeUndefined();
    expect(answerSchemaFor(text).safeParse(null).data).toBeUndefined();
  });

  it("accepts an uploaded file's address but not a browser's fake path", () => {
    const file: FieldDefinition = { key: "plan", label: "Plan", type: "file", required: true };
    expect(answerSchemaFor(file).safeParse("C:\\fakepath\\plan.pdf").success).toBe(false);
    expect(answerSchemaFor(file).safeParse("https://blob.example/plan.pdf").success).toBe(true);
  });

  it("makes a required yes-or-no mean it must be ticked", () => {
    const consent: FieldDefinition = { key: "consent", label: "I agree", type: "checkbox", required: true };
    expect(answerSchemaFor(consent).safeParse(false).success).toBe(false);
    expect(answerSchemaFor(consent).safeParse(true).success).toBe(true);
  });
});

describe("validateAnswers", () => {
  it("reports every problem, not only the first", () => {
    const fields: FieldDefinition[] = [
      pick,
      { key: "email", label: "Email", type: "email", required: true },
    ];
    const { problems } = validateAnswers(fields, { leave_type: "nope", email: "not-an-email" });
    expect(problems.map((problem) => problem.key)).toEqual(["leave_type", "email"]);
  });

  it("drops keys no question asked for", () => {
    const { values } = validateAnswers([pick], { leave_type: "annual", injected: "x" });
    expect(values).toEqual({ leave_type: "annual" });
  });
});

describe("fieldListSchema and fieldProblems", () => {
  it("refuses two questions saving to the same key", () => {
    const twice = [pick, { ...pick, label: "Again" }];
    expect(fieldListSchema.safeParse(twice).success).toBe(false);
    expect(fieldProblems(twice)).toContain(
      'Two questions save to "leave_type" — the second would overwrite the first.',
    );
  });

  it("refuses a pick with nothing to pick from", () => {
    const empty = { ...pick, options: [] };
    expect(fieldListSchema.safeParse([empty]).success).toBe(false);
    expect(fieldProblems([empty])).toContain(
      '"Leave type" asks somebody to pick, but offers nothing to pick from.',
    );
  });

  it("refuses a key that is not snake_case", () => {
    expect(fieldListSchema.safeParse([{ ...pick, key: "leave-type" }]).success).toBe(false);
  });
});

describe("retypeField", () => {
  it("keeps the choices moving between the two pick types", () => {
    expect(retypeField(pick, "multiSelect").options).toEqual(pick.options);
  });

  it("drops choices a type cannot use", () => {
    expect(retypeField(pick, "text").options).toBeUndefined();
  });

  it("gives a new pick something to pick from", () => {
    const text: FieldDefinition = { key: "a", label: "A", type: "text", required: false };
    expect(retypeField(text, "select").options?.length).toBeGreaterThan(0);
  });

  it("drops bounds that would now mean something else", () => {
    const bounded: FieldDefinition = { key: "a", label: "A", type: "text", required: false, min: 2, max: 20 };
    const asNumber = retypeField(bounded, "number");
    expect(asNumber.min).toBeUndefined();
    expect(asNumber.max).toBeUndefined();
  });
});

describe("formatAnswer", () => {
  it("reads a stored choice back as its label", () => {
    expect(formatAnswer(pick, "sick")).toBe("Sick");
  });

  it("reads a rating against its scale", () => {
    expect(formatAnswer(emptyField("rating", new Set()), 4)).toBe("4 of 5");
  });
});

describe("choices", () => {
  it("refuses the same choice offered twice", () => {
    const twice = { ...pick, options: [{ value: "a", label: "A" }, { value: "a", label: "Again" }] };
    expect(fieldListSchema.safeParse([twice]).success).toBe(false);
    expect(fieldProblems([twice])).toContain('"Leave type" offers the same choice twice.');
  });
});

describe("measuring", () => {
  const areas: FieldDefinition = { key: "areas", label: "Areas to be coated", type: "areas", required: true, unit: "m" };
  const shop = [
    { name: "Shop floor", length: 18, width: 10.5 },
    { name: "Storeroom", length: 6.2, width: 5 },
    { name: "Loading bay", length: 5, width: 4 },
  ];

  it("adds areas up to the figure a quote uses", () => {
    expect(measureOf(areas, shop)).toBe(240);
    expect(formatAnswer(areas, shop)).toBe("3 areas, 240.00 m²");
  });

  it("works out an area from its length and width, or takes its total", () => {
    const rect: FieldDefinition = { key: "floor", label: "Floor", type: "area", required: false, unit: "m", shape: "rect" };
    expect(measureOf(rect, { length: "18", width: 10.5 })).toBe(189);
    expect(formatAnswer(rect, { length: 18, width: 10.5 })).toBe("18.00 × 10.50 m = 189.00 m²");
    expect(measureOf({ ...rect, shape: "total" }, { area: 48.84 })).toBe(48.84);
  });

  it("adds a run of lengths along several walls", () => {
    const coves: FieldDefinition = { key: "coves", label: "Coves", type: "run", required: false, unit: "m" };
    expect(measureOf(coves, [18, 21, 13])).toBe(52);
    expect(formatAnswer(coves, [18, 21, 13])).toBe("18.00 + 21.00 + 13.00 = 52.00 m");
  });

  it("refuses an area nobody named, and a length below zero", () => {
    expect(answerSchemaFor(areas).safeParse([{ name: "", length: 1, width: 1 }]).success).toBe(false);
    expect(answerSchemaFor(areas).safeParse([]).success).toBe(false);
    const length: FieldDefinition = { key: "door", label: "Door", type: "length", required: true, unit: "m" };
    expect(answerSchemaFor(length).safeParse(-1).success).toBe(false);
    expect(answerSchemaFor(length).safeParse("0.9").success).toBe(true);
  });

  it("says when a reading is past its limit, in the question's own words", () => {
    const moisture: FieldDefinition = {
      key: "moisture",
      label: "Moisture in the slab",
      type: "reading",
      required: false,
      unit: "%",
      warnAbove: 4,
      warning: "Over 4%. A damp-proof primer is added to the quote.",
    };
    expect(measureWarning(moisture, 3.8)).toBeNull();
    expect(measureWarning(moisture, 4.6)).toBe("Over 4%. A damp-proof primer is added to the quote.");
    expect(measureWarning({ ...moisture, warning: undefined }, 4.6)).toBe("Over 4%");
  });

  it("converts lengths between units", () => {
    expect(convertLength(0.9, "m", "cm")).toBe(90);
    expect(convertLength(1200, "mm", "m")).toBe(1.2);
  });

  it("keeps a unit moving between kinds that measure lengths, and sets one on a new kind", () => {
    expect(retypeField({ key: "a", label: "A", type: "length", required: false, unit: "mm" }, "run").unit).toBe("mm");
    expect(retypeField({ key: "a", label: "A", type: "text", required: false }, "areas").unit).toBe("m");
    expect(retypeField({ key: "a", label: "A", type: "length", required: false, unit: "m" }, "text").unit).toBeUndefined();
  });

  it("refuses a length measured in something other than m, cm or mm", () => {
    const parsed = fieldListSchema.safeParse([{ key: "door", label: "Door", type: "length", required: false, unit: "ft" }]);
    expect(parsed.success).toBe(false);
  });
});

describe("questions asked only when another answer says so", () => {
  const fields: FieldDefinition[] = [
    { key: "use", label: "Use", type: "select", required: true, options: [{ value: "warehouse", label: "Warehouse" }, { value: "retail", label: "Retail" }] },
    { key: "forklifts", label: "Forklifts?", type: "checkbox", required: false, showWhen: { key: "use", op: "is", value: "warehouse" } },
    { key: "load", label: "Heaviest load", type: "number", required: true, unit: "kg", showWhen: { key: "forklifts", op: "is", value: "true" } },
    { key: "moisture", label: "Moisture", type: "reading", required: false, unit: "%" },
    { key: "membrane", label: "Membrane", type: "text", required: true, showWhen: { key: "moisture", op: "above", value: 4 } },
  ];

  it("asks them only when the rule holds, through a chain of rules", () => {
    expect(isShown(fields[1]!, fields, { use: "retail" })).toBe(false);
    expect(isShown(fields[1]!, fields, { use: "warehouse" })).toBe(true);
    expect(isShown(fields[2]!, fields, { use: "retail", forklifts: true })).toBe(false);
    expect(isShown(fields[2]!, fields, { use: "warehouse", forklifts: true })).toBe(true);
    expect(isShown(fields[4]!, fields, { moisture: 4.6 })).toBe(true);
    expect(isShown(fields[4]!, fields, { moisture: 3.8 })).toBe(false);
  });

  it("does not require a hidden question, and does not store one", () => {
    const { values, problems } = validateAnswers(fields, { use: "retail", moisture: 3.8, load: 900 });
    expect(problems).toEqual([]);
    expect(values).toEqual({ use: "retail", moisture: 3.8 });
  });

  it("refuses a rule that points at a question not on the form", () => {
    const parsed = fieldListSchema.safeParse([{ key: "a", label: "A", type: "text", required: false, showWhen: { key: "nope", op: "isAnswered" } }]);
    expect(parsed.success).toBe(false);
    expect(fieldProblems([{ key: "a", label: "A", type: "text", required: false, showWhen: { key: "nope", op: "isAnswered" } }])).toContain(
      '"A" is shown by an answer that is not on the form.',
    );
  });

  it("never asks a section or a note", () => {
    const { values, problems } = validateAnswers([{ key: "intro", label: "The floor in use", type: "section", required: true }], {});
    expect(problems).toEqual([]);
    expect(values).toEqual({});
  });
});
