"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsEnrollments,
  type SchoolsEnrollmentRecord,
} from "@/lib/schools/admin-v2";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function statusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "TRANSFERRED") return <Badge variant="outline">Transferred</Badge>;
  if (status === "WITHDRAWN") return <Badge variant="destructive">Withdrawn</Badge>;
  return <Badge variant="outline">Completed</Badge>;
}

export function SchoolsAdmissionsContent() {
  const enrollmentsQuery = useQuery({
    queryKey: ["schools", "admissions", "enrollments"],
    queryFn: () => fetchSchoolsEnrollments({ page: 1, limit: 250 }),
  });

  const enrollments = useMemo(
    () => enrollmentsQuery.data?.data ?? [],
    [enrollmentsQuery.data],
  );

  const columns = useMemo<ColumnDef<SchoolsEnrollmentRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.student.studentNo} - {row.original.student.firstName}{" "}
              {row.original.student.lastName}
            </div>
            <div className="text-xs text-muted-foreground">{row.original.term.name}</div>
          </div>
        ),
      },
      {
        id: "placement",
        header: "Class / Stream",
        cell: ({ row }) => (
          <span>
            {row.original.class.name}
            {row.original.stream ? ` / ${row.original.stream.name}` : ""}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => statusBadge(row.original.status),
      },
      {
        id: "enrolledAt",
        header: "Enrolled",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.enrolledAt)}</NumericCell>,
      },
      {
        id: "endedAt",
        header: "Ended",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.endedAt)}</NumericCell>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {enrollmentsQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load admissions</AlertTitle>
          <AlertDescription>{getApiErrorMessage(enrollmentsQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="section-shell grid gap-2 md:grid-cols-4">
        <div>
          <h2 className="text-sm font-semibold">Enrollments</h2>
          <p className="font-mono tabular-nums">{enrollments.length}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Active</h2>
          <p className="font-mono tabular-nums">
            {enrollments.filter((row) => row.status === "ACTIVE").length}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Transferred</h2>
          <p className="font-mono tabular-nums">
            {enrollments.filter((row) => row.status === "TRANSFERRED").length}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Withdrawn</h2>
          <p className="font-mono tabular-nums">
            {enrollments.filter((row) => row.status === "WITHDRAWN").length}
          </p>
        </div>
      </section>

      <DataTable
        data={enrollments}
        columns={columns}
        searchPlaceholder="Search enrollments"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={
          enrollmentsQuery.isLoading ? "Loading enrollments..." : "No enrollments available."
        }
      />
    </div>
  );
}
