"use client";

import { Badge } from "@corelithzw/react";

import type { PublishWindowStatus, ResultSheetStatus } from "@/lib/schools/results-v2";

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

/** For a `FilterSelect`, in the order a sheet travels. */
export const SHEET_STATE_OPTIONS = (
  ["DRAFT", "SUBMITTED", "HOD_APPROVED", "HOD_REJECTED", "PUBLISHED"] as ResultSheetStatus[]
).map((value) => ({ value, label: SHEET_STATE_LABELS[value] }));

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

export function WindowStateBadge({ status }: { status: PublishWindowStatus }) {
  return (
    <Badge tone={status === "OPEN" ? "success" : status === "SCHEDULED" ? "info" : "neutral"}>
      {WINDOW_STATE_LABELS[status]}
    </Badge>
  );
}

/* ── the small formatters these screens share ────────────────────────── */

/** "22 Aug" — the date form the design uses in a table cell. */
export function formatDay(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "22 Aug 08:00" — a publish window opens and closes at a time of day. */
export function formatDayTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * How long a sheet has been waiting, in the words a head of department would
 * use. A work queue's most important column is age — "submitted 21 Aug" makes
 * you do the arithmetic, "9 days" does not.
 */
export function waitingFor(since?: string | null) {
  if (!since) return "—";
  const from = new Date(since).getTime();
  if (Number.isNaN(from)) return "—";
  const days = Math.floor((Date.now() - from) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/** Milliseconds waited, for sorting the queue oldest-first. */
export function waitingMs(since?: string | null) {
  if (!since) return 0;
  const from = new Date(since).getTime();
  return Number.isNaN(from) ? 0 : Date.now() - from;
}
