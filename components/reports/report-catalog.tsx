"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { EmptyState, Skeleton } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChevronRight } from "@/lib/icons";
import type { CatalogArea } from "@/lib/reports/catalog";

/**
 * Every report this person can open, by area, in the order their industry
 * reads them. Each is one line; opening one is where the work happens.
 */
export function ReportCatalog() {
  const query = useQuery({
    queryKey: ["reports", "catalog"],
    queryFn: () => fetchJson<{ areas: CatalogArea[] }>("/api/v2/reports"),
  });

  const chrome = <PageChrome title="Reports" />;

  if (query.isLoading) {
    return (
      <>
        {chrome}
        <div className="mx-auto grid w-full max-w-[600px] gap-1.5" aria-busy="true" aria-live="polite">
          <Skeleton height={22} width={180} />
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height={38} />
          ))}
        </div>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        {chrome}
        <EmptyState
          title="Reports did not load"
          body={getApiErrorMessage(query.error)}
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        />
      </>
    );
  }

  const areas = query.data?.areas ?? [];
  if (areas.length === 0) {
    return (
      <>
        {chrome}
        <EmptyState title="No reports yet" body="Reports appear here for the modules this workspace runs." />
      </>
    );
  }

  return (
    <>
      {chrome}
      <div className="mx-auto grid w-full max-w-[600px] gap-9">
        {areas.map((area) => (
          <section key={area.area} aria-labelledby={`area-${area.area}`}>
            <h2
              id={`area-${area.area}`}
              className="mb-2.5 flex items-baseline gap-2 text-[15px] leading-[1.35] font-semibold text-[var(--text-strong)]"
            >
              {area.area}
              <span className="font-mono text-[11px] font-medium tabular-nums text-[var(--text-muted)]">
                {area.reports.length}
              </span>
            </h2>
            <ul className="border-t border-[var(--table-divider)]">
              {area.reports.map((report) => (
                <li key={report.key} className="border-b border-[var(--table-divider)]">
                  <Link
                    href={`/reports/${report.key}`}
                    className="group flex min-h-[42px] items-center gap-3 px-1 text-[13px] leading-[1.4] font-medium text-[var(--text)] hover:bg-[var(--canvas)]"
                  >
                    <span className="min-w-0 flex-1 truncate">{report.title}</span>
                    <ChevronRight
                      className="size-3.5 shrink-0 text-[var(--text-disabled)] group-hover:text-[var(--text-subtle)]"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
