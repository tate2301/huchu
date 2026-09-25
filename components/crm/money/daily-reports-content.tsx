"use client";

/**
 * The daily reports, as management reads them.
 *
 * Grouped by day and led by the flags, because the manager's question is not
 * "what did everybody do" — they have fifteen of these — it is "is there
 * anything here I need to deal with". A report with nothing wrong should take
 * two seconds to pass over, and one with a float outstanding should not.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Stack } from "@corelithzw/react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson } from "@/lib/api-client";

import { formatDay, formatMoney, todayKey } from "./money";

type Summary = {
  date: string;
  person: { id: string; name: string | null };
  visits: Array<{ id: string; title: string; clientName: string | null }>;
  jobs: Array<{ id: string; title: string }>;
  tasks: { completed: Array<{ id: string; title: string }>; stillOpen: number; overdue: number };
  money: {
    received: string;
    spent: string;
    balance: string;
    entryCount: number;
    byCategory: Array<{ category: string; spent: string }>;
  };
  requisitions: { outstanding: string };
  notes: string | null;
  flags: string[];
};

type Report = {
  id: string;
  reportDate: string;
  sentAt: string | null;
  user: { id: string; name: string | null };
  summary: Summary;
};

export function DailyReportsContent() {
  const [date, setDate] = useState(todayKey());

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "daily-reports", date],
    queryFn: () => fetchJson<{ data: Report[] }>(`/api/v2/crm/daily-reports?date=${date}`),
  });

  return (
    <Stack gap="md" className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--text-strong)]">{formatDay(date)}</h2>
        <Input
          type="date"
          className="w-auto"
          value={date}
          max={todayKey()}
          onChange={(event) => setDate(event.target.value)}
          aria-label="Which day"
        />
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {data && data.data.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Nobody has closed this day yet. Reports arrive as people submit them.
        </p>
      ) : null}

      <Stack gap="sm">
        {(data?.data ?? []).map((report) => (
          <ReportCard key={report.id} report={report} />
        ))}
      </Stack>
    </Stack>
  );
}

function ReportCard({ report }: { report: Report }) {
  const summary = report.summary;

  return (
    <article className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-[var(--text-strong)]">
          {report.user.name ?? "Somebody"}
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
          <dd className="text-sm text-[var(--text-strong)]">{formatMoney(summary.money.received)}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-muted)]">Spent</dt>
          <dd className="text-sm text-[var(--text-strong)]">{formatMoney(summary.money.spent)}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--text-muted)]">Float out</dt>
          <dd className="text-sm text-[var(--text-strong)]">
            {formatMoney(summary.requisitions.outstanding)}
          </dd>
        </div>
      </dl>

      {summary.visits.length > 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {summary.visits
            .map((visit) => visit.clientName ?? visit.title)
            .join(", ")}
        </p>
      ) : null}

      {summary.notes ? (
        <p className="text-sm text-[var(--text-strong)]">“{summary.notes}”</p>
      ) : null}
    </article>
  );
}
