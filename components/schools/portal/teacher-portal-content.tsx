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
  fetchTeacherPortalData,
  type TeacherPortalRecord,
} from "@/lib/schools/portal-v2";

type TeacherPortalView = "queue" | "my-sheets" | "published";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function resultSheetStatusBadge(status: TeacherPortalRecord["status"]) {
  if (status === "DRAFT") return <Badge variant="outline">Draft</Badge>;
  if (status === "SUBMITTED") return <Badge variant="secondary">Submitted</Badge>;
  if (status === "HOD_APPROVED") return <Badge variant="secondary">HOD Approved</Badge>;
  if (status === "HOD_REJECTED") return <Badge variant="destructive">HOD Rejected</Badge>;
  return <Badge variant="outline">Published</Badge>;
}

export function TeacherPortalContent() {
  const [activeView, setActiveView] = useState<TeacherPortalView>("queue");

  const query = useQuery({
    queryKey: ["schools", "portal", "teacher"],
    queryFn: () => fetchTeacherPortalData({ page: 1, limit: 200 }),
  });

  const records = useMemo(() => query.data?.data ?? [], [query.data]);

  const moderationQueueRows = useMemo(
    () =>
      records.filter(
        (record) => record.status === "SUBMITTED" || record.status === "HOD_REJECTED",
      ),
    [records],
  );

  const mySheetsRows = useMemo(
    () => records.filter((record) => record.status !== "PUBLISHED"),
    [records],
  );

  const publishedRows = useMemo(
    () => records.filter((record) => record.status === "PUBLISHED"),
    [records],
  );

  const columns = useMemo<ColumnDef<TeacherPortalRecord>[]>(
    () => [
      {
        id: "updatedAt",
        header: "Updated",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.updatedAt)}</NumericCell>,
      },
      {
        id: "title",
        header: "Result Sheet",
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
        cell: ({ row }) => resultSheetStatusBadge(row.original.status),
      },
      {
        id: "linesCount",
        header: "Lines",
        cell: ({ row }) => <NumericCell>{row.original.stats.linesCount}</NumericCell>,
      },
      {
        id: "averageScore",
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
        id: "publishedAt",
        header: "Published",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.publishedAt)}</NumericCell>,
      },
    ],
    [],
  );

  const summary = query.data?.summary;

  return (
    <div className="space-y-4">
      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load teacher portal</AlertTitle>
          <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="section-shell grid gap-2 md:grid-cols-5">
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
      </section>

      <VerticalDataViews
        items={[
          { id: "queue", label: "Moderation Queue", count: moderationQueueRows.length },
          { id: "my-sheets", label: "My Sheets", count: mySheetsRows.length },
          { id: "published", label: "Published", count: publishedRows.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as TeacherPortalView)}
        railLabel="Teacher Views"
      >
        <div className={activeView === "queue" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Moderation Queue</h2>
          <DataTable
            data={moderationQueueRows}
            columns={columns}
            searchPlaceholder="Search moderation queue"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading queue..." : "No sheets in moderation queue."}
          />
        </div>

        <div className={activeView === "my-sheets" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">My Result Sheets</h2>
          <DataTable
            data={mySheetsRows}
            columns={columns}
            searchPlaceholder="Search result sheets"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading sheets..." : "No result sheets available."}
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
      </VerticalDataViews>
    </div>
  );
}
