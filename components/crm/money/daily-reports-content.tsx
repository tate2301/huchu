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

import { DailyReportCard, type DailyReportCardSummary } from "./daily-report-card";
import { formatDay, todayKey } from "./money";

type Report = {
  id: string;
  reportDate: string;
  sentAt: string | null;
  user: { id: string; name: string | null };
  summary: DailyReportCardSummary;
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
          <DailyReportCard key={report.id} heading={report.user.name ?? "Somebody"} summary={report.summary} />
        ))}
      </Stack>
    </Stack>
  );
}
