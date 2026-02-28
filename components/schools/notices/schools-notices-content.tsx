"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type NoticeRow = {
  id: string;
  type: string;
  title: string;
  summary: string;
  severity: string;
  createdAt: string;
  expiresAt: string | null;
  isRead: boolean;
  target: string;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function severityBadge(severity: string) {
  if (severity === "CRITICAL") return <Badge variant="destructive">Critical</Badge>;
  if (severity === "WARNING") return <Badge variant="secondary">Warning</Badge>;
  return <Badge variant="outline">Info</Badge>;
}

export function SchoolsNoticesContent() {
  const query = useQuery({
    queryKey: ["schools", "notices"],
    queryFn: () => fetchJson<{ data: NoticeRow[] }>("/api/v2/schools/notices"),
  });

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);

  const columns = useMemo<ColumnDef<NoticeRow>[]>(
    () => [
      {
        id: "createdAt",
        header: "Date",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.createdAt)}</NumericCell>,
      },
      {
        id: "title",
        header: "Notice",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">{row.original.summary}</div>
          </div>
        ),
      },
      {
        id: "target",
        header: "Audience",
        cell: ({ row }) => <NumericCell align="left">{row.original.target}</NumericCell>,
      },
      {
        id: "severity",
        header: "Severity",
        cell: ({ row }) => severityBadge(row.original.severity),
      },
      {
        id: "expiresAt",
        header: "Expires",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.expiresAt)}</NumericCell>,
      },
      {
        id: "isRead",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isRead ? "outline" : "secondary"}>
            {row.original.isRead ? "Read" : "Unread"}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load school notices</AlertTitle>
          <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : null}

      <h2 className="text-section-title">Notices and Communications</h2>
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search school notices"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={
          query.isLoading ? "Loading notices..." : "No active notices available."
        }
      />
    </div>
  );
}

