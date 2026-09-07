/**
 * What a record type is, for every module that has one.
 *
 * The record page — an identity strip, editable attributes, a tab per
 * relationship — had been written five times inside the CRM module before
 * `RecordPageShell` was pulled out of it, and the header comment on
 * `components/records/record-tabs.tsx` says why: a fix landed on one of five
 * copies. S-4.1 finishes that job. The components moved to
 * `components/records/`, which owes nothing to any module, and the per-type
 * facts they need — what it is called, what it looks like, where it lives, how
 * to load one — live here rather than being hard-coded in six detail pages.
 *
 * This is deliberately a registry of DESCRIPTIONS, not of components. It says a
 * student is a person-shaped record reached at `/schools/students/:id` whose
 * mark is an avatar; it does not say how to render one. A module keeps its own
 * detail page and its own queries — those are irreducibly about its tables —
 * and gets the shell, the attribute editor and the mark for free.
 *
 * Adding a type here does NOT give it tasks, comments or files. Those hang off
 * `CrmTask`/`CrmComment`/`CrmRecordFile`, which key their subject by a nullable
 * foreign key per kind, so a new type needs S-4.2's `(subjectType, subjectId)`
 * re-key first. Resist adding a column per school type to those three tables:
 * six types across three tables is eighteen nullable foreign keys, and
 * `isValidParent` becomes an eleven-way field comparison.
 */
import { registeredModules } from "@corelithzw/platform/manifest";
import type { RecordKind } from "./components/record-mark";

/**
 * Every record type in the product, whichever module owns it. The vocabulary
 * is the schema's `CrmFieldEntity` enum, which modules extend in their own
 * schema files; what each type looks like and where it lives is the owning
 * module's manifest (`records.types`).
 */
export const RECORD_TYPES = [
  // CRM
  "PERSON",
  "COMPANY",
  "LEAD",
  "DEAL",
  "SITE",
  /**
   * A member of staff — a `User`, not a CRM record: the profile page is somebody
   * who works here rather than somebody we sell to. It has a record page
   * (`/crm/reps/[id]`) and files hang off it, which is why S-4.2 gave it a
   * subject type. It is not a custom-field target; see `CRM_FIELD_ENTITIES`.
   */
  "REP",
  // Schools (S-4.3)
  "STUDENT",
  "GUARDIAN",
  "TEACHER",
  "CLASS",
  "SUBJECT",
  "HOSTEL",
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

export type RecordTypeConfig = {
  type: RecordType;
  /** Singular, as a person would say it. */
  label: string;
  labelPlural: string;
  /** Which module owns the tables. Governs the feature gate and the nav. */
  module: string;
  /** How the mark is drawn — see `components/records/record-mark.tsx`. */
  kind: RecordKind;
  /**
   * Whether the reader is looking for a *who*. People get initials rather than
   * a repeated glyph, and are never stood in for by an emoji.
   */
  isPerson: boolean;
  /** The list this type is reached through. */
  indexHref: string;
  /** The record page for one of them. */
  href: (id: string) => string;
  /** The REST resource its attributes are PATCHed to, for the shared editor. */
  apiPath: (id: string) => string;
  /**
   * The query key a saved attribute must invalidate. Kept here so a type cannot
   * be edited on one screen and stay stale on another.
   */
  queryKey: (id: string) => unknown[];
};

function fill(template: string, id: string) {
  return template.replace(/\{id\}/g, id);
}

/** The templates the registered manifests declare, as the functions the screens call. */
function configs(): RecordTypeConfig[] {
  return registeredModules().flatMap((manifest) =>
    (manifest.records?.types ?? []).map((template): RecordTypeConfig => ({
      type: template.type as RecordType,
      label: template.label,
      labelPlural: template.labelPlural,
      module: manifest.id,
      kind: template.kind as RecordKind,
      isPerson: template.isPerson,
      indexHref: template.indexHref,
      href: (id) => fill(template.href, id),
      apiPath: (id) => fill(template.apiPath, id),
      queryKey: (id) => template.queryKey.map((part) => fill(part, id)),
    })),
  );
}

export function recordType(type: RecordType): RecordTypeConfig {
  const config = configs().find((candidate) => candidate.type === type);
  if (!config) throw new Error(`No record type registered as ${type}`);
  return config;
}

export function recordTypesForModule(module: string): RecordTypeConfig[] {
  return configs().filter((config) => config.module === module);
}
