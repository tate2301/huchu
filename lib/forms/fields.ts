import { z } from "zod";

/**
 * What a question is, everywhere a person fills something in.
 *
 * There were three ideas of a field here: an intake form's (seven types, a
 * `type` and `{value, label}` choices), a template's (eleven types, a
 * `fieldType` and bare-string choices) and a site visit's (a database enum).
 * The same question built in two of them came out as two different things,
 * and an answer validated by one was not an answer the other would accept.
 *
 * This is the one definition. Intake forms store a list of these; a template's
 * field block wraps one; the form builder edits them; `answerSchemaFor` is the
 * only place that decides what an answer to one may be.
 */

export const FIELD_TYPES = [
  "text",
  "longText",
  "number",
  "email",
  "phone",
  "date",
  "select",
  "multiSelect",
  "checkbox",
  "file",
  "rating",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short answer",
  longText: "Long answer",
  number: "Number",
  email: "Email",
  phone: "Phone",
  date: "Date",
  select: "Pick one",
  multiSelect: "Pick several",
  checkbox: "Yes or no",
  file: "Upload",
  rating: "Rating",
};

/** Types that are meaningless without a list of choices. */
export const CHOICE_FIELD_TYPES: readonly FieldType[] = ["select", "multiSelect"];

/** Types whose `min` and `max` bound the value rather than its length. */
export const NUMERIC_FIELD_TYPES: readonly FieldType[] = ["number", "rating"];

/** Types whose `min` and `max` bound how many characters may be typed. */
export const LENGTH_FIELD_TYPES: readonly FieldType[] = ["text", "longText"];

export const DEFAULT_RATING_MAX = 5;

export const fieldKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "A key is lower case, starts with a letter, and uses _ between words");

export const fieldChoiceSchema = z.object({
  /** What is stored. Stable while the label is reworded. */
  value: z.string().trim().min(1).max(120),
  /** What the person picking sees. */
  label: z.string().trim().min(1).max(160),
});
export type FieldChoice = z.infer<typeof fieldChoiceSchema>;

export const fieldDefinitionSchema = z
  .object({
    /** The name an answer is stored under — the join between answer and question. */
    key: fieldKeySchema,
    label: z.string().trim().min(1).max(200),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    placeholder: z.string().max(200).optional(),
    help: z.string().max(300).optional(),
    options: z.array(fieldChoiceSchema).max(50).optional(),
    /** Number and rating: the value's bounds. Short and long answers: its length. */
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    /**
     * A variable to fill the answer from when the form is opened against a
     * record — `{{customer.name}}` saves somebody typing what is already known.
     */
    prefill: z.string().max(80).optional(),
  })
  .superRefine((field, ctx) => {
    if (CHOICE_FIELD_TYPES.includes(field.type) && (field.options ?? []).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: `"${field.label}" asks somebody to pick, but offers nothing to pick from`,
      });
    }
    const values = (field.options ?? []).map((choice) => choice.value);
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: `"${field.label}" offers the same choice twice`,
      });
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["min"],
        message: `"${field.label}" has a lowest value above its highest`,
      });
    }
    if (field.type === "rating" && field.max !== undefined && (field.max < 2 || field.max > 10)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["max"],
        message: `"${field.label}" rates out of 2 to 10`,
      });
    }
  });
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

export const fieldListSchema = z
  .array(fieldDefinitionSchema)
  .max(60)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    for (const field of fields) {
      if (seen.has(field.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Two questions save to "${field.key}" — the second would overwrite the first`,
        });
      }
      seen.add(field.key);
    }
  });

/**
 * What is wrong with a list of questions, in words somebody can act on.
 *
 * All of it at once, for the builder to show while it is being built: a
 * builder that reports the first problem, is fixed, then reports the second is
 * one people stop trusting to tell them when they are done.
 */
export function fieldProblems(fields: readonly FieldDefinition[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const field of fields) {
    const name = field.label.trim() || field.key;
    if (!field.label.trim()) problems.push("Every question needs something to ask.");
    if (!fieldKeySchema.safeParse(field.key).success) {
      problems.push(`"${name}" needs a key in lower case, starting with a letter.`);
    }
    if (seen.has(field.key)) {
      problems.push(`Two questions save to "${field.key}" — the second would overwrite the first.`);
    }
    seen.add(field.key);
    if (CHOICE_FIELD_TYPES.includes(field.type) && (field.options ?? []).length === 0) {
      problems.push(`"${name}" asks somebody to pick, but offers nothing to pick from.`);
    }
    const values = (field.options ?? []).map((choice) => choice.value);
    if (new Set(values).size !== values.length) {
      problems.push(`"${name}" offers the same choice twice.`);
    }
    if ((field.options ?? []).some((choice) => !choice.label.trim())) {
      problems.push(`"${name}" has a choice with nothing written on it.`);
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      problems.push(`"${name}" has a lowest value above its highest.`);
    }
  }

  return [...new Set(problems)];
}

/** `"Leave type"` → `leave_type`, made unique against the keys already taken. */
export function keyFromLabel(label: string, taken: ReadonlySet<string>): string {
  const slug =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^([0-9])/, "q_$1")
      .slice(0, 56) || "question";
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}_${n}`)) n += 1;
  return `${slug}_${n}`;
}

/** A value for a choice, derived from what it says. */
export function choiceValueFromLabel(label: string, taken: ReadonlySet<string>): string {
  return keyFromLabel(label || "choice", taken);
}

/** A fresh question of the given type, keyed so it cannot collide. */
export function emptyField(type: FieldType, taken: ReadonlySet<string>): FieldDefinition {
  const label = FIELD_TYPE_LABELS[type];
  const field: FieldDefinition = {
    key: keyFromLabel(label, taken),
    label,
    type,
    required: false,
  };
  if (CHOICE_FIELD_TYPES.includes(type)) {
    field.options = [
      { value: "option_1", label: "Option 1" },
      { value: "option_2", label: "Option 2" },
    ];
  }
  if (type === "rating") field.max = DEFAULT_RATING_MAX;
  return field;
}

/**
 * The settings a question keeps when its type changes.
 *
 * Choices survive a move between Pick one and Pick several; bounds survive a
 * move between Number and Rating. Anything that no longer means something is
 * dropped rather than left to be validated against the wrong type.
 */
export function retypeField(field: FieldDefinition, type: FieldType): FieldDefinition {
  const next: FieldDefinition = { ...field, type };
  if (!CHOICE_FIELD_TYPES.includes(type)) delete next.options;
  else if (!next.options?.length) next.options = emptyField(type, new Set()).options;

  const keepsBounds =
    (NUMERIC_FIELD_TYPES.includes(type) && NUMERIC_FIELD_TYPES.includes(field.type)) ||
    (LENGTH_FIELD_TYPES.includes(type) && LENGTH_FIELD_TYPES.includes(field.type));
  if (!keepsBounds) {
    delete next.min;
    delete next.max;
  }
  if (type === "rating" && next.max === undefined) next.max = DEFAULT_RATING_MAX;
  return next;
}

function blank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * What a single answer is allowed to be.
 *
 * Anything non-empty used to satisfy a required question, so "banana" was a
 * valid answer to "How many units?" and a pick could come back with an option
 * that was never offered. These answers are read back as record values, so
 * the question's own declaration is what decides.
 *
 * Optional questions accept `undefined`, `null` and `""` alike and normalise
 * all three to absent: three ways of saying "they didn't answer" is three
 * branches at every reader.
 */
export function answerSchemaFor(field: FieldDefinition): z.ZodTypeAny {
  const values = (field.options ?? []).map((choice) => choice.value);
  const oneOf = (): z.ZodTypeAny =>
    values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string().max(200);

  const base = (): z.ZodTypeAny => {
    switch (field.type) {
      case "number": {
        // Numbers arrive as strings from a plain form post as often as not.
        let schema = z.coerce.number().finite();
        if (field.min !== undefined) schema = schema.min(field.min, `At least ${field.min}`);
        if (field.max !== undefined) schema = schema.max(field.max, `At most ${field.max}`);
        return schema;
      }
      case "rating":
        return z.coerce
          .number()
          .int("A whole number")
          .min(field.min ?? 1, `At least ${field.min ?? 1}`)
          .max(field.max ?? DEFAULT_RATING_MAX, `At most ${field.max ?? DEFAULT_RATING_MAX}`);
      case "email":
        return z.string().trim().email("Not an email address").max(200);
      case "phone":
        return z.string().trim().min(3, "Too short for a phone number").max(40);
      case "date":
        return z
          .string()
          .trim()
          .refine((value) => !Number.isNaN(new Date(value).getTime()), "Not a date");
      case "checkbox":
        return z.coerce.boolean();
      case "select":
        // An option that was never offered is not an answer to this question.
        return oneOf();
      case "multiSelect":
        return z.array(oneOf()).max(50);
      case "file":
        // What is stored is where the upload landed, not the file. A browser
        // puts `C:\fakepath\plan.pdf` in a file input's value, which parses as
        // a URL with scheme "c:", so the scheme has to be named.
        return z
          .string()
          .trim()
          .max(2000)
          .refine((value) => /^https?:\/\//i.test(value), "Not an uploaded file");
      case "longText":
      case "text": {
        let schema = z.string().trim().max(field.type === "longText" ? 5000 : 1000);
        if (field.min !== undefined) schema = schema.min(field.min, `At least ${field.min} characters`);
        if (field.max !== undefined) schema = schema.max(field.max, `At most ${field.max} characters`);
        return schema;
      }
    }
  };

  const schema = base();
  if (field.required) {
    if (field.type === "multiSelect") {
      return (schema as z.ZodArray<z.ZodTypeAny>).min(1, "Pick at least one");
    }
    if (field.type === "checkbox") {
      return schema.refine((value) => value === true, "Required");
    }
    // A required text question is not satisfied by whitespace, and the trim is
    // already on the schema, so an empty string fails on its length.
    return schema instanceof z.ZodString ? schema.min(1, "Required") : schema;
  }
  return z.preprocess((value) => (blank(value) ? undefined : value), schema.optional());
}

export type AnswerProblem = { key: string; label: string; message: string };

/**
 * Check a set of answers against the questions that asked for them.
 *
 * Every problem rather than the first: a person who fixes one field,
 * resubmits and is told about the next gives up around the third. Keys no
 * question asked for are dropped — a stale cached form or somebody poking the
 * endpoint is not a reason to store values nobody asked for.
 */
export function validateAnswers(
  fields: readonly FieldDefinition[],
  answers: Record<string, unknown>,
): { values: Record<string, unknown>; problems: AnswerProblem[] } {
  const values: Record<string, unknown> = {};
  const problems: AnswerProblem[] = [];

  for (const field of fields) {
    const raw = answers[field.key];
    if (field.required && blank(raw)) {
      problems.push({ key: field.key, label: field.label, message: "Required" });
      continue;
    }
    const parsed = answerSchemaFor(field).safeParse(raw);
    if (!parsed.success) {
      problems.push({
        key: field.key,
        label: field.label,
        message: parsed.error.issues[0]?.message ?? "Not valid",
      });
      continue;
    }
    if (parsed.data !== undefined) values[field.key] = parsed.data;
  }

  return { values, problems };
}

/** How an answer reads once given — for records, exports and read-only views. */
export function formatAnswer(field: FieldDefinition, value: unknown): string {
  if (blank(value)) return "";
  const labelFor = (stored: unknown) =>
    field.options?.find((choice) => choice.value === stored)?.label ?? String(stored);

  switch (field.type) {
    case "select":
      return labelFor(value);
    case "multiSelect":
      return (Array.isArray(value) ? value : [value]).map(labelFor).join(", ");
    case "checkbox":
      return value === true || value === "true" ? "Yes" : "No";
    case "rating":
      return `${value} of ${field.max ?? DEFAULT_RATING_MAX}`;
    default:
      return String(value);
  }
}
