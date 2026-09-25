"use client";

import Link from "next/link";

import { EmptyState } from "@corelithzw/react";
import { StatusChip } from "@/components/ui/status-chip";
import { jobHref } from "@/components/crm/work-orders/job-types";
import { projectTimeline, type TimelineMarker } from "@/lib/crm/project-timeline";
import { WORK_ORDER_STATUS } from "@/lib/crm/tones";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/crm/work-orders";
import { cn } from "@/lib/utils";

import { todayKey } from "./money";

export type ProjectTimelineJob = {
  id: string;
  workOrderNo: string;
  title: string;
  status: keyof typeof WORK_ORDER_STATUS_LABELS;
  scheduledStart: string | null;
  assignedTo: { id: string; name: string | null } | null;
  completionPercent: number;
};

const MARKER_LABELS: Record<TimelineMarker, string> = {
  start: "Starts",
  today: "Today",
  end: "Due to finish",
};

/** A calendar day as a person reads it: "Mon 6 Oct". */
function formatDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The jobs, in date order, between the project's start and its target end.
 *
 * The dates are dropped in among the jobs rather than drawn as a chart: on a
 * phone a Gantt bar is a sliver, and the question being asked — what is next,
 * and is anything booked after we said we would be done — reads straight off
 * a list. A job outside the window says so in words.
 */
export function ProjectTimelineView({
  startDate,
  targetEndDate,
  jobs,
}: {
  startDate: string | null;
  targetEndDate: string | null;
  jobs: ProjectTimelineJob[];
}) {
  if (jobs.length === 0 && !startDate && !targetEndDate) {
    return (
      <EmptyState
        title="Nothing on the calendar"
        body="Give the project a start and a target end, and raise its jobs — they line up here by date."
      />
    );
  }

  const { entries, unscheduled } = projectTimeline({
    startDate,
    targetEndDate,
    jobs,
    today: todayKey(),
  });

  return (
    <div className="space-y-4">
      <ol className="border-l border-[var(--border)] pl-4">
        {entries.map((entry) =>
          entry.kind === "marker" ? (
            <li
              key={`${entry.marker}-${entry.day}`}
              className="relative py-1.5"
              aria-label={`${MARKER_LABELS[entry.marker]} ${formatDay(entry.day)}`}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -left-[21px] top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-[var(--surface-base)]",
                  entry.marker === "today" ? "bg-[var(--action-primary-bg)]" : "bg-[var(--text-muted)]",
                )}
              />
              <span className="acct-rail-heading text-[var(--text-muted)]">
                {MARKER_LABELS[entry.marker]}
              </span>{" "}
              <span className="font-mono text-sm tabular-nums text-[var(--text-muted)]">
                {formatDay(entry.day)}
              </span>
            </li>
          ) : (
            <li key={entry.job.id} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[19px] top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-[var(--border)]"
              />
              <Link
                href={jobHref(entry.job.id)}
                className="-mx-2 flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 hover:bg-[var(--surface-hover)]"
              >
                <span className="w-24 shrink-0 font-mono text-sm tabular-nums text-[var(--text-muted)]">
                  {formatDay(entry.day)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--text-strong)]">
                    {entry.job.title}
                  </span>
                  <span className="block truncate text-sm text-[var(--text-muted)]">
                    <span className="font-mono">{entry.job.workOrderNo}</span>
                    {entry.job.assignedTo?.name ? ` · ${entry.job.assignedTo.name}` : ""}
                    {entry.outside === "after" ? (
                      <span className="font-medium text-[var(--badge-bad-fg)]"> · after the target end</span>
                    ) : entry.outside === "before" ? (
                      <span className="font-medium text-[var(--badge-warn-fg)]"> · before the start</span>
                    ) : null}
                  </span>
                </span>
                <StatusChip
                  status={WORK_ORDER_STATUS[entry.job.status] ?? "inactive"}
                  label={WORK_ORDER_STATUS_LABELS[entry.job.status]}
                />
              </Link>
            </li>
          ),
        )}
      </ol>

      {unscheduled.length > 0 ? (
        <section aria-labelledby="timeline-unscheduled" className="space-y-1">
          <h3 id="timeline-unscheduled" className="acct-rail-heading text-[var(--text-muted)]">
            Not booked yet · {unscheduled.length}
          </h3>
          <ul>
            {unscheduled.map((job) => (
              <li key={job.id}>
                <Link
                  href={jobHref(job.id)}
                  className="-mx-2 flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 hover:bg-[var(--surface-hover)]"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-strong)]">
                    {job.title}
                  </span>
                  <span className="shrink-0 font-mono text-sm text-[var(--text-muted)]">
                    {job.workOrderNo}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
