"use client";

import { ColumnList, ColumnName, StatusDot } from "@/components/management/ui";
import { jobHref } from "@/components/crm/work-orders/job-types";
import { projectTimeline, type TimelineMarker } from "@/lib/crm/project-timeline";
import { JOB_TONE } from "@/lib/crm/tones";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/crm/work-orders";

import { formatDate, todayKey } from "./money";

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

/**
 * The jobs, in date order, between the project's start and its target end.
 *
 * The dates are dropped in among the jobs rather than drawn as a chart: on a
 * phone a Gantt bar is a sliver, and the question being asked — what is next,
 * and is anything booked after we said we would be done — reads straight off
 * a list. The day leads each row, where a register puts its code; a job
 * outside the window says so on the line under its name. Jobs with no date
 * come last.
 */
export function ProjectTimelineView({
  startDate,
  targetEndDate,
  jobs,
  maxWidth,
}: {
  startDate: string | null;
  targetEndDate: string | null;
  jobs: ProjectTimelineJob[];
  maxWidth?: number;
}) {
  const { entries, unscheduled } = projectTimeline({
    startDate,
    targetEndDate,
    jobs,
    today: todayKey(),
  });

  const rows = [
    ...entries.map((entry) =>
      entry.kind === "marker"
        ? {
            id: `${entry.marker}-${entry.day}`,
            cells: {
              job: (
                <ColumnName
                  code={formatDate(entry.day)}
                  name={
                    <span className={entry.marker === "today" ? "text-[var(--brand-strong)]" : "text-[var(--text-muted)]"}>
                      {MARKER_LABELS[entry.marker]}
                    </span>
                  }
                />
              ),
              status: null,
            },
          }
        : {
            id: entry.job.id,
            cells: {
              job: (
                <ColumnName
                  code={formatDate(entry.day)}
                  name={entry.job.title}
                  meta={
                    entry.outside === "after" ? (
                      <StatusDot tone="danger" label="After the target end" />
                    ) : entry.outside === "before" ? (
                      <StatusDot tone="warn" label="Before the start" />
                    ) : (
                      [entry.job.workOrderNo, entry.job.assignedTo?.name].filter(Boolean).join(" · ")
                    )
                  }
                  href={jobHref(entry.job.id)}
                />
              ),
              status: (
                <StatusDot
                  tone={JOB_TONE[entry.job.status] ?? "neutral"}
                  label={WORK_ORDER_STATUS_LABELS[entry.job.status]}
                />
              ),
            },
          },
    ),
    ...unscheduled.map((job) => ({
      id: job.id,
      cells: {
        job: (
          <ColumnName
            code="Not booked"
            name={job.title}
            meta={[job.workOrderNo, job.assignedTo?.name].filter(Boolean).join(" · ")}
            href={jobHref(job.id)}
          />
        ),
        status: (
          <StatusDot tone={JOB_TONE[job.status] ?? "neutral"} label={WORK_ORDER_STATUS_LABELS[job.status]} />
        ),
      },
    })),
  ];

  return (
    <ColumnList
      label="Schedule"
      maxWidth={maxWidth}
      empty="No dates and no jobs yet."
      columns={[
        { id: "job", label: "Job" },
        { id: "status", label: "Status" },
      ]}
      rows={rows}
    />
  );
}
