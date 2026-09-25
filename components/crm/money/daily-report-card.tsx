"use client";

import type { ReactNode } from "react";

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

/**
 * One day's report, as a card.
 *
 * Shared by management's daily reports, where the heading is whose day it
 * was, and a team member's own page, where it is which day.
 */
export function DailyReportCard({
  heading,
  aside,
  summary,
}: {
  heading: ReactNode;
  /** Beside the heading — whether the day was closed, say. */
  aside?: ReactNode;
  summary: DailyReportCardSummary;
}) {
  return (
    <article className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-[var(--text-strong)]">
          {heading}
          {aside ? <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">{aside}</span> : null}
        </h3>
        <p className="text-sm text-[var(--text-muted)]">
          {summary.visits.length} visits · {summary.jobs.length} jobs ·{" "}
          {summary.tasks.completed.length} tasks done
        </p>
      </header>

      {/* The flags first. A manager reading fifteen of these needs the one
          that matters to be the first thing on the card. */}
      {summary.flags.length > 0 ? (
        <ul className="space-y-1">
          {summary.flags.map((flag) => (
            <li key={flag} className="text-sm text-[var(--text-strong)]">
              {flag}
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-sm text-[var(--text-muted)]">Received</dt>
          <dd className="font-mono text-sm text-[var(--text-strong)]">{formatMoney(summary.money.received)}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-muted)]">Spent</dt>
          <dd className="font-mono text-sm text-[var(--text-strong)]">{formatMoney(summary.money.spent)}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-muted)]">Float out</dt>
          <dd className="font-mono text-sm text-[var(--text-strong)]">
            {formatMoney(summary.requisitions.outstanding)}
          </dd>
        </div>
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
