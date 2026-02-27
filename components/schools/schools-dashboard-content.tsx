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
      {
        id: "resultModerationActions",
        metric: "Result Moderation Actions",
        value: query.data.counts.resultModerationActions,
      },
      {
        id: "teacherProfiles",
        metric: "Teacher Profiles",
        value: query.data.counts.teacherProfiles,
      },
      { id: "subjects", metric: "Subjects", value: query.data.counts.subjects },
      {
        id: "classSubjects",
        metric: "Class-Subject Assignments",
        value: query.data.counts.classSubjects,
      },
      {
        id: "publishWindows",
        metric: "Publish Windows",
        value: query.data.counts.publishWindows,
      },
      { id: "feeStructures", metric: "Fee Structures", value: query.data.counts.feeStructures },
      { id: "feeInvoices", metric: "Fee Invoices", value: query.data.counts.feeInvoices },
      { id: "feeReceipts", metric: "Fee Receipts", value: query.data.counts.feeReceipts },
      { id: "feeWaivers", metric: "Fee Waivers", value: query.data.counts.feeWaivers },
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
