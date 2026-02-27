"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsResultsData,
  type SchoolsResultsData,
} from "@/lib/schools/schools-v2";

type ResultsView = "moderation" | "all" | "published" | "windows";
type ResultsPublishWindow = SchoolsResultsData["publishWindows"][number];
type ResultsTableRow = SchoolsResultsData["data"][number];

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function sheetStatusBadge(status: SchoolsResultsData["data"][number]["status"]) {
  if (status === "DRAFT") return <Badge variant="outline">Draft</Badge>;
  if (status === "SUBMITTED") return <Badge variant="secondary">Submitted</Badge>;
  if (status === "HOD_APPROVED") return <Badge variant="secondary">HOD Approved</Badge>;
  if (status === "HOD_REJECTED") return <Badge variant="destructive">HOD Rejected</Badge>;
  return <Badge variant="outline">Published</Badge>;
}

export function SchoolsResultsContent() {
  const [activeView, setActiveView] = useState<ResultsView>("moderation");

  const query = useQuery({
    queryKey: ["schools", "results", "dashboard"],
    queryFn: () => fetchSchoolsResultsData({ page: 1, limit: 200 }),
  });

  const allRows = useMemo(() => query.data?.data ?? [], [query.data]);
  const moderationRows = useMemo(
    () =>
      allRows.filter(
        (row) => row.status === "SUBMITTED" || row.status === "HOD_REJECTED",
      ),
    [allRows],
  );
  const publishedRows = useMemo(
    () => allRows.filter((row) => row.status === "PUBLISHED"),
    [allRows],
  );
  const publishWindowRows = useMemo(
    () => query.data?.publishWindows ?? [],
    [query.data],
  );

  const columns = useMemo<ColumnDef<ResultsTableRow>[]>(
    () => [
      {
        id: "updated",
        header: "Updated",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.updatedAt)}</NumericCell>,
      },
      {
        id: "sheet",
        header: "Sheet",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.term.name} / {row.original.class.name}
              {row.original.stream ? ` / ${row.original.stream.name}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => sheetStatusBadge(row.original.status),
      },
      {
        id: "lines",
        header: "Lines",
        cell: ({ row }) => <NumericCell>{row.original.stats.linesCount}</NumericCell>,
      },
      {
        id: "average",
        header: "Average",
        cell: ({ row }) => (
          <NumericCell>
            {typeof row.original.stats.averageScore === "number"
              ? row.original.stats.averageScore.toFixed(2)
              : "-"}
          </NumericCell>
        ),
      },
      {
        id: "published",
        header: "Published",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.publishedAt)}</NumericCell>,
      },
    ],
    [],
  );
  const publishWindowColumns = useMemo<ColumnDef<ResultsPublishWindow>[]>(
    () => [
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          if (row.original.status === "OPEN") return <Badge variant="secondary">Open</Badge>;
          if (row.original.status === "SCHEDULED") return <Badge variant="outline">Scheduled</Badge>;
          return <Badge variant="destructive">Closed</Badge>;
        },
      },
      {
        id: "scope",
        header: "Scope",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.term.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.class?.name ?? "All Classes"}
              {row.original.stream ? ` / ${row.original.stream.name}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "openAt",
        header: "Open",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.openAt)}</NumericCell>,
      },
      {
        id: "closeAt",
        header: "Close",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.closeAt)}</NumericCell>,
      },
      {
        id: "notes",
        header: "Notes",
        cell: ({ row }) => row.original.notes || "-",
      },
    ],
    [],
  );

  const summary = query.data?.summary;

  return (
    <div className="space-y-4">
      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load results data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="section-shell grid gap-2 md:grid-cols-8">
        <div>
          <h2 className="text-sm font-semibold">Draft</h2>
          <p className="font-mono tabular-nums">{summary?.draftSheets ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Submitted</h2>
          <p className="font-mono tabular-nums">{summary?.submittedSheets ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">HOD Rejected</h2>
          <p className="font-mono tabular-nums">{summary?.hodRejectedSheets ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">HOD Approved</h2>
          <p className="font-mono tabular-nums">{summary?.hodApprovedSheets ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Published</h2>
          <p className="font-mono tabular-nums">{summary?.publishedSheets ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Windows Open</h2>
          <p className="font-mono tabular-nums">{summary?.openPublishWindows ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Windows Scheduled</h2>
          <p className="font-mono tabular-nums">
            {summary?.scheduledPublishWindows ?? 0}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Windows Closed</h2>
          <p className="font-mono tabular-nums">{summary?.closedPublishWindows ?? 0}</p>
        </div>
      </section>

      <VerticalDataViews
        items={[
          { id: "moderation", label: "Moderation Queue", count: moderationRows.length },
          { id: "all", label: "All Sheets", count: allRows.length },
          { id: "published", label: "Published", count: publishedRows.length },
          { id: "windows", label: "Publish Windows", count: publishWindowRows.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as ResultsView)}
        railLabel="Results Views"
      >
        <div className={activeView === "moderation" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Moderation Queue</h2>
          <DataTable
            data={moderationRows}
            columns={columns}
            searchPlaceholder="Search moderation queue"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading moderation queue..." : "No moderation items."}
          />
        </div>

        <div className={activeView === "all" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">All Result Sheets</h2>
          <DataTable
            data={allRows}
            columns={columns}
            searchPlaceholder="Search result sheets"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading result sheets..." : "No result sheets available."}
          />
        </div>

        <div className={activeView === "published" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Published Sheets</h2>
          <DataTable
            data={publishedRows}
            columns={columns}
            searchPlaceholder="Search published sheets"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading published sheets..." : "No published sheets yet."}
          />
        </div>

        <div className={activeView === "windows" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Publish Windows</h2>
          <DataTable
            data={publishWindowRows}
            columns={publishWindowColumns}
            searchPlaceholder="Search publish windows"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading publish windows..." : "No publish windows configured."}
          />
        </div>
      </VerticalDataViews>
    </div>
  );
}
