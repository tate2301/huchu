/**
 * What a task, a comment or a file is *about*.
 *
 * S-4.2. Those three tables named their subject with one nullable foreign key
 * per kind — `leadId`, `dealId`, `clientId`, `personId`, `siteId`, and `userId`
 * on files. That bought two real things, and the schema comments say so: the
 * database enforced that the record existed, and cascaded a delete when it went.
 * What it cost was that only a kind with a column could be a subject. A student
 * could not be, and giving the six school types one column each across three
 * tables is eighteen nullable foreign keys and an eleven-way parent comparison.
 *
 * So the subject is now a `(subjectType, subjectId)` pair, and this module is the
 * only place that knows both schemes exist.
 *
 * ── Both schemes are live, on purpose ──────────────────────────────────────
 *
 * The old columns are still written and still read. Nothing is dropped here.
 * A row can therefore be in one of three states:
 *
 *   1. Old row, not yet backfilled — legacy column only.
 *   2. New row about a CRM record — both, agreeing.
 *   3. New row about a school record — pair only, because there is no column
 *      that could hold it.
 *
 * `subjectWhere` matches all three, which is what makes the change safe to
 * deploy before the backfill has run and before the columns come out. Dropping
 * them is a migration of your choosing; when you do, delete `LEGACY_COLUMN` and
 * everything that reads it and this file gets much shorter.
 */
import type { CrmFieldEntity, Prisma } from "@corelithzw/db";
import { z } from "zod";

/** The record types that can be the subject of a task, comment or file. */
export const SUBJECT_TYPES = [
  "LEAD",
  "DEAL",
  "COMPANY",
  "PERSON",
  "SITE",
  "REP",
  "STUDENT",
  "GUARDIAN",
  "TEACHER",
  "CLASS",
  "SUBJECT",
  "HOSTEL",
] as const satisfies readonly CrmFieldEntity[];

export type SubjectType = (typeof SUBJECT_TYPES)[number];

export type RecordSubject = { type: SubjectType; id: string };

export const recordSubjectSchema = z.object({
  subjectType: z.enum(SUBJECT_TYPES),
  subjectId: z.string().uuid(),
});

/**
 * The pre-S-4.2 column for a subject type, where there was one.
 *
 * School types are absent because they never had a column — which is the whole
 * reason for this story. `REP` maps to `userId`, which only `CrmRecordFile` has;
 * see `LEGACY_COLUMN_TABLES` below.
 */
const LEGACY_COLUMN: Partial<Record<SubjectType, string>> = {
  LEAD: "leadId",
  DEAL: "dealId",
  COMPANY: "clientId",
  PERSON: "personId",
  SITE: "siteId",
  REP: "userId",
};

/** Which legacy columns each table actually has. `userId` is files-only. */
const LEGACY_COLUMN_TABLES: Record<"task" | "comment" | "file", string[]> = {
  task: ["leadId", "dealId", "clientId", "personId", "siteId"],
  comment: ["leadId", "dealId", "clientId", "personId", "siteId"],
  file: ["leadId", "dealId", "clientId", "personId", "siteId", "userId"],
};

export type SubjectTable = keyof typeof LEGACY_COLUMN_TABLES;

function legacyColumnFor(table: SubjectTable, type: SubjectType): string | null {
  const column = LEGACY_COLUMN[type];
  if (!column) return null;
  return LEGACY_COLUMN_TABLES[table].includes(column) ? column : null;
}

/**
 * What to write when creating a row.
 *
 * Always the pair; also the legacy column when the subject has one on this
 * table, so a deployment that has not yet dropped the columns keeps its
 * cascade-on-delete and keeps working if this change is rolled back.
 */
export function subjectData(
  table: SubjectTable,
  subject: RecordSubject,
): Record<string, string> {
  const data: Record<string, string> = {
    subjectType: subject.type,
    subjectId: subject.id,
  };
  const column = legacyColumnFor(table, subject.type);
  if (column) data[column] = subject.id;
  return data;
}

/**
 * A filter that finds a subject's rows under either scheme.
 *
 * The legacy arm pins the *other* legacy columns to null, which is what the
 * pre-S-4.2 `commentRecordWhere` did and why a comment on a deal never appeared
 * on that deal's site. Without it, a row with two columns set would show up in
 * two places.
 */
export function subjectWhere(table: SubjectTable, subject: RecordSubject): Prisma.JsonObject {
  const pairArm: Record<string, unknown> = {
    subjectType: subject.type,
    subjectId: subject.id,
  };

  const column = legacyColumnFor(table, subject.type);
  if (!column) {
    // A school record has no legacy column, so the pair is the only way in.
    return { OR: [pairArm] } as unknown as Prisma.JsonObject;
  }

  const legacyArm: Record<string, unknown> = {};
  for (const other of LEGACY_COLUMN_TABLES[table]) {
    legacyArm[other] = other === column ? subject.id : null;
  }

  return { OR: [pairArm, legacyArm] } as unknown as Prisma.JsonObject;
}

/**
 * Read a row's subject, preferring the pair and falling back to the columns.
 *
 * Returns null for a row that names nothing, which the old schema allowed: every
 * column was nullable and nothing stopped all of them being null at once.
 */
export function subjectOf(row: {
  subjectType?: CrmFieldEntity | null;
  subjectId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
  clientId?: string | null;
  personId?: string | null;
  siteId?: string | null;
  userId?: string | null;
}): RecordSubject | null {
  if (row.subjectType && row.subjectId) {
    return { type: row.subjectType as SubjectType, id: row.subjectId };
  }

  // The order is the precedence a multi-subject row resolves to, and it is
  // narrowest-first. `CrmTask`'s schema comment says several columns may be set
  // at once — "filed against a deal and its site" — and in that pairing the deal
  // is what the task is about; the site is context. A row like that keeps its
  // other columns until they are dropped, so nothing is lost by choosing here.
  const ordered: Array<[SubjectType, string | null | undefined]> = [
    ["DEAL", row.dealId],
    ["LEAD", row.leadId],
    ["COMPANY", row.clientId],
    ["PERSON", row.personId],
    ["SITE", row.siteId],
    ["REP", row.userId],
  ];
  for (const [type, id] of ordered) {
    if (id) return { type, id };
  }
  return null;
}

/**
 * Whether a comment may be a reply to this parent.
 *
 * Was a field-by-field comparison of five nullable columns. A reply must be on
 * the same subject as its parent, and a parent must be top-level — one level of
 * nesting, so a thread stays readable.
 */
export function isValidReplyParent(
  parent: Parameters<typeof subjectOf>[0] & { parentId?: string | null },
  subject: RecordSubject,
): boolean {
  if (parent.parentId) return false;
  const parentSubject = subjectOf(parent);
  return parentSubject?.type === subject.type && parentSubject.id === subject.id;
}

// ── Translating the callers' vocabulary ─────────────────────────────────────
//
// The UI says `owner: "company"` for a file and `entity: "COMPANY"` for a
// comment, from two enums that predate this one. Mapped here rather than
// changing three component signatures and every call site: the storage is what
// S-4.2 is about, and a rename would bury the actual change in noise.

const FILE_OWNER_TO_SUBJECT: Record<string, SubjectType> = {
  lead: "LEAD",
  deal: "DEAL",
  company: "COMPANY",
  person: "PERSON",
  site: "SITE",
  rep: "REP",
  student: "STUDENT",
  guardian: "GUARDIAN",
  teacher: "TEACHER",
  class: "CLASS",
  subject: "SUBJECT",
  hostel: "HOSTEL",
};

export function subjectFromFileOwner(owner: string, id: string): RecordSubject | null {
  const type = FILE_OWNER_TO_SUBJECT[owner];
  return type ? { type, id } : null;
}

export function subjectFromEntity(entity: string, id: string): RecordSubject | null {
  const upper = entity.toUpperCase();
  const type = SUBJECT_TYPES.find((candidate) => candidate === upper);
  return type ? { type, id } : null;
}
