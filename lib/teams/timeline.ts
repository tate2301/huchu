import type { CrmActivityType, EventModule, EventSource, RecordSubjectType } from "@prisma/client";

import { subjectWhere, type SubjectType } from "@/lib/records/subject";

import type { Db } from "./db";

/**
 * The timeline of one record: comments, activities, files and field changes in
 * one list, newest first, with the roll-ups the model sets:
 *
 * - Anything a person wrote (a comment) gets its own line and is never rolled up.
 * - One person's field edits within an hour roll into one line. The hour runs
 *   from the first edit of the line, so a line never spans more than an hour.
 * - Machine events of one kind on one day (a till, ZIMRA, the bank, an import,
 *   the system) roll into a count and a total. A lone one stays as it is.
 * - Filters: Everything, Comments, Documents, Calls, Changes. A filter picks the
 *   rows first, then rolls up what is left.
 *
 * `buildTimeline` is a pure function over rows; `loadTimeline` reads the rows.
 * Files and field changes carry no source or module column, so those are read
 * as `source: null` and a module worked out from the record's type.
 */

export type TimelineFilter = "everything" | "comments" | "documents" | "calls" | "changes";
export const TIMELINE_FILTERS: readonly TimelineFilter[] = ["everything", "comments", "documents", "calls", "changes"];

export type Person = { id: string; name: string };

export type TimelineRow =
  | { kind: "comment"; id: string; at: Date; actor: Person | null; source: EventSource; module: EventModule; body: string }
  | {
      kind: "activity";
      id: string;
      at: Date;
      actor: Person | null;
      source: EventSource;
      module: EventModule;
      type: CrmActivityType;
      subject: string;
      body: string | null;
      /** Money the event moved, when its metadata says (`amount`). */
      amount: number | null;
    }
  | { kind: "file"; id: string; at: Date; actor: Person | null; source: null; module: EventModule; name: string }
  | { kind: "change"; id: string; at: Date; actor: Person | null; source: null; module: EventModule; field: string; from: string | null; to: string | null };

export type EditLine = { id: string; at: Date; field: string; from: string | null; to: string | null };

export type TimelineEntry =
  | { kind: "comment"; key: string; at: Date; actor: Person | null; source: EventSource; module: EventModule; body: string }
  | {
      kind: "activity";
      key: string;
      at: Date;
      actor: Person | null;
      source: EventSource;
      module: EventModule;
      type: CrmActivityType;
      subject: string;
      body: string | null;
    }
  | { kind: "file"; key: string; at: Date; actor: Person | null; module: EventModule; name: string }
  /** One person's edits within an hour; `at` is the last. Opens in place to `edits`. */
  | { kind: "edits"; key: string; at: Date; actor: Person | null; module: EventModule; edits: EditLine[] }
  /** Machine events of one kind on one day. `total` is null when none of them moved money. */
  | {
      kind: "machine";
      key: string;
      at: Date;
      day: string;
      source: EventSource;
      module: EventModule;
      type: CrmActivityType;
      count: number;
      total: number | null;
      ids: string[];
    };

export const EDIT_WINDOW_MS = 60 * 60 * 1000;
/** Harare is UTC+2 all year, so a "day" for a machine roll-up is the Harare day. */
const HARARE_OFFSET_MS = 2 * 60 * 60 * 1000;

const MACHINE_SOURCES: ReadonlySet<EventSource> = new Set(["TILL", "ZIMRA", "BANK", "IMPORT", "SYSTEM"]);
const DOCUMENT_TYPES: ReadonlySet<CrmActivityType> = new Set(["DOCUMENT_CREATED", "DOCUMENT_SENT", "DOCUMENT_APPROVED", "DOCUMENT_DECLINED"]);

export function dayOf(at: Date): string {
  return new Date(at.getTime() + HARARE_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whether a row is a machine's, not a person's: a machine source, or no one did it. */
export function isMachine(row: TimelineRow): boolean {
  return row.kind === "activity" && (MACHINE_SOURCES.has(row.source) || row.actor === null);
}

function passes(row: TimelineRow, filter: TimelineFilter): boolean {
  switch (filter) {
    case "everything":
      return true;
    case "comments":
      return row.kind === "comment";
    case "documents":
      return row.kind === "file" || (row.kind === "activity" && DOCUMENT_TYPES.has(row.type));
    case "calls":
      return row.kind === "activity" && (row.type === "CALL" || row.source === "PHONE");
    case "changes":
      return row.kind === "change" || (row.kind === "activity" && row.type === "STAGE_CHANGE");
  }
}

const newestFirst = (a: { at: Date; key: string }, b: { at: Date; key: string }) => b.at.getTime() - a.at.getTime() || (a.key < b.key ? 1 : -1);

/** The rows, rolled up as the rules say, newest first. */
export function buildTimeline(rows: readonly TimelineRow[], filter: TimelineFilter = "everything"): TimelineEntry[] {
  const kept = rows.filter((row) => passes(row, filter));
  const entries: TimelineEntry[] = [];

  // Field edits: per person, oldest first, a new line when the hour is up.
  const changes = kept.filter((row): row is Extract<TimelineRow, { kind: "change" }> => row.kind === "change");
  const byActor = new Map<string, typeof changes>();
  for (const change of changes) {
    const key = change.actor?.id ?? "";
    byActor.set(key, [...(byActor.get(key) ?? []), change]);
  }
  for (const [actorKey, list] of byActor) {
    const ordered = [...list].sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : 1));
    let line: typeof ordered = [];
    const flush = () => {
      if (line.length === 0) return;
      const last = line[line.length - 1];
      entries.push({
        kind: "edits",
        key: `edits:${actorKey}:${line[0].id}`,
        at: last.at,
        actor: last.actor,
        module: last.module,
        edits: line.map((change) => ({ id: change.id, at: change.at, field: change.field, from: change.from, to: change.to })),
      });
      line = [];
    };
    for (const change of ordered) {
      if (line.length > 0 && change.at.getTime() - line[0].at.getTime() >= EDIT_WINDOW_MS) flush();
      line.push(change);
    }
    flush();
  }

  // Machine events: one line per kind per day, when there is more than one.
  const machine = new Map<string, Array<Extract<TimelineRow, { kind: "activity" }>>>();
  for (const row of kept) {
    if (row.kind !== "activity" || !isMachine(row)) continue;
    const key = `${row.source}:${row.type}:${dayOf(row.at)}`;
    machine.set(key, [...(machine.get(key) ?? []), row]);
  }
  const rolled = new Set<string>();
  for (const [key, group] of machine) {
    if (group.length < 2) continue;
    const latest = group.reduce((a, b) => (b.at.getTime() > a.at.getTime() ? b : a));
    const amounts = group.map((row) => row.amount).filter((amount): amount is number => amount !== null);
    for (const row of group) rolled.add(row.id);
    entries.push({
      kind: "machine",
      key: `machine:${key}`,
      at: latest.at,
      day: dayOf(latest.at),
      source: latest.source,
      module: latest.module,
      type: latest.type,
      count: group.length,
      total: amounts.length ? Math.round(amounts.reduce((sum, amount) => sum + amount, 0) * 100) / 100 : null,
      ids: group.map((row) => row.id),
    });
  }

  for (const row of kept) {
    switch (row.kind) {
      case "comment":
        entries.push({ kind: "comment", key: `comment:${row.id}`, at: row.at, actor: row.actor, source: row.source, module: row.module, body: row.body });
        break;
      case "activity":
        if (rolled.has(row.id)) break;
        entries.push({ kind: "activity", key: `activity:${row.id}`, at: row.at, actor: row.actor, source: row.source, module: row.module, type: row.type, subject: row.subject, body: row.body });
        break;
      case "file":
        entries.push({ kind: "file", key: `file:${row.id}`, at: row.at, actor: row.actor, module: row.module, name: row.name });
        break;
      case "change":
        break;
    }
  }

  return entries.sort(newestFirst);
}

// Reading the rows.

const CRM_ENTITY_NAMES: Partial<Record<RecordSubjectType, string[]>> = {
  // Field history says CLIENT where comments say COMPANY.
  COMPANY: ["CLIENT", "COMPANY"],
};

const ACTIVITY_COLUMN: Partial<Record<RecordSubjectType, "leadId" | "dealId" | "clientId" | "personId">> = {
  LEAD: "leadId",
  DEAL: "dealId",
  COMPANY: "clientId",
  PERSON: "personId",
};

const SCHOOL_TYPES: ReadonlySet<string> = new Set(["STUDENT", "GUARDIAN", "TEACHER", "CLASS", "SUBJECT", "HOSTEL"]);

/** The module a file or a field change belongs to, from the record it is on. */
export function moduleOfRecord(type: RecordSubjectType): EventModule {
  if (type.startsWith("RETAIL_")) return "RETAIL";
  if (SCHOOL_TYPES.has(type)) return "SCHOOLS";
  return "CRM";
}

const person = (user: { id: string; name: string } | null | undefined): Person | null => (user ? { id: user.id, name: user.name } : null);

function amountOf(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const amount = (metadata as { amount?: unknown }).amount;
  const value = typeof amount === "string" ? Number(amount) : amount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The rows for one record, newest first from each table, up to `perTable` of
 * each. A very long history can therefore roll up slightly differently at its
 * far end; page by asking for more.
 */
export async function loadTimelineRows(
  db: Db,
  companyId: string,
  record: { type: RecordSubjectType; id: string },
  perTable = 300,
): Promise<TimelineRow[]> {
  const subject = { type: record.type as SubjectType, id: record.id };
  const activityColumn = ACTIVITY_COLUMN[record.type];
  const moduleName = moduleOfRecord(record.type);

  const [comments, activities, files, changes] = await Promise.all([
    db.crmComment.findMany({
      where: { companyId, ...(subjectWhere("comment", subject) as object) },
      select: { id: true, body: true, createdAt: true, source: true, module: true, createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: perTable,
    }),
    db.crmActivity.findMany({
      where: {
        companyId,
        OR: [
          ...(activityColumn ? [{ [activityColumn]: record.id }] : []),
          // A field edit names its record in its metadata: the only way some records appear at all.
          { metadata: { path: ["recordId"], equals: record.id } },
        ],
      },
      select: { id: true, type: true, subject: true, body: true, metadata: true, occurredAt: true, source: true, module: true, createdBy: { select: { id: true, name: true } } },
      orderBy: { occurredAt: "desc" },
      take: perTable,
    }),
    db.crmRecordFile.findMany({
      where: { companyId, ...(subjectWhere("file", subject) as object) },
      select: { id: true, name: true, createdAt: true, uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: perTable,
    }),
    db.crmFieldChange.findMany({
      where: { companyId, recordId: record.id, entity: { in: CRM_ENTITY_NAMES[record.type] ?? [record.type] } },
      select: { id: true, field: true, oldValue: true, newValue: true, createdAt: true, changedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: perTable,
    }),
  ]);

  return [
    ...comments.map((row): TimelineRow => ({ kind: "comment", id: row.id, at: row.createdAt, actor: person(row.createdBy), source: row.source, module: row.module, body: row.body })),
    ...activities.map((row): TimelineRow => ({
      kind: "activity",
      id: row.id,
      at: row.occurredAt,
      actor: person(row.createdBy),
      source: row.source,
      module: row.module,
      type: row.type,
      subject: row.subject,
      body: row.body,
      amount: amountOf(row.metadata),
    })),
    ...files.map((row): TimelineRow => ({ kind: "file", id: row.id, at: row.createdAt, actor: person(row.uploadedBy), source: null, module: moduleName, name: row.name })),
    ...changes.map((row): TimelineRow => ({ kind: "change", id: row.id, at: row.createdAt, actor: person(row.changedBy), source: null, module: moduleName, field: row.field, from: row.oldValue, to: row.newValue })),
  ];
}

/** A record's timeline: read the rows, roll them up, newest first. */
export async function loadTimeline(
  db: Db,
  companyId: string,
  record: { type: RecordSubjectType; id: string },
  options: { filter?: TimelineFilter; limit?: number } = {},
): Promise<TimelineEntry[]> {
  const entries = buildTimeline(await loadTimelineRows(db, companyId, record), options.filter ?? "everything");
  return options.limit ? entries.slice(0, options.limit) : entries;
}
