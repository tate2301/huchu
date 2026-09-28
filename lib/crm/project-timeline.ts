/**
 * A project's jobs laid out against its dates.
 *
 * The overview's question is "is this on track", and a list of jobs cannot
 * answer it on its own: the same six jobs read as fine or as a fortnight late
 * depending on when the project was meant to finish. So the jobs are put in
 * date order with the project's start, today and its target end dropped in
 * among them, and any job booked outside the window says so.
 *
 * Pure, and working in calendar days (`YYYY-MM-DD`) rather than instants: a
 * job booked for 08:00 on the target end day is on time, and comparing
 * timestamps would call it late by eight hours.
 */

export type TimelineMarker = "start" | "today" | "end";

export type TimelineEntry<Job> =
  | { kind: "marker"; marker: TimelineMarker; day: string }
  | {
      kind: "job";
      day: string;
      job: Job;
      /** Booked before the project starts, or after it is meant to be done. */
      outside: "before" | "after" | null;
    };

export type ProjectTimeline<Job> = {
  entries: TimelineEntry<Job>[];
  /** Jobs with no date yet. They have not missed anything; they are not booked. */
  unscheduled: Job[];
};

/** The calendar day an ISO instant or date falls on. */
export function dayOf(value: string): string {
  return value.slice(0, 10);
}

/**
 * Where a marker sorts against a job on the same day.
 *
 * The start comes before that day's work and the end after it, so a job on the
 * target end day reads as inside the window. Today sits before the day's jobs:
 * they are still to happen.
 */
const RANK = { start: 0, today: 1, job: 2, end: 3 } as const;

export function projectTimeline<Job extends { scheduledStart: string | null }>({
  startDate,
  targetEndDate,
  jobs,
  today,
}: {
  startDate: string | null;
  targetEndDate: string | null;
  jobs: Job[];
  /** Today as `YYYY-MM-DD` — passed in so the answer does not depend on the clock. */
  today: string;
}): ProjectTimeline<Job> {
  const start = startDate ? dayOf(startDate) : null;
  const end = targetEndDate ? dayOf(targetEndDate) : null;

  const ranked: Array<{ entry: TimelineEntry<Job>; rank: number }> = [];

  if (start) ranked.push({ entry: { kind: "marker", marker: "start", day: start }, rank: RANK.start });
  if (end) ranked.push({ entry: { kind: "marker", marker: "end", day: end }, rank: RANK.end });
  ranked.push({ entry: { kind: "marker", marker: "today", day: today }, rank: RANK.today });

  const unscheduled: Job[] = [];
  for (const job of jobs) {
    if (!job.scheduledStart) {
      unscheduled.push(job);
      continue;
    }
    const day = dayOf(job.scheduledStart);
    const outside = start && day < start ? "before" : end && day > end ? "after" : null;
    ranked.push({ entry: { kind: "job", day, job, outside }, rank: RANK.job });
  }

  // Stable on ties within a rank, so two jobs on one day keep the order the
  // server gave them — which is by start time.
  const entries = ranked
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) =>
      a.entry.day !== b.entry.day
        ? a.entry.day < b.entry.day
          ? -1
          : 1
        : a.rank !== b.rank
          ? a.rank - b.rank
          : a.index - b.index,
    )
    .map((item) => item.entry);

  return { entries, unscheduled };
}
