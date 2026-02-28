"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type ResultSheetRow = {
  id: string;
  title: string;
  status: "DRAFT" | "SUBMITTED" | "HOD_APPROVED" | "HOD_REJECTED" | "PUBLISHED";
  updatedAt: string;
  term: { id: string; code: string; name: string };
  class: { id: string; code: string; name: string };
  stream: { id: string; code: string; name: string } | null;
  _count: { lines: number };
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function statusBadge(status: ResultSheetRow["status"]) {
  if (status === "DRAFT") return <Badge variant="outline">Draft</Badge>;
  if (status === "SUBMITTED") return <Badge variant="secondary">Submitted</Badge>;
  if (status === "HOD_APPROVED") return <Badge variant="secondary">HOD Approved</Badge>;
  if (status === "HOD_REJECTED") return <Badge variant="destructive">HOD Rejected</Badge>;
  return <Badge variant="outline">Published</Badge>;
}

export function SchoolsAssessmentsContent() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["schools", "assessments", "sheets"],
    queryFn: () =>
      fetchJson<{ data: ResultSheetRow[] }>(
        "/api/v2/schools/results/sheets?limit=300",
      ),
  });

  const transitionMutation = useMutation({
    mutationFn: async (input: { id: string; action: "submit" | "approve" | "reject" }) => {
      const endpoint =
        input.action === "submit"
          ? `/api/v2/schools/results/sheets/${input.id}/submit`
          : input.action === "approve"
            ? `/api/v2/schools/results/sheets/${input.id}/hod-approve`
            : `/api/v2/schools/results/sheets/${input.id}/hod-request-changes`;
      return fetchJson(endpoint, {
        method: "POST",
        body:
          input.action === "reject"
            ? JSON.stringify({ note: "Changes requested from assessments desk." })
            : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "assessments", "sheets"] });
      queryClient.invalidateQueries({ queryKey: ["schools", "results", "dashboard"] });
    },
  });

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);

  const columns = useMemo<ColumnDef<ResultSheetRow>[]>(
    () => [
      {
        id: "updatedAt",
        header: "Updated",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.updatedAt)}</NumericCell>,
      },
      {
        id: "title",
        header: "Assessment Sheet",
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
        cell: ({ row }) => statusBadge(row.original.status),
      },
      {
        id: "lines",
        header: "Lines",
        cell: ({ row }) => <NumericCell>{row.original._count.lines}</NumericCell>,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const item = row.original;
          if (item.status === "DRAFT" || item.status === "HOD_REJECTED") {
            return (
              <Button
                size="sm"
                onClick={() => transitionMutation.mutate({ id: item.id, action: "submit" })}
                disabled={transitionMutation.isPending}
              >
                Submit
              </Button>
            );
          }
          if (item.status === "SUBMITTED") {
            return (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => transitionMutation.mutate({ id: item.id, action: "approve" })}
                  disabled={transitionMutation.isPending}
                >
                  HOD Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => transitionMutation.mutate({ id: item.id, action: "reject" })}
                  disabled={transitionMutation.isPending}
                >
                  Request Changes
                </Button>
              </div>
            );
          }
          return <NumericCell align="left">-</NumericCell>;
        },
      },
    ],
    [transitionMutation],
  );

  return (
    <div className="space-y-4">
      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load assessments</AlertTitle>
          <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : null}
      {transitionMutation.error ? (
        <Alert variant="destructive">
          <AlertTitle>Assessment action failed</AlertTitle>
          <AlertDescription>{getApiErrorMessage(transitionMutation.error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="section-shell grid gap-2 md:grid-cols-5">
        <div>
          <h2 className="text-sm font-semibold">Draft</h2>
          <p className="font-mono tabular-nums">
            {rows.filter((row) => row.status === "DRAFT").length}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Submitted</h2>
          <p className="font-mono tabular-nums">
            {rows.filter((row) => row.status === "SUBMITTED").length}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">HOD Rejected</h2>
          <p className="font-mono tabular-nums">
            {rows.filter((row) => row.status === "HOD_REJECTED").length}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">HOD Approved</h2>
          <p className="font-mono tabular-nums">
            {rows.filter((row) => row.status === "HOD_APPROVED").length}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Published</h2>
          <p className="font-mono tabular-nums">
            {rows.filter((row) => row.status === "PUBLISHED").length}
          </p>
        </div>
      </section>

      <h2 className="text-section-title">Assessment and Marksheet Workflow</h2>
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search assessment sheets"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={
          query.isLoading ? "Loading assessment sheets..." : "No assessment sheets available."
        }
      />
    </div>
  );
}

