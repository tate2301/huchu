"use client";

import type { ReactNode } from "react";

import { StatusDot } from "@/components/management/ui";

import { formatMoney } from "./money";

/** The parts of a stored daily report the card reads. */
export type DailyReportCardSummary = {
  visits: Array<{ id: string; title: string; clientName: string | null }>;
  jobs: Array<{ id: string; title: string }>;
  tasks: { completed: Array<{ id: string; title: string }>; stillOpen: number; overdue: number };
  money: { received: string; spent: string };
  requisitions: { outstanding: string };
  notes: string | null;
  flags: string[];
};

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * One day's report.
 *
 * Shared by management's daily reports, where the heading is whose day it
 * was, and a team member's own page, where it is which day. A row between
 * hairlines rather than a bordered card: a manager reads fifteen of these,
 * and fifteen boxes are fifteen frames to read past before the first figure.
 *
 * The flags come first, as amber dots — the one thing on a report that
 * wants somebody. Then the day's three figures, named once each; then where
 * they went and what they said.
 */
export function DailyReportCard({
  heading,
  aside,
  summary,
}: {
  heading: ReactNode;
  /** Beside the heading — whether the day was closed, as a dot and a word. */
  aside?: ReactNode;
  summary: DailyReportCardSummary;
}) {
  return (
    <article className="space-y-2.5 border-b border-[var(--border-subtle)] py-4 first:pt-1 last:border-b-0">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex items-baseline gap-3 text-sm font-semibold text-[var(--text-strong)]">
          {heading}
          {aside}
        </h3>
        <p className="text-sm text-[var(--text-muted)]">
          {[
            plural(summary.visits.length, "visit", "visits"),
            plural(summary.jobs.length, "job", "jobs"),
            plural(summary.tasks.completed.length, "task done", "tasks done"),
          ].join(" · ")}
        </p>
      </header>

      {summary.flags.length > 0 ? (
        <ul className="space-y-1">
          {summary.flags.map((flag) => (
            <li key={flag}>
              <StatusDot tone="warn" label={flag} />
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="grid grid-cols-3 gap-4">
        {[
          { label: "Received", value: summary.money.received },
          { label: "Spent", value: summary.money.spent },
          { label: "Float out", value: summary.requisitions.outstanding },
        ].map((figure) => (
          <div key={figure.label} className="min-w-0">
            <dt className="text-sm text-[var(--text-muted)]">{figure.label}</dt>
            <dd className="mt-0.5 font-mono text-sm tabular-nums text-[var(--text-strong)]">{formatMoney(figure.value)}</dd>
          </div>
        ))}
      </dl>

      {summary.visits.length > 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {summary.visits.map((visit) => visit.clientName ?? visit.title).join(", ")}
        </p>
      ) : null}

      {summary.notes ? <p className="text-sm text-[var(--text-strong)]">“{summary.notes}”</p> : null}
    </article>
  );
}
