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
  fetchSchoolsGuardians,
  fetchSchoolsStudents,
  type SchoolsGuardianRecord,
  type SchoolsStudentRecord,
} from "@/lib/schools/admin-v2";

type StudentsView = "students" | "guardians";

function statusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "APPLICANT") return <Badge variant="outline">Applicant</Badge>;
  if (status === "SUSPENDED") return <Badge variant="destructive">Suspended</Badge>;
  if (status === "GRADUATED") return <Badge variant="outline">Graduated</Badge>;
  return <Badge variant="destructive">Withdrawn</Badge>;
}

export function SchoolsStudentsContent() {
  const [activeView, setActiveView] = useState<StudentsView>("students");

  const studentsQuery = useQuery({
    queryKey: ["schools", "students", "directory"],
    queryFn: () => fetchSchoolsStudents({ page: 1, limit: 200 }),
  });
  const guardiansQuery = useQuery({
    queryKey: ["schools", "guardians", "directory"],
    queryFn: () => fetchSchoolsGuardians({ page: 1, limit: 200 }),
  });

  const students = useMemo(
    () => studentsQuery.data?.data ?? [],
    [studentsQuery.data],
  );
  const guardians = useMemo(
    () => guardiansQuery.data?.data ?? [],
    [guardiansQuery.data],
  );

  const studentColumns = useMemo<ColumnDef<SchoolsStudentRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.studentNo} - {row.original.firstName} {row.original.lastName}
            </div>
            <div className="text-xs text-muted-foreground">
              Admission: {row.original.admissionNo || "-"}
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
        id: "guardians",
        header: "Guardians",
        cell: ({ row }) => <NumericCell>{row.original._count.guardianLinks}</NumericCell>,
      },
      {
        id: "enrollments",
        header: "Enrollments",
        cell: ({ row }) => <NumericCell>{row.original._count.enrollments}</NumericCell>,
      },
    ],
    [],
  );

  const guardianColumns = useMemo<ColumnDef<SchoolsGuardianRecord>[]>(
    () => [
      {
        id: "guardian",
        header: "Guardian",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.guardianNo} - {row.original.firstName} {row.original.lastName}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.original.phone} {row.original.email ? ` / ${row.original.email}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "nationalId",
        header: "National ID",
        cell: ({ row }) => row.original.nationalId || "-",
      },
      {
        id: "linkedStudents",
        header: "Linked Students",
        cell: ({ row }) => <NumericCell>{row.original._count.studentLinks}</NumericCell>,
      },
    ],
    [],
  );

  const hasError = studentsQuery.error || guardiansQuery.error;

  return (
    <div className="space-y-4">
      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load student directory</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(studentsQuery.error || guardiansQuery.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "students", label: "Students", count: students.length },
          { id: "guardians", label: "Guardians", count: guardians.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as StudentsView)}
        railLabel="Directory Views"
      >
        <div className={activeView === "students" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Student Directory</h2>
          <DataTable
            data={students}
            columns={studentColumns}
            searchPlaceholder="Search students"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              studentsQuery.isLoading ? "Loading students..." : "No students found."
            }
          />
        </div>

        <div className={activeView === "guardians" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Guardian Directory</h2>
          <DataTable
            data={guardians}
            columns={guardianColumns}
            searchPlaceholder="Search guardians"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              guardiansQuery.isLoading ? "Loading guardians..." : "No guardians found."
            }
          />
        </div>
      </VerticalDataViews>
    </div>
  );
}
