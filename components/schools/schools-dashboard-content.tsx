"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsDashboardData } from "@/lib/schools/schools-v2";

type DashboardRecord = {
  id: string;
  metric: string;
  value: number;
};

export function SchoolsDashboardContent() {
  const query = useQuery({
    queryKey: ["schools", "dashboard"],
    queryFn: () => fetchSchoolsDashboardData(),
  });

  const data = useMemo<DashboardRecord[]>(() => {
    if (!query.data) return [];
    return [
      { id: "students", metric: "Students", value: query.data.counts.students },
      { id: "guardians", metric: "Guardians", value: query.data.counts.guardians },
      { id: "enrollments", metric: "Enrollments", value: query.data.counts.enrollments },
      {
        id: "boardingAllocations",
        metric: "Boarding Allocations",
        value: query.data.counts.boardingAllocations,
      },
      { id: "resultSheets", metric: "Result Sheets", value: query.data.counts.resultSheets },
    ];
  }, [query.data]);

  const columns = useMemo<ColumnDef<DashboardRecord>[]>(
    () => [
      {
        id: "metric",
        header: "Metric",
        cell: ({ row }) => <span className="font-medium">{row.original.metric}</span>,
      },
      {
        id: "value",
        header: "Count",
        cell: ({ row }) => <NumericCell>{row.original.value}</NumericCell>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load schools dashboard</AlertTitle>
          <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : null}
      <DataTable
        data={data}
        columns={columns}
        searchPlaceholder="Search metrics"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={query.isLoading ? "Loading schools metrics..." : "No schools metrics available."}
      />
    </div>
  );
}
