"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsDashboardData, fetchSchoolsResultsData } from "@/lib/schools/schools-v2";
import { fetchSchoolsAttendanceRoster } from "@/lib/schools/admin-v2";
import { fetchSchoolsFeesSummary } from "@/lib/schools/fees-v2";

type ReportRow = {
  metric: string;
  value: number;
  context: string;
};

export function SchoolsReportsContent() {
  const query = useQuery({
    queryKey: ["schools", "reports", "summary"],
    queryFn: async () => {
      const [dashboard, attendance, results, fees] = await Promise.all([
        fetchSchoolsDashboardData(),
        fetchSchoolsAttendanceRoster({ page: 1, limit: 1 }),
        fetchSchoolsResultsData({ page: 1, limit: 1 }),
        fetchSchoolsFeesSummary(),
      ]);
      return { dashboard, attendance, results, fees };
    },
  });

  const rows = useMemo<ReportRow[]>(() => {
    if (!query.data) return [];
    const { dashboard, attendance, results, fees } = query.data;
    return [
      { metric: "Total Students", value: dashboard.counts.students, context: "Directory" },
      {
        metric: "Active Boarding Allocations",
        value: dashboard.counts.boardingAllocations,
        context: "Boarding",
      },
      {
        metric: "Attendance Roster",
        value: attendance.summary.totalStudents,
        context: "Attendance",
      },
      { metric: "Published Result Sheets", value: results.summary.publishedSheets, context: "Results" },
      { metric: "Submitted Result Sheets", value: results.summary.submittedSheets, context: "Results" },
      { metric: "Outstanding Fee Balance", value: fees.summary.outstandingBalance, context: "Finance" },
      { metric: "Overdue Invoices", value: fees.summary.overdueInvoices, context: "Finance" },
      { metric: "Posted Receipts", value: fees.summary.receiptsPosted, context: "Finance" },
    ];
  }, [query.data]);

  const columns = useMemo<ColumnDef<ReportRow>[]>(
    () => [
      {
        id: "metric",
        header: "Metric",
        cell: ({ row }) => row.original.metric,
      },
      {
        id: "context",
        header: "Area",
        cell: ({ row }) => <NumericCell align="left">{row.original.context}</NumericCell>,
      },
      {
        id: "value",
        header: "Value",
        cell: ({ row }) => <NumericCell>{row.original.value.toLocaleString()}</NumericCell>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load school reports</AlertTitle>
          <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : null}

      <h2 className="text-section-title">Operational Report Summary</h2>
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search report metrics"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={query.isLoading ? "Loading report metrics..." : "No school metrics available."}
      />
    </div>
  );
}

