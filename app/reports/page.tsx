"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button, Empty, Kit, KitScreen } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchReportsHome, REPORTS_HOME_KEY } from "@/components/layout/workspace-rail/reports-groups";
import { ReportsAllView } from "@/components/reports/reports-all-view";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  filterEntries,
  makers,
  readReportsFilter,
  reportCounts,
  reportEntries,
  reportsCsv,
  reportsFinding,
  type ReportEntry,
  type ReportsFilter,
} from "@/lib/reports/all";
import type { CustomReport } from "@/lib/reports/custom/document";

/** All reports inside the app's shell, with the reports screen's own rules (`.sc-reports`). */
function ReportsFrame({ children }: { children: React.ReactNode }) {
  return (
    <Kit className="kit-main">
      <KitScreen slug="reports">
        <div className="mn" style={{ flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </KitScreen>
    </Kit>
  );
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ padding: "var(--space-24)", display: "flex", flexDirection: "column", gap: "var(--space-12)" }}>
      <div className="skeleton" style={{ height: 32, width: "60%" }} />
      <div className="skeleton" style={{ height: 20, width: "40%" }} />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="skeleton" style={{ height: 40, marginTop: index === 0 ? "var(--space-24)" : 0 }} />
      ))}
    </div>
  );
}

/** Reports → All reports (ReportsAll). Which reports, the search and the filters live in the address. */
function ReportsAll() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const filter = React.useMemo(() => readReportsFilter(params), [params]);

  const home = useQuery({ queryKey: REPORTS_HOME_KEY, queryFn: fetchReportsHome });

  const onFilter = React.useCallback(
    (next: Partial<ReportsFilter>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        const empty = value === null || value === "" || (key === "view" && value === "all") || (key === "sort" && value === "newest");
        if (empty) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const [building, setBuilding] = React.useState(false);
  const [copying, setCopying] = React.useState<string | null>(null);

  /** A new report in the builder, starting on the workspace's first report; filed in the folder being looked at. */
  const build = React.useCallback(async () => {
    setBuilding(true);
    try {
      const made = await fetchJson<{ report: CustomReport }>("/api/v2/reports/custom", { method: "POST", body: JSON.stringify({}) });
      if (filter.folder) {
        await fetchJson(`/api/v2/reports/custom/${made.report.id}`, { method: "PATCH", body: JSON.stringify({ folderId: filter.folder }) });
      }
      await queryClient.invalidateQueries({ queryKey: REPORTS_HOME_KEY });
      router.push(`/reports/c/${made.report.id}/edit`);
    } catch (error) {
      toast({ title: "Report not created", description: getApiErrorMessage(error), variant: "destructive" });
      setBuilding(false);
    }
  }, [filter.folder, queryClient, router, toast]);

  /** Make it yours: Corelith's report copied into the builder as this person's own. */
  const copy = async (entry: ReportEntry) => {
    if (!entry.copy) return;
    setCopying(entry.id);
    try {
      const made = await fetchJson<{ report: CustomReport }>("/api/v2/reports/custom", { method: "POST", body: JSON.stringify(entry.copy) });
      await queryClient.invalidateQueries({ queryKey: REPORTS_HOME_KEY });
      router.push(`/reports/c/${made.report.id}/edit`);
    } catch (error) {
      toast({ title: "Not copied", description: getApiErrorMessage(error), variant: "destructive" });
      setCopying(null);
    }
  };

  const move = async (entry: ReportEntry, folderId: string | null) => {
    try {
      await fetchJson(`/api/v2/reports/custom/${entry.id}`, { method: "PATCH", body: JSON.stringify({ folderId }) });
      await queryClient.invalidateQueries({ queryKey: REPORTS_HOME_KEY });
      const folder = home.data?.folders.find((candidate) => candidate.id === folderId);
      toast({ title: folder ? `${entry.title} is in ${folder.name}` : `${entry.title} is in no folder` });
    } catch (error) {
      toast({ title: "Not moved", description: getApiErrorMessage(error), variant: "destructive" });
    }
  };

  const all = React.useMemo(() => (home.data ? reportEntries(home.data) : []), [home.data]);
  const shown = React.useMemo(() => filterEntries(all, filter), [all, filter]);

  const exportList = () => {
    const blob = new Blob([reportsCsv(shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reports.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const primary = React.useMemo(
    () => ({ label: "New report", icon: "plus" as const, onClick: () => void build(), disabled: building ? "Making the report" : undefined }),
    [build, building],
  );

  const folder = home.data?.folders.find((candidate) => candidate.id === filter.folder) ?? null;
  const areas = [...new Set(all.map((entry) => entry.area).filter((area): area is string => Boolean(area)))];

  return (
    <>
      <PageChrome title={folder?.name ?? "All reports"} primary={primary} />
      <ReportsFrame>
        {home.data ? (
          filter.folder && !folder ? (
            <Empty
              icon="folder"
              title="That folder is not here"
              action={
                <Button icon="back" onClick={() => onFilter({ folder: null })}>
                  All reports
                </Button>
              }
            >
              It may have been deleted. Its reports are in no folder now.
            </Empty>
          ) : (
            <ReportsAllView
              entries={shown}
              finding={reportsFinding(reportCounts(all))}
              filter={filter}
              folder={folder}
              folders={home.data.folders}
              areas={areas}
              makers={makers(all)}
              onFilter={onFilter}
              onMove={(entry, folderId) => void move(entry, folderId)}
              onCopy={(entry) => void copy(entry)}
              onExport={exportList}
              copying={copying}
            />
          )
        ) : home.isError ? (
          <Empty
            icon="warn"
            title={typeof navigator !== "undefined" && !navigator.onLine ? "You are offline" : "Reports did not load"}
            action={
              <Button icon="history" onClick={() => void home.refetch()}>
                Try again
              </Button>
            }
          >
            {getApiErrorMessage(home.error, "Check the connection and try again.")}
          </Empty>
        ) : (
          <Loading />
        )}
      </ReportsFrame>
    </>
  );
}

export default function ReportsPage() {
  // Which reports are shown is read from the address, which is only known in the browser.
  return (
    <React.Suspense
      fallback={
        <ReportsFrame>
          <Loading />
        </ReportsFrame>
      }
    >
      <ReportsAll />
    </React.Suspense>
  );
}
