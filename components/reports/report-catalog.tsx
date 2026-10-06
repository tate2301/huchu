"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { EmptyState, Skeleton } from "@corelithzw/react";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChevronRight, Plus } from "@/lib/icons";
import type { CatalogArea } from "@/lib/reports/catalog";
import type { CustomReport, CustomReportSummary } from "@/lib/reports/custom/document";

function Line({ href, title, note }: { href: string; title: string; note?: string }) {
  return (
    <li className="border-b border-[var(--table-divider)]">
      <Link
        href={href}
        className="group flex min-h-[42px] items-center gap-3 px-1 text-[13px] leading-[1.4] font-medium text-[var(--text)] hover:bg-[var(--canvas)]"
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {note ? <span className="shrink-0 text-[12px] font-normal text-[var(--text-muted)]">{note}</span> : null}
        <ChevronRight
          className="size-3.5 shrink-0 text-[var(--text-disabled)] group-hover:text-[var(--text-subtle)]"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

/**
 * Every report this person can open, by area, in the order their industry
 * reads them, and the reports built in the workspace above them. Each is one
 * line; opening one is where the work happens.
 */
export function ReportCatalog() {
  const { toast } = useToast();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    queryKey: ["reports", "catalog"],
    queryFn: () => fetchJson<{ areas: CatalogArea[]; custom: CustomReportSummary[] }>("/api/v2/reports"),
  });

  const create = async () => {
    setCreating(true);
    try {
      const made = await fetchJson<{ report: CustomReport }>("/api/v2/reports/custom", {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.push(`/reports/custom/${made.report.id}/edit`);
    } catch (error) {
      toast({ title: "Report not created", description: getApiErrorMessage(error), variant: "destructive" });
      setCreating(false);
    }
  };

  const chrome = (
    <PageChrome title="Reports">
      <Button size="sm" onClick={() => void create()} disabled={creating}>
        <Plus className="size-4" aria-hidden="true" />
        New report
      </Button>
    </PageChrome>
  );

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
  const custom = query.data?.custom ?? [];
  if (areas.length === 0 && custom.length === 0) {
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
        {custom.length > 0 ? (
          <section aria-labelledby="area-built">
            <h2
              id="area-built"
              className="mb-2.5 flex items-baseline gap-2 text-[15px] leading-[1.35] font-semibold text-[var(--text-strong)]"
            >
              Built here
              <span className="font-mono text-[11px] font-medium tabular-nums text-[var(--text-muted)]">{custom.length}</span>
            </h2>
            <ul className="border-t border-[var(--table-divider)]">
              {custom.map((report) => (
                <Line
                  key={report.id}
                  href={`/reports/custom/${report.id}`}
                  title={report.title}
                  note={report.mine ? (report.shared ? "Yours, shared" : "Yours, private") : "Shared with you"}
                />
              ))}
            </ul>
          </section>
        ) : null}
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
                <Line key={report.key} href={`/reports/${report.key}`} title={report.title} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
