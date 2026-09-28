"use client";

import { Badge } from "@/components/schools/common/status-badge";

import type { PublishWindowStatus, ResultSheetStatus } from "@/lib/schools/results-v2";
import { formatSchoolDayShort, formatSchoolDayTime } from "@/lib/schools/format";

/**
 * One enum, one vocabulary.
 *
 * `SchoolResultSheetStatus` had grown two sets of words for the same five
 * states: the class page said "Approved / Sent back" and the moderation queue
 * said "HOD Approved / HOD Rejected", for the same sheet in the same state on
 * two screens a head of department moves between in one sitting. "Approved" and
 * "Sent back" win — they say what happened to the sheet rather than who did it,
 * and "rejected" is the wrong word for a sheet that is coming back with a note
 * and will be resubmitted this afternoon.
 *
 * Every badge, filter option and empty-state sentence in the results area reads
 * its words from here, so the pair cannot drift again.
 */

export const SHEET_STATE_LABELS: Record<ResultSheetStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  HOD_APPROVED: "Approved",
  HOD_REJECTED: "Sent back",
  PUBLISHED: "Published",
};

/**
 * The order a sheet travels, and the only order these five are ever listed in.
 *
 * Sent back sits after submitted rather than after approved, because that is
 * where it happens: a sheet comes back from the head of department, is fixed
 * and goes in again. Every state filter and every state rail in the results
 * area reads this array, so the queue, the overview and the publishing screen
 * cannot put the same five states in three orders.
 */
export const SHEET_STATE_ORDER: ResultSheetStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "HOD_REJECTED",
  "HOD_APPROVED",
  "PUBLISHED",
];

/** For a `FilterSelect`. */
export const SHEET_STATE_OPTIONS = SHEET_STATE_ORDER.map((value) => ({
  value,
  label: SHEET_STATE_LABELS[value],
}));

const SHEET_STATE_TONE = {
  DRAFT: "outline",
  SUBMITTED: "info",
  HOD_APPROVED: "success",
  HOD_REJECTED: "danger",
  PUBLISHED: "brand",
} as const;

export function SheetStateBadge({ status }: { status: ResultSheetStatus }) {
  return <Badge tone={SHEET_STATE_TONE[status]}>{SHEET_STATE_LABELS[status]}</Badge>;
}

/**
 * The publishing half of the same state, which the overview shows in its own
 * column: a sheet is Held until a head of department has signed it off, Ready
 * once they have, and Published once the office has released it.
 */
export function publishStateLabel(status: ResultSheetStatus) {
  if (status === "PUBLISHED") return "Published";
  if (status === "HOD_APPROVED") return "Ready";
  return "Held";
}

export function PublishStateBadge({ status }: { status: ResultSheetStatus }) {
  const label = publishStateLabel(status);
  return (
    <Badge tone={label === "Published" ? "brand" : label === "Ready" ? "success" : "neutral"}>
      {label}
    </Badge>
  );
}

export const WINDOW_STATE_LABELS: Record<PublishWindowStatus, string> = {
  SCHEDULED: "Scheduled",
  OPEN: "Open",
  CLOSED: "Closed",
};

export const WINDOW_STATE_OPTIONS = (
  ["OPEN", "SCHEDULED", "CLOSED"] as PublishWindowStatus[]
).map((value) => ({ value, label: WINDOW_STATE_LABELS[value] }));

/**
 * What a publish window covers, as one phrase.
 *
 * Two screens draw the same window as a row — the publishing register and the
 * grading settings — and they had drifted to "Form 2 Alpha" on one and
 * "Form 2 · Alpha" on the other. The space form wins because it is how a
 * school says it out loud, and because it is what `sheetClassName` already
 * puts under every mark sheet.
 *
 * A window with no class covers the school, and says so in words rather than
 * leaving the cell blank: a window nobody has narrowed is the one that
 * releases everybody's marks at once.
 */
export function windowScope(window: {
  class: { name: string } | null;
  stream: { name: string } | null;
}) {
  return window.class
    ? [window.class.name, window.stream?.name].filter(Boolean).join(" ")
    : "The whole school";
}

export function WindowStateBadge({ status }: { status: PublishWindowStatus }) {
  return (
    <Badge tone={status === "OPEN" ? "success" : status === "SCHEDULED" ? "info" : "neutral"}>
      {WINDOW_STATE_LABELS[status]}
    </Badge>
  );
}

/* ── the small formatters these screens share ────────────────────────── */

/*
 * The date forms come from lib/schools/format.ts, which pins the zone as well
 * as the locale. Read off the runtime instead, a sheet submitted at 23:30 UTC
 * is the 21st on the server and the 22nd in a browser two hours east, and the
 * first client paint disagrees with the bytes it is hydrating.
 */

/** "22 Aug" — the date form the design uses in a table cell. */
export const formatDay = formatSchoolDayShort;

/** "22 Aug 08:00" — a publish window opens and closes at a time of day. */
export const formatDayTime = formatSchoolDayTime;

/**
 * How long a sheet has been waiting, in the words a head of department would
 * use. A work queue's most important column is age — "submitted 21 Aug" makes
 * you do the arithmetic, "9 days" does not.
 *
 * `now` is a parameter rather than a call inside, for two reasons. A queue of
 * forty sheets read its own clock forty times, so one rendered across a
 * midnight boundary aged half its rows a day further than the other half from
 * the same data. And a clock read during the render of a server-rendered
 * component is a different clock on the server than in the browser, which
 * tears hydration. The caller hoists one `now` per render and threads it in.
 */
export function waitingFor(since: string | null | undefined, now: number) {
  if (!since) return "—";
  const from = new Date(since).getTime();
  if (Number.isNaN(from)) return "—";
  const days = Math.floor((now - from) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/** Milliseconds waited, for sorting the queue oldest-first. */
export function waitingMs(since: string | null | undefined, now: number) {
  if (!since) return 0;
  const from = new Date(since).getTime();
  return Number.isNaN(from) ? 0 : now - from;
}
