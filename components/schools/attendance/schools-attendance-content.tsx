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
  fetchSchoolsAttendanceRoster,
  type SchoolsAttendanceRosterData,
} from "@/lib/schools/admin-v2";

type AttendanceRecord = SchoolsAttendanceRosterData["data"][number];

function statusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "APPLICANT") return <Badge variant="outline">Applicant</Badge>;
  if (status === "SUSPENDED") return <Badge variant="destructive">Suspended</Badge>;
  if (status === "GRADUATED") return <Badge variant="outline">Graduated</Badge>;
  return <Badge variant="destructive">Withdrawn</Badge>;
}

export function SchoolsAttendanceContent() {
  const attendanceQuery = useQuery({
    queryKey: ["schools", "attendance", "roster"],
    queryFn: () => fetchSchoolsAttendanceRoster({ page: 1, limit: 250 }),
  });

  const rows = useMemo(() => attendanceQuery.data?.data ?? [], [attendanceQuery.data]);
  const summary = attendanceQuery.data?.summary;

  const columns = useMemo<ColumnDef<AttendanceRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.studentNo} - {row.original.firstName} {row.original.lastName}
            </div>
          </div>
        ),
      },
      {
        id: "class",
        header: "Class / Stream",
        cell: ({ row }) => (
          <span>
            {row.original.currentClass?.name ?? "-"}
            {row.original.currentStream ? ` / ${row.original.currentStream.name}` : ""}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => statusBadge(row.original.status),
      },
      {
        id: "boarding",
        header: "Boarding",
        cell: ({ row }) => (
          <Badge variant={row.original.isBoarding ? "secondary" : "outline"}>
            {row.original.isBoarding ? "Boarder" : "Day Scholar"}
          </Badge>
        ),
      },
      {
        id: "enrollments",
        header: "Enrollment Rows",
        cell: ({ row }) => <NumericCell>{row.original._count.enrollments}</NumericCell>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {attendanceQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load attendance roster</AlertTitle>
          <AlertDescription>{getApiErrorMessage(attendanceQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="section-shell grid gap-2 md:grid-cols-5">
        <div>
          <h2 className="text-sm font-semibold">Total Students</h2>
          <p className="font-mono tabular-nums">{summary?.totalStudents ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Active</h2>
          <p className="font-mono tabular-nums">{summary?.activeStudents ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Applicants</h2>
          <p className="font-mono tabular-nums">{summary?.applicantStudents ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Suspended</h2>
          <p className="font-mono tabular-nums">{summary?.suspendedStudents ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Listed Boarders</h2>
          <p className="font-mono tabular-nums">{summary?.listedBoarders ?? 0}</p>
        </div>
      </section>

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search attendance roster"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={attendanceQuery.isLoading ? "Loading roster..." : "No students found."}
      />
    </div>
  );
}
