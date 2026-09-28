import { describe, expect, it } from "vitest";

import {
  answerSchemaFor,
  emptyField,
  fieldListSchema,
  fieldProblems,
  formatAnswer,
  keyFromLabel,
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
