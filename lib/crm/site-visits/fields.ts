/**
 * Site-visit questions as the form builder's fields.
 *
 * A question set's rows came first, with a database enum of nine types; the
 * builder speaks `FieldDefinition` (`lib/forms/fields.ts`). This is the one
 * place the two meet, both ways, so the builder edits a set, the rep's phone
 * renders it and the quote is drafted from it without any of them knowing
 * how a question is stored.
 *
 * What a field says that a row has no column for — an area's shape, the range
 * it warns outside, the answer that shows it — is kept in `settings`.
 */

import { z } from "zod";

import {
  CHOICE_FIELD_TYPES,
  DISPLAY_FIELD_TYPES,
  fieldRuleSchema,
  type FieldDefinition,
  type FieldType,
} from "@/lib/forms/fields";
import { quoteLinesSchema, type QuoteLine } from "@/lib/forms/quote";

export const QUESTION_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "BOOLEAN",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "DATE",
  "DIMENSION",
  "PHOTO_EVIDENCE",
  "LENGTH",
  "AREA",
  "AREAS",
  "COUNT",
  "READING",
  "RUN",
  "SIGNATURE",
  "SECTION",
  "NOTE",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const FIELD_TYPE_BY_QUESTION: Record<QuestionType, FieldType> = {
  SHORT_TEXT: "text",
  LONG_TEXT: "longText",
  NUMBER: "number",
  BOOLEAN: "checkbox",
  SINGLE_SELECT: "select",
  MULTI_SELECT: "multiSelect",
  DATE: "date",
  // "___ m × ___ m", from before areas had a kind of their own. Read as one;
  // saved again, it is one.
  DIMENSION: "area",
  PHOTO_EVIDENCE: "photos",
  LENGTH: "length",
  AREA: "area",
  AREAS: "areas",
  COUNT: "count",
  READING: "reading",
  RUN: "run",
  SIGNATURE: "signature",
  SECTION: "section",
  NOTE: "note",
};

const QUESTION_TYPE_BY_FIELD: Partial<Record<FieldType, QuestionType>> = Object.fromEntries(
  Object.entries(FIELD_TYPE_BY_QUESTION)
    .filter(([question]) => question !== "DIMENSION")
    .map(([question, field]) => [field, question]),
);

/** What a site visit can ask: the builder's kinds that have somewhere to be stored on one. */
export const SITE_VISIT_FIELD_TYPES = Object.keys(QUESTION_TYPE_BY_FIELD) as FieldType[];

export function questionTypeFor(type: FieldType): QuestionType | null {
  return QUESTION_TYPE_BY_FIELD[type] ?? null;
}

/** The part of a field with no column of its own on `CrmQuestion`. */
export const questionSettingsSchema = z
  .object({
    placeholder: z.string().max(200).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    shape: z.enum(["rect", "total"]).optional(),
    warnAbove: z.number().finite().optional(),
    warnBelow: z.number().finite().optional(),
    warning: z.string().trim().max(200).optional(),
    showWhen: fieldRuleSchema.optional(),
  })
  .strict();
export type QuestionSettings = z.infer<typeof questionSettingsSchema>;

export type QuestionRow = {
  key: string;
  label: string;
  helpText: string | null;
  type: string;
  options?: unknown;
  unit: string | null;
  isRequired: boolean;
  settings?: unknown;
};

function choicesOf(options: unknown): FieldDefinition["options"] {
  if (!Array.isArray(options)) return undefined;
  const choices = options
    .map((option) =>
      typeof option === "string"
        ? { value: option, label: option }
        : option && typeof option === "object" && "value" in option
          ? { value: String(option.value), label: String((option as { label?: unknown }).label ?? option.value) }
          : null,
    )
    .filter((choice): choice is { value: string; label: string } => choice !== null);
  return choices.length ? choices : undefined;
}

/** A stored question as a field. Settings that no longer read are dropped, not trusted. */
export function fieldFromQuestion(question: QuestionRow): FieldDefinition {
  const type = FIELD_TYPE_BY_QUESTION[question.type as QuestionType] ?? "text";
  const settings = questionSettingsSchema.safeParse(question.settings ?? {});
  const field: FieldDefinition = {
    key: question.key,
    label: question.label,
    type,
    required: DISPLAY_FIELD_TYPES.includes(type) ? false : question.isRequired,
    ...(settings.success ? settings.data : {}),
  };
  if (question.helpText) field.help = question.helpText;
  if (question.unit) field.unit = question.unit;
  if (CHOICE_FIELD_TYPES.includes(type)) field.options = choicesOf(question.options) ?? [];
  if (question.type === "DIMENSION") {
    field.unit = "m";
    field.shape = "rect";
  }
  if (type === "area") field.shape ??= "rect";
  return field;
}

/** A field as the columns of a question row. */
export function questionFromField(field: FieldDefinition) {
  const type = questionTypeFor(field.type);
  if (!type) throw new Error(`A site visit cannot ask a "${field.type}" question`);
  const settings: QuestionSettings = {};
  for (const name of Object.keys(questionSettingsSchema.shape) as Array<keyof QuestionSettings>) {
    if (field[name] !== undefined) Object.assign(settings, { [name]: field[name] });
  }
  return {
    key: field.key,
    label: field.label,
    type,
    helpText: field.help?.trim() ? field.help.trim() : null,
    options: CHOICE_FIELD_TYPES.includes(field.type) ? (field.options ?? []) : null,
    unit: field.unit ?? null,
    isRequired: DISPLAY_FIELD_TYPES.includes(field.type) ? false : field.required,
    settings: Object.keys(settings).length ? settings : null,
  };
}

/** A set's quote lines as stored; lines that no longer read are left off rather than failing the set. */
export function quoteLinesOf(stored: unknown): QuoteLine[] {
  if (!Array.isArray(stored)) return [];
  const parsed = quoteLinesSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  return stored.flatMap((line) => {
    const one = quoteLinesSchema.element.safeParse(line);
    return one.success ? [one.data] : [];
  });
}

export type StoredAnswer = {
  questionType: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
  valueOptions: string[];
  valueDate: string | Date | null;
  valueJson: unknown;
};

/** What a rep answered, in the shape the field's input takes. */
export function answerValue(answer: StoredAnswer): unknown {
  switch (answer.questionType as QuestionType) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return answer.valueText ?? undefined;
    case "NUMBER":
    case "LENGTH":
    case "COUNT":
    case "READING":
      return answer.valueNumber ?? undefined;
    case "BOOLEAN":
      return answer.valueBool ?? undefined;
    case "SINGLE_SELECT":
      return answer.valueText ?? answer.valueOptions[0] ?? undefined;
    case "MULTI_SELECT":
      return answer.valueOptions.length ? answer.valueOptions : undefined;
    case "DATE": {
      if (!answer.valueDate) return undefined;
      const date = answer.valueDate instanceof Date ? answer.valueDate.toISOString() : answer.valueDate;
      return date.slice(0, 10);
    }
    case "DIMENSION": {
      const dimension = (answer.valueJson ?? null) as { widthM?: number | null; heightM?: number | null } | null;
      if (!dimension) return undefined;
      return { length: dimension.heightM ?? undefined, width: dimension.widthM ?? undefined };
    }
    case "PHOTO_EVIDENCE":
      return Array.isArray(answer.valueJson) ? answer.valueJson : undefined;
    case "AREA":
    case "AREAS":
    case "RUN":
    case "SIGNATURE":
      return answer.valueJson ?? undefined;
    case "SECTION":
    case "NOTE":
      return undefined;
  }
  return answer.valueText ?? undefined;
}

const figure = (value: unknown): number | undefined => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

/**
 * A measured answer as it is kept: numbers made numbers, an unnamed area
 * named. Lenient on purpose — a rep three rooms in should not lose all of
 * them because the fourth has no name yet.
 */
export function cleanMeasurement(field: FieldDefinition, value: unknown): unknown {
  switch (field.type) {
    case "area": {
      if (!value || typeof value !== "object") return null;
      const area = value as { area?: unknown; length?: unknown; width?: unknown };
      if (area.area !== undefined || field.shape === "total") {
        const total = figure(area.area);
        return total === undefined ? null : { area: total };
      }
      const length = figure(area.length);
      const width = figure(area.width);
      return length === undefined && width === undefined ? null : { length: length ?? null, width: width ?? null };
    }
    case "areas": {
      if (!Array.isArray(value)) return null;
      const areas = value.slice(0, 100).map((entry, index) => {
        const area = (entry ?? {}) as { name?: unknown; length?: unknown; width?: unknown; note?: unknown };
        const name = typeof area.name === "string" && area.name.trim() ? area.name.trim().slice(0, 80) : `Area ${index + 1}`;
        const note = typeof area.note === "string" && area.note.trim() ? area.note.trim().slice(0, 300) : undefined;
        return { name, length: figure(area.length) ?? null, width: figure(area.width) ?? null, ...(note ? { note } : {}) };
      });
      return areas.length ? areas : null;
    }
    case "run": {
      if (!Array.isArray(value)) return null;
      const lengths = value.slice(0, 100).map(figure).filter((length): length is number => length !== undefined);
      return lengths.length ? lengths : null;
    }
    default:
      return value;
  }
}

