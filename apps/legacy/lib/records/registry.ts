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
import type { RecordKind } from "@/components/records/record-mark";

/** Every record type in the product, whichever module owns it. */
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
  module: "crm" | "schools";
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

const CONFIGS: RecordTypeConfig[] = [
  {
    type: "PERSON",
    label: "Person",
    labelPlural: "People",
    module: "crm",
    kind: "person",
    isPerson: true,
    indexHref: "/crm/people",
    href: (id) => `/crm/people/${id}`,
    apiPath: (id) => `/api/v2/crm/people/${id}`,
    queryKey: (id) => ["crm", "person", id],
  },
  {
    type: "COMPANY",
    label: "Company",
    labelPlural: "Companies",
    module: "crm",
    kind: "company",
    isPerson: false,
    indexHref: "/crm/companies",
    href: (id) => `/crm/companies/${id}`,
    apiPath: (id) => `/api/v2/crm/companies/${id}`,
    queryKey: (id) => ["crm", "company", id],
  },
  {
    type: "LEAD",
    label: "Lead",
    labelPlural: "Leads",
    module: "crm",
    kind: "lead",
    isPerson: false,
    indexHref: "/crm/leads",
    href: (id) => `/crm/leads/${id}`,
    apiPath: (id) => `/api/v2/crm/leads/${id}`,
    queryKey: (id) => ["crm", "lead", id],
  },
  {
    type: "DEAL",
    label: "Deal",
    labelPlural: "Deals",
    module: "crm",
    kind: "deal",
    isPerson: false,
    indexHref: "/crm/deals",
    href: (id) => `/crm/deals/${id}`,
    apiPath: (id) => `/api/v2/crm/deals/${id}`,
    queryKey: (id) => ["crm", "deal", id],
  },
  {
    type: "SITE",
    label: "Site",
    labelPlural: "Sites",
    module: "crm",
    kind: "site",
    isPerson: false,
    indexHref: "/crm/sites",
    href: (id) => `/crm/sites/${id}`,
    apiPath: (id) => `/api/v2/crm/sites/${id}`,
    queryKey: (id) => ["crm", "site", id],
  },
  {
    type: "REP",
    label: "Staff member",
    labelPlural: "Staff",
    module: "crm",
    kind: "rep",
    isPerson: true,
    indexHref: "/crm/reps",
    href: (id) => `/crm/reps/${id}`,
    apiPath: (id) => `/api/v2/crm/reps/${id}`,
    queryKey: (id) => ["crm", "rep", id],
  },
  {
    type: "STUDENT",
    label: "Student",
    labelPlural: "Students",
    module: "schools",
    kind: "student",
    isPerson: true,
    indexHref: "/schools/students",
    href: (id) => `/schools/students/${id}`,
    apiPath: (id) => `/api/v2/schools/students/${id}`,
    queryKey: (id) => ["schools", "student", id],
  },
  {
    type: "GUARDIAN",
    label: "Guardian",
    labelPlural: "Guardians",
    module: "schools",
    kind: "guardian",
    isPerson: true,
    indexHref: "/schools/guardians",
    href: (id) => `/schools/guardians/${id}`,
    apiPath: (id) => `/api/v2/schools/guardians/${id}`,
    queryKey: (id) => ["schools", "guardian", id],
  },
  {
    type: "TEACHER",
    label: "Teacher",
    labelPlural: "Teachers",
    module: "schools",
    kind: "teacher",
    isPerson: true,
    indexHref: "/schools/teachers",
    href: (id) => `/schools/teachers/${id}`,
    apiPath: (id) => `/api/v2/schools/teachers/${id}`,
    queryKey: (id) => ["schools", "teacher", id],
  },
  {
    type: "CLASS",
    label: "Class",
    labelPlural: "Classes",
    module: "schools",
    kind: "class",
    isPerson: false,
    // The academic ladder moved into Management > Master Data; the old
    // `/schools/classes` routes still redirect here.
    indexHref: "/management/master-data/schools/classes",
    href: (id) => `/management/master-data/schools/classes/${id}`,
    apiPath: (id) => `/api/v2/schools/classes/${id}`,
    queryKey: (id) => ["schools", "class", id],
  },
  {
    type: "SUBJECT",
    label: "Subject",
    labelPlural: "Subjects",
    module: "schools",
    kind: "subject",
    isPerson: false,
    indexHref: "/management/master-data/schools/subjects",
    href: (id) => `/management/master-data/schools/subjects/${id}`,
    apiPath: (id) => `/api/v2/schools/subjects/${id}`,
    queryKey: (id) => ["schools", "subject", id],
  },
  {
    type: "HOSTEL",
    label: "Hostel",
    labelPlural: "Hostels",
    module: "schools",
    kind: "hostel",
    isPerson: false,
    indexHref: "/schools/boarding",
    href: (id) => `/schools/boarding/${id}`,
    apiPath: (id) => `/api/v2/schools/boarding/hostels/${id}`,
    queryKey: (id) => ["schools", "hostel", id],
  },
];

const BY_TYPE = new Map<RecordType, RecordTypeConfig>(
  CONFIGS.map((config) => [config.type, config]),
);

export function recordType(type: RecordType): RecordTypeConfig {
  const config = BY_TYPE.get(type);
  if (!config) throw new Error(`No record type registered as ${type}`);
  return config;
}

export function recordTypesForModule(module: RecordTypeConfig["module"]): RecordTypeConfig[] {
  return CONFIGS.filter((config) => config.module === module);
}

export const SCHOOL_RECORD_TYPES = [
  "STUDENT",
  "GUARDIAN",
  "TEACHER",
  "CLASS",
  "SUBJECT",
  "HOSTEL",
] as const satisfies readonly RecordType[];

export type SchoolRecordType = (typeof SCHOOL_RECORD_TYPES)[number];
