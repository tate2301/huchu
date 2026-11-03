"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@corelithzw/react";
import { ColumnList, ColumnName, StatusDot } from "@/components/management/ui";
import { jobHref } from "@/components/crm/work-orders/job-types";
import { projectTimeline, type TimelineMarker } from "@/lib/crm/project-timeline";
import { JOB_TONE } from "@/lib/crm/tones";
import { WORK_ORDER_STATUS_LABELS } from "@/lib/crm/work-orders";
import { Calendar, LayoutList, BarChart3 } from "@/lib/icons";

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

export type ScheduleViewMode = "table" | "gantt" | "calendar";

/**
 * Multi-view Project Schedule:
 * Supports Table (timeline sequence), Gantt (horizontal bar chart), and Calendar (agenda grid).
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
  const [view, setView] = useState<ScheduleViewMode>("table");

  const today = todayKey();
  const { entries, unscheduled } = projectTimeline({
    startDate,
    targetEndDate,
    jobs,
    today,
  });

  // Table rows
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
                    <span
                      className={
                        entry.marker === "today"
                          ? "font-semibold text-[var(--brand-strong)]"
                          : "text-[var(--color-ink-3)]"
                      }
                    >
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
          <StatusDot
            tone={JOB_TONE[job.status] ?? "neutral"}
            label={WORK_ORDER_STATUS_LABELS[job.status]}
          />
        ),
      },
    })),
  ];

  // Scheduled jobs for Gantt & Calendar views
  const scheduledJobs = jobs.filter((j) => Boolean(j.scheduledStart));

  // Compute Gantt date range
  const todayTimestamp = new Date(today).getTime();
  const startTimestamp = startDate
    ? new Date(startDate).getTime()
    : scheduledJobs[0]?.scheduledStart
    ? new Date(scheduledJobs[0].scheduledStart).getTime()
    : todayTimestamp - 7 * 86400000;
  const endTimestamp = targetEndDate
    ? new Date(targetEndDate).getTime()
    : scheduledJobs[scheduledJobs.length - 1]?.scheduledStart
    ? new Date(scheduledJobs[scheduledJobs.length - 1].scheduledStart).getTime() + 14 * 86400000
    : startTimestamp + 30 * 86400000;
  const totalDuration = Math.max(86400000 * 5, endTimestamp - startTimestamp);

  return (
    <div className="space-y-4">
      {/* Schedule View Switcher Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] pb-3">
        <div className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-ground)] p-0.5">
          <Button
            size="sm"
            variant={view === "table" ? "primary" : "ghost"}
            className="h-7 text-sm font-medium"
            onClick={() => setView("table")}
          >
            <LayoutList className="mr-1.5 size-3.5" />
            Table
          </Button>
          <Button
            size="sm"
            variant={view === "gantt" ? "primary" : "ghost"}
            className="h-7 text-sm font-medium"
            onClick={() => setView("gantt")}
          >
            <BarChart3 className="mr-1.5 size-3.5" />
            Gantt Chart
          </Button>
          <Button
            size="sm"
            variant={view === "calendar" ? "primary" : "ghost"}
            className="h-7 text-sm font-medium"
            onClick={() => setView("calendar")}
          >
            <Calendar className="mr-1.5 size-3.5" />
            Calendar
          </Button>
        </div>

        <div className="font-mono text-sm text-[var(--color-ink-3)]">
          {jobs.length} jobs · {scheduledJobs.length} scheduled
        </div>
      </div>

      {/* View: Table */}
      {view === "table" ? (
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
      ) : null}

      {/* View: Gantt Chart */}
      {view === "gantt" ? (
        <div className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-sm">
          {/* Timeline bounds header */}
          <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-2.5 font-mono text-sm text-[var(--color-ink-3)]">
            <span>Start: {startDate ? formatDate(startDate) : "Open"}</span>
            <span className="font-semibold text-[var(--brand-strong)]">Today</span>
            <span>Target End: {targetEndDate ? formatDate(targetEndDate) : "Open"}</span>
          </div>

          {/* Job Bars */}
          <div className="mt-4 space-y-3">
            {jobs.map((job) => {
              const jobStart = job.scheduledStart ? new Date(job.scheduledStart).getTime() : null;
              const offsetPercent = jobStart
                ? Math.min(90, Math.max(0, ((jobStart - startTimestamp) / totalDuration) * 100))
                : 0;
              const barWidthPercent = 20;

              return (
                <div key={job.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <Link
                      href={jobHref(job.id)}
                      className="font-medium text-[var(--color-ink)] hover:underline"
                    >
                      {job.workOrderNo} · {job.title}
                    </Link>
                    <span className="font-mono text-sm text-[var(--color-ink-3)]">
                      {job.completionPercent}%
                    </span>
                  </div>

                  {jobStart ? (
                    <div className="relative h-6 w-full rounded bg-[var(--color-ground)]">
                      <div
                        className="absolute top-0 h-full rounded bg-[var(--brand)] text-white transition-all"
                        style={{
                          left: `${offsetPercent}%`,
                          width: `${barWidthPercent}%`,
                        }}
                      >
                        <div
                          className="h-full rounded-l bg-[var(--brand-strong)] opacity-80"
                          style={{ width: `${job.completionPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="h-6 w-full rounded border border-dashed border-[var(--color-line)] bg-[var(--color-ground)] px-3 text-sm text-[var(--color-ink-3)] flex items-center">
                      Not booked to schedule
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* View: Calendar Agenda */}
      {view === "calendar" ? (
        <div className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="border-b border-[var(--color-line)] pb-2 text-sm font-semibold text-[var(--color-ink)]">
            Schedule Agenda
          </div>
          <div className="mt-3 divide-y divide-[var(--color-line)]">
            {scheduledJobs.length > 0 ? (
              scheduledJobs.map((job) => (
                <div key={job.id} className="flex items-start justify-between py-2.5">
                  <div>
                    <Link
                      href={jobHref(job.id)}
                      className="text-sm font-medium text-[var(--color-ink)] hover:underline"
                    >
                      {job.title}
                    </Link>
                    <p className="mt-0.5 text-sm text-[var(--color-ink-3)]">
                      {job.workOrderNo} · {job.assignedTo?.name ?? "Unassigned"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm font-medium tabular-nums text-[var(--color-ink-2)]">
                      {job.scheduledStart ? formatDate(job.scheduledStart) : "—"}
                    </span>
                    <div className="mt-1">
                      <StatusDot
                        tone={JOB_TONE[job.status] ?? "neutral"}
                        label={WORK_ORDER_STATUS_LABELS[job.status]}
                      />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-[var(--color-ink-3)]">
                No jobs with confirmed schedule dates.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
