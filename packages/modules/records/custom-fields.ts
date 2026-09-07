/**
 * Custom fields.
 *
 * Definitions are metadata; values live in a `customFields` JSON column on the
 * record itself. That keeps a record read to one row and avoids an EAV join on
 * every list query, at the cost of filtering going through Postgres JSON paths
 * rather than plain columns — which Prisma supports natively.
 *
 * Deliberately not supported: formula fields, rollups, and custom code. Those
 * turn a CRM into a programming environment.
 */
import type { CrmFieldEntity, CrmFieldType, Prisma } from "@corelithzw/db";
import { z } from "zod";

export type FieldDefinition = {
  id: string;
  entity: CrmFieldEntity;
  key: string;
  label: string;
  description: string | null;
  type: CrmFieldType;
  isRequired: boolean;
  defaultValue: unknown;
  options: unknown;
  section: string | null;
  position: number;
  showInTable: boolean;
};

export type FieldOption = { value: string; label: string; colorToken?: string };

/**
 * Every record type a custom field can be defined on.
 *
 * A SUBSET of the `CrmFieldEntity` enum, asserted as one by the test beside this
 * file. The enum is the product's record-type discriminator and is deliberately
 * wider: S-4.2 added `REP` to it so a file can belong to a member of staff, and
 * a rep is a `User` whose fields belong to the platform rather than to a tenant.
 * So `REP` is in the enum and not here, and that is not drift.
 *
 * What WAS drift, and what the test exists to catch: the enum gained the six
 * school types in S-4.4 and this list did not, so `fieldDefinitionInputSchema`
 * refused `entity: "STUDENT"` with a message naming only the CRM five plus work
 * orders — the data model was ready and the door was shut. The same shape of bug
 * as `TEXT_EDITABLE` naming field types the enum has never had.
 */
export const CRM_FIELD_ENTITIES = [
  "PERSON",
  "COMPANY",
  "LEAD",
  "DEAL",
  "SITE",
  "WORK_ORDER",
  "STUDENT",
  "GUARDIAN",
  "TEACHER",
  "CLASS",
  "SUBJECT",
  "HOSTEL",
] as const satisfies readonly CrmFieldEntity[];

export const CRM_FIELD_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "CURRENCY",
  "PERCENT",
  "DATE",
  "DATETIME",
  "CHECKBOX",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "PHONE",
  "EMAIL",
  "URL",
  "ADDRESS",
  "USER",
  "PERSON",
  "COMPANY",
  "SITE",
] as const;

export const CRM_FIELD_TYPE_LABELS: Record<CrmFieldType, string> = {
  SHORT_TEXT: "Short text",
  LONG_TEXT: "Long text",
  NUMBER: "Number",
  CURRENCY: "Currency",
  PERCENT: "Percentage",
  DATE: "Date",
  DATETIME: "Date and time",
  CHECKBOX: "Checkbox",
  SINGLE_SELECT: "Single select",
  MULTI_SELECT: "Multi-select",
  PHONE: "Phone",
  EMAIL: "Email",
  URL: "URL",
  ADDRESS: "Address",
  USER: "User",
  PERSON: "Person",
  COMPANY: "Company",
  SITE: "Site",
};

export const CRM_FIELD_ENTITY_LABELS: Record<CrmFieldEntity, string> = {
  PERSON: "People",
  COMPANY: "Companies",
  LEAD: "Leads",
  DEAL: "Deals",
  SITE: "Sites",
  WORK_ORDER: "Work orders",
  // S-4.4 — school record types. This map is the record-type discriminator's
  // labels, so it is the one place the six of them genuinely belong.
  STUDENT: "Student",
  GUARDIAN: "Guardian",
  TEACHER: "Teacher",
  CLASS: "Class",
  SUBJECT: "Subject",
  HOSTEL: "Hostel",
  // Not a custom-field target — a rep is a `User`, whose fields belong to the
  // platform rather than to a tenant. Present because this map is exhaustive
  // over the enum, and S-4.2 added REP to it so a file can belong to a rep.
  REP: "Staff",
};

/** Types whose value is a reference to another record, stored as that record's id. */
const REFERENCE_TYPES = new Set<CrmFieldType>(["USER", "PERSON", "COMPANY", "SITE"]);

export function isReferenceField(type: CrmFieldType): boolean {
  return REFERENCE_TYPES.has(type);
}

/**
 * Field keys are used as JSON object keys and in query strings, so they are
 * normalised to snake_case ASCII once, at creation, and never change after.
 */
export function normalizeFieldKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export const fieldOptionSchema = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  colorToken: z.string().trim().max(60).optional(),
});

export const fieldDefinitionInputSchema = z.object({
  entity: z.enum(CRM_FIELD_ENTITIES),
  key: z.string().trim().min(1).max(60).optional(),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  type: z.enum(CRM_FIELD_TYPES),
  isRequired: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  options: z.array(fieldOptionSchema).max(100).nullable().optional(),
  section: z.string().trim().max(80).nullable().optional(),
  position: z.number().int().min(0).max(999).optional(),
  showInTable: z.boolean().optional(),
});

export type FieldDefinitionInput = z.infer<typeof fieldDefinitionInputSchema>;

/** Select fields are meaningless without choices; everything else must not carry them. */
export function validateDefinition(input: FieldDefinitionInput): string[] {
  const errors: string[] = [];
  const needsOptions = input.type === "SINGLE_SELECT" || input.type === "MULTI_SELECT";

  if (needsOptions && (!input.options || input.options.length === 0)) {
    errors.push("A select field needs at least one option.");
  }
  if (!needsOptions && input.options && input.options.length > 0) {
    errors.push(`${CRM_FIELD_TYPE_LABELS[input.type]} fields don't take options.`);
  }
  if (input.options) {
    const seen = new Set<string>();
    for (const option of input.options) {
      if (seen.has(option.value)) errors.push(`Two options share the value "${option.value}".`);
      seen.add(option.value);
    }
  }
  return errors;
}

export type CoercionResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/**
 * Coerce a submitted value to the field's storage shape, or explain why it
 * can't be. Empty input always clears the field rather than storing "".
 */
export function coerceFieldValue(definition: FieldDefinition, raw: unknown): CoercionResult {
  const label = definition.label;

  if (raw === null || raw === undefined || raw === "") {
    if (definition.isRequired) return { ok: false, error: `${label} is required.` };
    return { ok: true, value: null };
  }

  switch (definition.type) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
    case "PHONE":
    case "ADDRESS": {
      const value = String(raw).trim();
      const max = definition.type === "LONG_TEXT" || definition.type === "ADDRESS" ? 5000 : 500;
      if (value.length > max) return { ok: false, error: `${label} is too long.` };
      return { ok: true, value: value || null };
    }

    case "EMAIL": {
      const value = String(raw).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { ok: false, error: `${label} doesn't look like an email address.` };
      }
      return { ok: true, value: value.toLowerCase() };
    }

    case "URL": {
      const value = String(raw).trim();
      try {
        // Accept a bare domain the way a browser address bar would.
        const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
        return { ok: true, value: url.toString() };
      } catch {
        return { ok: false, error: `${label} doesn't look like a web address.` };
      }
    }

    case "NUMBER":
    case "CURRENCY":
    case "PERCENT": {
      const value = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(value)) return { ok: false, error: `${label} must be a number.` };
      if (definition.type === "PERCENT" && (value < 0 || value > 100)) {
        return { ok: false, error: `${label} must be between 0 and 100.` };
      }
      if (definition.type === "CURRENCY" && value < 0) {
        return { ok: false, error: `${label} can't be negative.` };
      }
      return { ok: true, value };
    }

    case "DATE":
    case "DATETIME": {
      const date = new Date(String(raw));
      if (Number.isNaN(date.getTime())) return { ok: false, error: `${label} isn't a valid date.` };
      return {
        ok: true,
        value: definition.type === "DATE" ? date.toISOString().slice(0, 10) : date.toISOString(),
      };
    }

    case "CHECKBOX":
      return { ok: true, value: raw === true || raw === "true" || raw === "1" };

    case "SINGLE_SELECT": {
      const value = String(raw).trim();
      const options = (definition.options ?? []) as FieldOption[];
      if (!options.some((option) => option.value === value)) {
        return { ok: false, error: `"${value}" isn't one of the choices for ${label}.` };
      }
      return { ok: true, value };
    }

    case "MULTI_SELECT": {
      const values = Array.isArray(raw) ? raw.map((entry) => String(entry).trim()) : [String(raw).trim()];
      const options = (definition.options ?? []) as FieldOption[];
      const allowed = new Set(options.map((option) => option.value));
      const unknown = values.filter((value) => !allowed.has(value));
      if (unknown.length > 0) {
        return { ok: false, error: `${unknown.join(", ")} isn't a choice for ${label}.` };
      }
      return { ok: true, value: Array.from(new Set(values)) };
    }

    case "USER":
    case "PERSON":
    case "COMPANY":
    case "SITE": {
      const value = String(raw).trim();
      // Reference fields hold a record id; the caller verifies it is in-tenant.
      if (!/^[0-9a-f-]{36}$/i.test(value)) {
        return { ok: false, error: `${label} must reference a record.` };
      }
      return { ok: true, value };
    }

    default:
      return { ok: false, error: `${label} has an unsupported field type.` };
  }
}

/**
 * Validate and normalise a whole customFields payload against the definitions
 * for that entity. Unknown keys are dropped rather than rejected: a form
 * submitted just before a field was archived shouldn't fail to save.
 */
export function buildCustomFieldValues(
  definitions: FieldDefinition[],
  submitted: Record<string, unknown> | null | undefined,
  options: { partial?: boolean } = {},
): { values: Prisma.InputJsonObject; errors: string[] } {
  const values: Record<string, unknown> = {};
  const errors: string[] = [];
  const input = submitted ?? {};

  for (const definition of definitions) {
    const provided = Object.prototype.hasOwnProperty.call(input, definition.key);
    // A partial update only touches the keys it was given.
    if (!provided && options.partial) continue;

    const raw = provided ? input[definition.key] : definition.defaultValue ?? null;
    const result = coerceFieldValue(definition, raw);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    if (result.value !== null) values[definition.key] = result.value;
  }

  return { values: values as Prisma.InputJsonObject, errors };
}

/**
 * Merge validated values over what the record already has. Keys explicitly set
 * to null are removed, so a user can clear a custom field.
 */
export function mergeCustomFields(
  existing: unknown,
  updates: Record<string, unknown>,
  clearedKeys: string[] = [],
): Prisma.InputJsonValue {
  const base = (existing && typeof existing === "object" ? existing : {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base, ...updates };
  for (const key of clearedKeys) delete merged[key];
  return merged as Prisma.InputJsonValue;
}

/**
 * A Prisma where clause for filtering on a custom field. Only equality and
 * containment are supported — enough for views and filters without turning
 * the filter bar into a query language.
 */
export function customFieldWhere(
  key: string,
  value: unknown,
): Prisma.JsonFilter | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return { path: [key], array_contains: value as Prisma.InputJsonValue };
  }
  return { path: [key], equals: value as Prisma.InputJsonValue };
}

/** Human-readable rendering of a stored value, for tables and record pages. */
export function formatFieldValue(definition: FieldDefinition, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  switch (definition.type) {
    case "CHECKBOX":
      return value ? "Yes" : "No";
    case "PERCENT":
      return `${value}%`;
    case "DATE":
      return new Date(String(value)).toLocaleDateString();
    case "DATETIME":
      return new Date(String(value)).toLocaleString();
    case "SINGLE_SELECT": {
      const options = (definition.options ?? []) as FieldOption[];
      return options.find((option) => option.value === value)?.label ?? String(value);
    }
    case "MULTI_SELECT": {
      const options = (definition.options ?? []) as FieldOption[];
      const values = Array.isArray(value) ? value : [value];
      return values
        .map((entry) => options.find((option) => option.value === entry)?.label ?? String(entry))
        .join(", ");
    }
    case "CURRENCY":
    case "NUMBER":
      return Number(value).toLocaleString();
    default:
      return String(value);
  }
}

/** Group definitions into the sections a record page renders. */
export function groupBySection(definitions: FieldDefinition[]) {
  const sections = new Map<string, FieldDefinition[]>();
  for (const definition of [...definitions].sort((a, b) => a.position - b.position)) {
    const key = definition.section?.trim() || "Details";
    const bucket = sections.get(key);
    if (bucket) bucket.push(definition);
    else sections.set(key, [definition]);
  }
  return Array.from(sections.entries()).map(([section, fields]) => ({ section, fields }));
}

/** A field definition as the API returns it, whichever module's entity it is for. */
export type FieldDefinitionRecord = {
  id: string;
  entity: string;
  key: string;
  label: string;
  description: string | null;
  type: string;
  isRequired: boolean;
  defaultValue: unknown;
  options: Array<{ value: string; label: string; colorToken?: string }> | null;
  section: string | null;
  position: number;
  showInTable: boolean;
  archivedAt: string | null;
};
