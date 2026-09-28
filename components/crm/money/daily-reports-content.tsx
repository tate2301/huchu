"use client";

/**
 * The daily reports, as management reads them.
 *
 * One day at a time, led by the flags, because the manager's question is not
 * "what did everybody do" — they have fifteen of these — it is "is there
 * anything here I need to deal with". A report with nothing wrong should take
 * two seconds to pass over, and one with a float outstanding should not.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { SectionHeading } from "@/components/management/ui";
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

/** The reports' measure, which the day's heading and its picker share. */
const WIDTH = 760;

export function DailyReportsContent() {
  const [date, setDate] = useState(todayKey());

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "daily-reports", date],
    queryFn: () => fetchJson<{ data: Report[] }>(`/api/v2/crm/daily-reports?date=${date}`),
  });

  return (
    <section aria-labelledby="daily-reports-day" style={{ maxWidth: WIDTH }}>
      {/* The day is the section, so its picker sits on the section's heading. */}
      <SectionHeading
        count={data?.data.length}
        maxWidth={WIDTH}
        className="mt-0"
        action={
          <Input
            type="date"
            className="h-8 w-auto font-mono"
            value={date}
            max={todayKey()}
            onChange={(event) => {
              if (event.target.value) setDate(event.target.value);
            }}
            aria-label="Day"
          />
        }
      >
        <span id="daily-reports-day">{formatDay(date)}</span>
      </SectionHeading>

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {data && data.data.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No reports for this day.</p>
      ) : null}

      <div>
        {(data?.data ?? []).map((report) => (
          <DailyReportCard
            key={report.id}
            heading={
              <Link href={`/crm/daily-reports/${report.id}`} className="hover:underline">
                {report.user.name ?? "Somebody"}
              </Link>
            }
            summary={report.summary}
          />
        ))}
      </div>
    </section>
  );
}
