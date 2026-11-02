"use client";

/**
 * The daily reports, as management reads them.
 *
 * One day at a time, led by the flags, because the manager's question is not
 * "what did everybody do" — they have fifteen of these — it is "is there
 * anything here I need to deal with". A report with nothing wrong should take
 * two seconds to pass over, and one with a float outstanding should not.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

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
  const [filterTab, setFilterTab] = useState<"ALL" | "FLAGGED">("ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "daily-reports", date],
    queryFn: () => fetchJson<{ data: Report[] }>(`/api/v2/crm/daily-reports?date=${date}`),
  });

  const reports = useMemo(() => data?.data ?? [], [data]);
  const flaggedCount = useMemo(
    () => reports.filter((r) => r.summary.flags.length > 0).length,
    [reports],
  );
  const visibleReports = useMemo(
    () => (filterTab === "FLAGGED" ? reports.filter((r) => r.summary.flags.length > 0) : reports),
    [filterTab, reports],
  );

  return (
    <div className="crm-bk-worksheet">
      {!isLoading && flaggedCount > 0 ? (
        <div className="crm-bk-finding warn">
          <span className="crm-bk-fdot" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <b>
              {flaggedCount} {flaggedCount === 1 ? "report has" : "reports have"} items to look at
            </b>{" "}
            for {formatDay(date)} (missing receipts, unacquitted floats, or overdue tasks).
          </div>
          <button
            type="button"
            className="crm-bk-fact"
            onClick={() => setFilterTab((prev) => (prev === "FLAGGED" ? "ALL" : "FLAGGED"))}
          >
            {filterTab === "FLAGGED" ? "Show all reports" : "Show flagged only →"}
          </button>
        </div>
      ) : null}

      <div className="crm-bk-tabs-bar">
        <div className="crm-bk-tabs" role="tablist" aria-label="Report filter">
          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "ALL"}
            onClick={() => setFilterTab("ALL")}
            className={`crm-bk-tab${filterTab === "ALL" ? " on" : ""}`}
          >
            All reports
            <span className="tc">{reports.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "FLAGGED"}
            onClick={() => setFilterTab("FLAGGED")}
            className={`crm-bk-tab${filterTab === "FLAGGED" ? " on" : ""}`}
          >
            Needs review
            <span className="tc">{flaggedCount}</span>
          </button>
        </div>
      </div>

      <div className="crm-bk-tools">
        <span className="text-[13px] font-medium text-[var(--text-strong)]">
          {formatDay(date)}
        </span>
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
        <div className="crm-bk-tools-right">
          <span className="crm-bk-rcount">
            {visibleReports.length} of {reports.length}
          </span>
        </div>
      </div>

      <div className="px-6 py-4">
        {isLoading ? <Skeleton className="h-40 w-full" /> : null}

        {!isLoading && visibleReports.length === 0 ? (
          <p className="py-6 text-sm text-[var(--text-muted)]">
            {filterTab === "FLAGGED"
              ? "No flagged reports for this day."
              : "No reports submitted for this day."}
          </p>
        ) : null}

        <div className="max-w-4xl">
          {visibleReports.map((report) => (
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
      </div>
    </div>
  );
}
