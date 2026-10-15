/**
 * The inbox's words and sorting, pure: which module a notification belongs
 * to, whether it needs the reader, what it is about, the one sentence a row
 * shows, and the day groups. The records it points at are read in
 * `lib/inbox/concern.ts`; nothing here touches the database.
 *
 * The schema's `NotificationType` names the event and `entityType`/`entityId`
 * the record, for the kinds it has. Kinds it has no value for yet (an
 * invoice, a receipt, leave, a report, a Vane card) carry the record in the
 * payload instead, as `subject: { kind, id }` and `module`.
 */

export type InboxModule =
  | "books"
  | "crm"
  | "people"
  | "payroll"
  | "operations"
  | "retail"
  | "schools"
  | "reports"
  | "vane"
  | "gold";

/** The kit's icon names (components/core/icons.ts), kept as strings so this file stays free of the UI. */
export const INBOX_MODULES: Record<InboxModule, { label: string; icon: string }> = {
  books: { label: "Books", icon: "books" },
  crm: { label: "CRM", icon: "pipeline" },
  people: { label: "People", icon: "users" },
  payroll: { label: "Payroll", icon: "money" },
  operations: { label: "Operations", icon: "inspections" },
  retail: { label: "Tender", icon: "store" },
  schools: { label: "Schools", icon: "training" },
  reports: { label: "Reports", icon: "reports" },
  vane: { label: "Vane", icon: "foryou" },
  gold: { label: "Gold", icon: "measure" },
};

export function isInboxModule(value: unknown): value is InboxModule {
  return typeof value === "string" && value in INBOX_MODULES;
}

/** What a notification is about, as the resolver reads it. */
export type SubjectKind =
  | "invoice"
  | "receipt"
  | "deal"
  | "lead"
  | "comment"
  | "leave"
  | "report"
  | "vane"
  | "payroll-run"
  | "disbursement"
  | "incident"
  | "hr-incident"
  | "permit"
  | "work-order"
  | "task"
  | "requisition";

export type Subject = { kind: SubjectKind; id: string };

const SUBJECT_KINDS: ReadonlySet<string> = new Set<SubjectKind>([
  "invoice",
  "receipt",
  "deal",
  "lead",
  "comment",
  "leave",
  "report",
  "vane",
  "payroll-run",
  "disbursement",
  "incident",
  "hr-incident",
  "permit",
  "work-order",
  "task",
  "requisition",
]);

export type NotificationLike = {
  type: string;
  severity?: string | null;
  title: string;
  summary: string;
  entityType?: string | null;
  entityId?: string | null;
  payload: Record<string, unknown> | null;
};

/* ---------------------------------------------------------------------- *
 * Module and kind
 * ---------------------------------------------------------------------- */

const PAYROLL_PREFIXES = ["HR_PAYROLL_", "HR_DISBURSEMENT_", "HR_ADJUSTMENT_", "HR_COMP_PROFILE_", "HR_COMP_RULE_"];

/** The module a notification type belongs to, before any payload override. */
export function moduleForType(type: string): InboxModule {
  if (PAYROLL_PREFIXES.some((prefix) => type.startsWith(prefix))) return "payroll";
  if (type.startsWith("HR_GOLD_")) return "gold";
  if (type.startsWith("HR_")) return "people";
  if (type.startsWith("OPS_")) return "operations";
  if (type.startsWith("CRM_")) return "crm";
  if (type.startsWith("SCHOOL_")) return "schools";
  if (type.startsWith("RETAIL_")) return "retail";
  return "crm";
}

export function moduleOf(n: Pick<NotificationLike, "type" | "payload">): InboxModule {
  const fromPayload = n.payload?.module;
  return isInboxModule(fromPayload) ? fromPayload : moduleForType(n.type);
}

/** Every type of a module, for the server's filter. Modules only the payload names have none. */
export function typesForModule(module: InboxModule, allTypes: readonly string[]): string[] {
  return allTypes.filter((type) => moduleForType(type) === module);
}

/**
 * Types that ask the reader for something: a decision, a reply, a count, a
 * date. The bell's "Needs you" holds these until they are read.
 */
export const NEEDS_YOU_TYPES: readonly string[] = [
  "HR_PAYROLL_SUBMITTED",
  "HR_DISBURSEMENT_SUBMITTED",
  "HR_ADJUSTMENT_SUBMITTED",
  "HR_COMP_PROFILE_SUBMITTED",
  "HR_COMP_RULE_SUBMITTED",
  "HR_GOLD_PAYOUT_SUBMITTED",
  "HR_DISCIPLINARY_SUBMITTED",
  "OPS_PERMIT_EXPIRING",
  "OPS_PERMIT_EXPIRED",
  "CRM_LEAD_ASSIGNED",
  "CRM_TASK_ASSIGNED",
  "CRM_TASK_DUE",
  "CRM_FOLLOW_UP_DUE",
  "CRM_MENTIONED",
  "CRM_REQUISITION_SUBMITTED",
  "CRM_REQUISITION_QUESTION",
  "RETAIL_COUNT_ASSIGNED",
  "RETAIL_COUNT_SUBMITTED",
  "RETAIL_PRICE_APPROVAL",
  "RETAIL_PIN_LOCKED",
  "RETAIL_SUPPORT",
  "RETAIL_SHIFT_DIFFERENCE",
  "RETAIL_ORDER_FOLLOW_UP",
  "RETAIL_DELIVERY_TO_CHECK",
];

export const MENTION_TYPES: readonly string[] = ["CRM_MENTIONED"];

export function needsYou(n: Pick<NotificationLike, "type" | "severity" | "payload">): boolean {
  if (n.payload?.needsYou === true) return true;
  if (n.payload?.needsYou === false) return false;
  return NEEDS_YOU_TYPES.includes(n.type) || n.severity === "CRITICAL";
}

export function isMention(n: Pick<NotificationLike, "type" | "payload">): boolean {
  return MENTION_TYPES.includes(n.type) || n.payload?.mention === true;
}

/* ---------------------------------------------------------------------- *
 * Subject
 * ---------------------------------------------------------------------- */

const ENTITY_SUBJECT: Record<string, SubjectKind> = {
  PAYROLL_RUN: "payroll-run",
  DISBURSEMENT_BATCH: "disbursement",
  HR_INCIDENT: "hr-incident",
  INCIDENT: "incident",
  PERMIT: "permit",
  WORK_ORDER: "work-order",
  CRM_COMMENT: "comment",
  CRM_TASK: "task",
  CRM_REQUISITION: "requisition",
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** The record a notification is about, or null when it names none. */
export function subjectOf(n: NotificationLike): Subject | null {
  const fromPayload = n.payload?.subject;
  if (fromPayload && typeof fromPayload === "object") {
    const { kind, id } = fromPayload as { kind?: unknown; id?: unknown };
    if (typeof kind === "string" && SUBJECT_KINDS.has(kind) && typeof id === "string" && id) {
      return { kind: kind as SubjectKind, id };
    }
  }

  if (n.entityType && n.entityId && ENTITY_SUBJECT[n.entityType]) {
    return { kind: ENTITY_SUBJECT[n.entityType]!, id: n.entityId };
  }

  // A CRM notice points at a lead id it may not have; its view path names
  // the record it opens.
  const viewPath = typeof n.payload?.viewPath === "string" ? n.payload.viewPath : "";
  const deal = viewPath.match(new RegExp(`^/crm/deals/(${UUID})`));
  if (deal) return { kind: "deal", id: deal[1]! };
  const lead = viewPath.match(new RegExp(`^/crm/leads/(${UUID})`));
  if (lead) return { kind: "lead", id: lead[1]! };
  if (n.entityType === "CRM_LEAD" && n.entityId) return { kind: "lead", id: n.entityId };
  return null;
}

/* ---------------------------------------------------------------------- *
 * The sentence
 * ---------------------------------------------------------------------- */

export type Segment = { text: string; strong?: boolean };

function trimStop(text: string) {
  return text.trim().replace(/\.$/, "");
}

/**
 * The row's one sentence, with the record's name in medium weight: "Tendai
 * approved **INV-0042**". It is whichever of the title and the summary names
 * the record, preferring the one that starts with who did it; a mention or a
 * comment that names neither gets "on <record>".
 */
export function sentenceFor(input: {
  title: string;
  summary: string;
  actorName: string | null;
  refLabel: string | null;
  type: string;
}): { segments: Segment[]; used: "title" | "summary" } {
  const title = trimStop(input.title);
  const summary = trimStop(input.summary);
  const ref = input.refLabel?.trim() || null;
  const actor = input.actorName?.trim() || null;

  const summaryNamesRef = !!ref && summary.includes(ref);
  const titleNamesRef = !!ref && title.includes(ref);
  const summaryIsAct = !!actor && summary.startsWith(actor) && summary.length <= 120;

  let text = title;
  let used: "title" | "summary" = "title";
  if (summaryNamesRef && (summaryIsAct || !titleNamesRef)) {
    text = summary;
    used = "summary";
  }

  if (ref && !text.includes(ref)) {
    const onRecord = /mentioned you|commented|replied|asked/i.test(text);
    if (onRecord) return { segments: [{ text: `${text} on ` }, { text: ref, strong: true }], used };
    return { segments: [{ text }], used };
  }
  if (!ref) return { segments: [{ text }], used };

  const at = text.indexOf(ref);
  const segments: Segment[] = [];
  if (at > 0) segments.push({ text: text.slice(0, at) });
  segments.push({ text: ref, strong: true });
  if (at + ref.length < text.length) segments.push({ text: text.slice(at + ref.length) });
  return { segments, used };
}

/** "Due 12 Oct → 19 Oct": the payload's changes as the row's second line. */
export type Change = { label: string; from: string | null; to: string | null };

export function changesOf(payload: Record<string, unknown> | null): Change[] {
  const raw = payload?.changes;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { label, from, to } = entry as Record<string, unknown>;
    if (typeof label !== "string") return [];
    return [{ label, from: typeof from === "string" ? from : null, to: typeof to === "string" ? to : null }];
  });
}

export function changeLine(change: Change): string {
  if (change.from && change.to) return `${change.label} ${change.from} → ${change.to}`;
  if (change.to) return `${change.label} ${change.to}`;
  return `${change.label} cleared`;
}

/**
 * The second line, only when it adds something: what changed, or the text
 * the sentence did not use (a comment's first line). Never a repeat of the
 * sentence, and never a stub of three words or fewer.
 */
export function secondLineFor(input: {
  sentence: string;
  title: string;
  summary: string;
  used: "title" | "summary";
  changes: Change[];
}): string | null {
  if (input.changes.length > 0) return input.changes.map(changeLine).join(" · ");
  const other = trimStop(input.used === "title" ? input.summary : input.title);
  if (!other) return null;
  const firstLine = trimStop(other.split(/\r?\n/)[0]!);
  if (firstLine.split(/\s+/).length <= 3) return null;
  if (input.sentence.toLowerCase().includes(firstLine.toLowerCase())) return null;
  return firstLine;
}

/* ---------------------------------------------------------------------- *
 * Who
 * ---------------------------------------------------------------------- */

export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** "Tendai Moyo" → "Tendai": rows name people by their first name. */
export function firstName(name: string | null | undefined): string | null {
  const word = (name ?? "").trim().split(/\s+/)[0];
  return word || null;
}

/* ---------------------------------------------------------------------- *
 * Time
 * ---------------------------------------------------------------------- */

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function startOfDay(date: Date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** The row's time: "now", "4m", "2h", then "Yesterday", "Mon", "12 Oct". */
export function relativeTime(iso: string, now: Date): string {
  const at = new Date(iso);
  const seconds = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const daysAgo = Math.round((startOfDay(now).getTime() - startOfDay(at).getTime()) / DAY);
  if (daysAgo === 0) return `${Math.round(minutes / 60)}h`;
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return WEEKDAYS[at.getDay()]!.slice(0, 3);
  const sameYear = at.getFullYear() === now.getFullYear();
  return `${at.getDate()} ${MONTHS[at.getMonth()]}${sameYear ? "" : ` ${at.getFullYear()}`}`;
}

/** The full stamp for a tooltip and the drawer: "14 Oct 2026, 08:41". */
export function fullTime(iso: string): string {
  const at = new Date(iso);
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}, ${hh}:${mm}`;
}

export type DayGroup<T> = { key: string; label: string; items: T[] };

/** Rows by day, newest first: "Today", "Yesterday", "Monday 12 October". */
export function groupByDay<T extends { createdAt: string }>(items: T[], now: Date): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  const today = startOfDay(now).getTime();
  for (const item of items) {
    const at = new Date(item.createdAt);
    const day = startOfDay(at);
    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const daysAgo = Math.round((today - day.getTime()) / DAY);
      const longMonth = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][day.getMonth()];
      const label =
        daysAgo === 0
          ? "Today"
          : daysAgo === 1
            ? "Yesterday"
            : `${WEEKDAYS[day.getDay()]} ${day.getDate()} ${longMonth}${day.getFullYear() === now.getFullYear() ? "" : ` ${day.getFullYear()}`}`;
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** The bell's two groups: today, and everything before it. */
export function todayAndEarlier<T extends { createdAt: string }>(items: T[], now: Date): DayGroup<T>[] {
  const today = startOfDay(now).getTime();
  const todays = items.filter((item) => new Date(item.createdAt).getTime() >= today);
  const earlier = items.filter((item) => new Date(item.createdAt).getTime() < today);
  return [
    { key: "today", label: "Today", items: todays },
    { key: "earlier", label: "Earlier", items: earlier },
  ].filter((group) => group.items.length > 0);
}
