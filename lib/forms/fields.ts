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
  // Asking
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
  // Measuring — each has a figure a quote line can take its quantity from
  "length",
  "area",
  "areas",
  "count",
  "reading",
  "run",
  // Capturing
  "photos",
  "signature",
  // Laying out — on the page, never answered
  "section",
  "note",
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
  length: "Length",
  area: "Area",
  areas: "Areas",
  count: "Count",
  reading: "Reading",
  run: "Run of metres",
  photos: "Photos",
  signature: "Signature",
  section: "Section",
  note: "Note",
};

/** Types that sit on the page to organise it, and take no answer. */
export const DISPLAY_FIELD_TYPES: readonly FieldType[] = ["section", "note"];

/** Types that measure something: each has a figure (`measureOf`) a quote can use. */
export const MEASURE_FIELD_TYPES: readonly FieldType[] = ["number", "length", "area", "areas", "count", "reading", "run"];

/** Types measured in lengths, whose unit is one of `LENGTH_UNITS`. */
export const LENGTH_UNIT_FIELD_TYPES: readonly FieldType[] = ["length", "area", "areas", "run"];

export const LENGTH_UNITS = ["m", "cm", "mm"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

const PER_METRE: Record<LengthUnit, number> = { m: 1, cm: 100, mm: 1000 };

/** A length from one unit to another, to four places. */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  return Math.round((value / PER_METRE[from]) * PER_METRE[to] * 10_000) / 10_000;
}

/** Types that are meaningless without a list of choices. */
export const CHOICE_FIELD_TYPES: readonly FieldType[] = ["select", "multiSelect"];

/** Types whose `min` and `max` bound the value rather than its length. */
export const NUMERIC_FIELD_TYPES: readonly FieldType[] = ["number", "rating", "length", "count", "reading"];

/** Types whose `min` and `max` bound how many characters may be typed. */
export const LENGTH_FIELD_TYPES: readonly FieldType[] = ["text", "longText"];

export const DEFAULT_RATING_MAX = 5;

/**
 * When a question is asked: only once another has a given answer. Hidden
 * questions are not asked, not required and not stored.
 */
export const fieldRuleSchema = z.object({
  key: z.string().min(1).max(64),
  op: z.enum(["is", "isNot", "isAnswered", "above", "below"]),
  value: z.union([z.string().max(120), z.number().finite()]).optional(),
});
export type FieldRule = z.infer<typeof fieldRuleSchema>;

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
    /**
     * What a figure is in. A length, area, areas or run: m, cm or mm. A number
     * or a reading: whatever it is read in — %, kg, °C.
     */
    unit: z.string().trim().min(1).max(12).optional(),
    /** An area: its length and width (the default), or its total alone. */
    shape: z.enum(["rect", "total"]).optional(),
    /** A figure outside these is accepted, and said in place: "over 4%, add a damp-proof primer". */
    warnAbove: z.number().finite().optional(),
    warnBelow: z.number().finite().optional(),
    warning: z.string().trim().max(200).optional(),
    /** Asked only when another answer says so. */
    showWhen: fieldRuleSchema.optional(),
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
    if (LENGTH_UNIT_FIELD_TYPES.includes(field.type) && field.unit && !(LENGTH_UNITS as readonly string[]).includes(field.unit)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unit"],
        message: `"${field.label}" is measured in m, cm or mm`,
      });
    }
    if (field.showWhen?.key === field.key) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["showWhen"], message: `"${field.label}" cannot depend on itself` });
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
  .max(120)
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
    for (const field of fields) {
      if (field.showWhen && !seen.has(field.showWhen.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `"${field.label}" is shown by an answer to "${field.showWhen.key}", which is not on the form`,
        });
      }
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
    if (field.showWhen && !fields.some((other) => other.key === field.showWhen!.key && other.key !== field.key)) {
      problems.push(`"${name}" is shown by an answer that is not on the form.`);
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
  if (LENGTH_UNIT_FIELD_TYPES.includes(type)) field.unit = "m";
  if (type === "area") field.shape = "rect";
  if (type === "reading") field.unit = "%";
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

  // A unit survives between kinds that measure the same thing.
  const lengthsBoth = LENGTH_UNIT_FIELD_TYPES.includes(type) && LENGTH_UNIT_FIELD_TYPES.includes(field.type);
  const figuresBoth = ["number", "reading"].includes(type) && ["number", "reading"].includes(field.type);
  if (!lengthsBoth && !figuresBoth) {
    delete next.unit;
    if (LENGTH_UNIT_FIELD_TYPES.includes(type)) next.unit = "m";
    if (type === "reading") next.unit = "%";
  }
  if (type === "area") next.shape = next.shape ?? "rect";
  else delete next.shape;
  if (!MEASURE_FIELD_TYPES.includes(type)) {
    delete next.warnAbove;
    delete next.warnBelow;
    delete next.warning;
  }
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
/** A measured length: a number not below zero, typed as text as often as not. */
const dimension = z.coerce.number().finite().nonnegative("Not below 0");

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
      case "length":
      case "reading": {
        let schema = z.coerce.number().finite();
        if (field.type === "length") schema = schema.nonnegative("A length is not below 0");
        if (field.min !== undefined) schema = schema.min(field.min, `At least ${field.min}`);
        if (field.max !== undefined) schema = schema.max(field.max, `At most ${field.max}`);
        return schema;
      }
      case "count": {
        let schema = z.coerce.number().int("A whole number").nonnegative("Not below 0");
        if (field.min !== undefined) schema = schema.min(field.min, `At least ${field.min}`);
        if (field.max !== undefined) schema = schema.max(field.max, `At most ${field.max}`);
        return schema;
      }
      case "area":
        return field.shape === "total" ? z.object({ area: dimension }) : z.object({ length: dimension, width: dimension });
      case "areas":
        return z
          .array(z.object({ name: z.string().trim().min(1, "Name each area").max(80), length: dimension, width: dimension, note: z.string().trim().max(300).optional() }))
          .max(100, "At most 100 areas");
      case "run":
        return z.array(dimension).max(100, "At most 100 lengths");
      case "photos":
        return z
          .array(z.string().trim().max(2000).refine((value) => /^https?:\/\//i.test(value), "Not an uploaded photo"))
          .max(30, "At most 30 photos");
      case "signature":
        return z.object({
          name: z.string().trim().min(1, "Who is signing").max(120),
          signedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Not a time"),
          // The drawing itself: a PNG, small enough to keep with the answer.
          image: z.string().max(400_000).refine((value) => value.startsWith("data:image/png;base64,") || /^https?:\/\//i.test(value), "Not a signature"),
        });
      case "section":
      case "note":
        return z.unknown();
    }
  };

  const schema = base();
  if (field.required) {
    if (field.type === "multiSelect") {
      return (schema as z.ZodArray<z.ZodTypeAny>).min(1, "Pick at least one");
    }
    if (field.type === "areas") return (schema as z.ZodArray<z.ZodTypeAny>).min(1, "Add at least one area");
    if (field.type === "run") return (schema as z.ZodArray<z.ZodTypeAny>).min(1, "Add at least one length");
    if (field.type === "photos") return (schema as z.ZodArray<z.ZodTypeAny>).min(1, "Add at least one photo");
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
    if (DISPLAY_FIELD_TYPES.includes(field.type) || !isShown(field, fields, answers)) continue;
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

/* ──────────────────────────────────────────────────────────────────────────
   Figures
   ────────────────────────────────────────────────────────────────────────── */

const toNumber = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
};

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * The figure an answer comes to: a length, an area (length × width, or the
 * total), the areas or lengths added up, a count, a reading. What a quote
 * line multiplies; null when there is nothing to measure yet.
 */
export function measureOf(field: FieldDefinition, value: unknown): number | null {
  if (blank(value)) return null;
  switch (field.type) {
    case "number":
    case "length":
    case "reading":
    case "count":
      return toNumber(value);
    case "area": {
      const area = value as { area?: unknown; length?: unknown; width?: unknown };
      if (area.area !== undefined) return toNumber(area.area);
      const length = toNumber(area.length);
      const width = toNumber(area.width);
      return length === null || width === null ? null : round(length * width);
    }
    case "areas": {
      if (!Array.isArray(value)) return null;
      let total = 0;
      for (const entry of value as Array<{ length?: unknown; width?: unknown }>) {
        total += (toNumber(entry.length) ?? 0) * (toNumber(entry.width) ?? 0);
      }
      return round(total);
    }
    case "run":
      return Array.isArray(value) ? round(value.reduce((sum: number, entry) => sum + (toNumber(entry) ?? 0), 0)) : null;
    default:
      return null;
  }
}

/** What a figure is in: m² for an area measured in metres, % for a reading. */
export function measureUnit(field: FieldDefinition): string {
  if (field.type === "area" || field.type === "areas") return `${field.unit ?? "m"}²`;
  if (field.type === "count") return "";
  return field.unit ?? (LENGTH_UNIT_FIELD_TYPES.includes(field.type) ? "m" : "");
}

/** Outside the range the question warns about, with what to say. */
export function measureWarning(field: FieldDefinition, value: unknown): string | null {
  const figure = measureOf(field, value);
  if (figure === null) return null;
  const outside = (field.warnAbove !== undefined && figure > field.warnAbove) || (field.warnBelow !== undefined && figure < field.warnBelow);
  if (!outside) return null;
  if (field.warning) return field.warning;
  return field.warnAbove !== undefined && figure > field.warnAbove
    ? `Over ${field.warnAbove}${measureUnit(field)}`
    : `Under ${field.warnBelow}${measureUnit(field)}`;
}

const figure = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** A figure as it is read: "189.00 m²", "3.8 %", "3". */
export function formatMeasure(field: FieldDefinition, value: number): string {
  const unit = measureUnit(field);
  const shown = LENGTH_UNIT_FIELD_TYPES.includes(field.type) ? figure.format(value) : count.format(value);
  return unit ? `${shown} ${unit}` : shown;
}

/* ──────────────────────────────────────────────────────────────────────────
   When a question is asked
   ────────────────────────────────────────────────────────────────────────── */

/** Whether a question is asked, given the answers so far. One without a rule always is. */
export function isShown(field: FieldDefinition, fields: readonly FieldDefinition[], answers: Record<string, unknown>): boolean {
  const rule = field.showWhen;
  if (!rule) return true;
  const target = fields.find((candidate) => candidate.key === rule.key);
  if (!target) return true;
  // A question hidden by another hidden question is hidden too.
  if (target !== field && !isShown(target, fields.filter((candidate) => candidate !== field), answers)) return false;
  const answer = answers[rule.key];
  switch (rule.op) {
    case "isAnswered":
      return !blank(answer);
    case "above":
    case "below": {
      const figure = MEASURE_FIELD_TYPES.includes(target.type) ? measureOf(target, answer) : toNumber(answer);
      const bound = toNumber(rule.value);
      if (figure === null || bound === null) return false;
      return rule.op === "above" ? figure > bound : figure < bound;
    }
    case "is":
    case "isNot": {
      const wanted = String(rule.value ?? "");
      const holds = Array.isArray(answer)
        ? answer.map(String).includes(wanted)
        : typeof answer === "boolean"
          ? String(answer) === wanted
          : !blank(answer) && String(answer) === wanted;
      return rule.op === "is" ? holds : !holds;
    }
  }
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
    case "length":
    case "reading":
    case "count": {
      const number = toNumber(value);
      return number === null ? String(value) : formatMeasure(field, number);
    }
    case "area": {
      const total = measureOf(field, value);
      const area = value as { length?: unknown; width?: unknown };
      if (total === null) return "";
      return area.length !== undefined
        ? `${figure.format(toNumber(area.length) ?? 0)} × ${figure.format(toNumber(area.width) ?? 0)} ${field.unit ?? "m"} = ${formatMeasure(field, total)}`
        : formatMeasure(field, total);
    }
    case "areas": {
      const list = Array.isArray(value) ? value : [];
      const total = measureOf(field, value) ?? 0;
      return `${list.length} ${list.length === 1 ? "area" : "areas"}, ${formatMeasure(field, total)}`;
    }
    case "run": {
      const list = Array.isArray(value) ? value.map((entry) => figure.format(toNumber(entry) ?? 0)) : [];
      const total = measureOf(field, value) ?? 0;
      return list.length > 1 ? `${list.join(" + ")} = ${formatMeasure(field, total)}` : formatMeasure(field, total);
    }
    case "photos": {
      const list = Array.isArray(value) ? value : [];
      return `${list.length} ${list.length === 1 ? "photo" : "photos"}`;
    }
    case "signature": {
      const signed = value as { name?: string; signedAt?: string };
      return signed.name ? `Signed by ${signed.name}` : "Signed";
    }
    case "section":
    case "note":
      return "";
    default:
      return String(value);
  }
}
