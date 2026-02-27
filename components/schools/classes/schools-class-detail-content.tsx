"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsStudents,
  type SchoolsStudentRecord,
} from "@/lib/schools/admin-v2";

type ClassDetailView = "students" | "streams" | "subjects";

type ClassDetail = {
  id: string;
  code: string;
  name: string;
  level: number | null;
  capacity: number | null;
  streams: { id: string; code: string; name: string; capacity: number | null }[];
  classSubjects: {
    id: string;
    isActive: boolean;
    subject: { id: string; code: string; name: string; isCore: boolean; passMark: number; isActive: boolean };
    stream: { id: string; code: string; name: string } | null;
    teacherProfile: { id: string; employeeCode: string; user: { id: string; name: string; email: string } } | null;
  }[];
  _count: { streams: number; students: number };
};

type StreamRow = { id: string; code: string; name: string; capacity: number | null };
type SubjectRow = ClassDetail["classSubjects"][number];

export function SchoolsClassDetailContent({ classId }: { classId: string }) {
  const [activeView, setActiveView] = useState<ClassDetailView>("students");

  const classQuery = useQuery({
    queryKey: ["schools", "classes", classId],
    queryFn: () =>
      fetchJson<{ success: boolean; data: ClassDetail }>(`/api/v2/schools/classes/${classId}`).then(
        (res) => res.data,
      ),
  });

  const studentsQuery = useQuery({
    queryKey: ["schools", "students", "byClass", classId],
    queryFn: () => fetchSchoolsStudents({ classId, page: 1, limit: 200 }),
  });

  const classData = classQuery.data;
  const students = useMemo(() => {
    const raw = studentsQuery.data;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : raw.data ?? [];
  }, [studentsQuery.data]);

  const streams = useMemo(() => classData?.streams ?? [], [classData]);
  const subjects = useMemo(() => classData?.classSubjects ?? [], [classData]);

  const studentColumns = useMemo<ColumnDef<SchoolsStudentRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <Link
            href={`/schools/students/${row.original.id}`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.studentNo} - {row.original.firstName} {row.original.lastName}
          </Link>
        ),
      },
      {
        id: "admissionNo",
        header: "Admission No",
        cell: ({ row }) => row.original.admissionNo || "-",
      },
      {
        id: "stream",
        header: "Stream",
        cell: ({ row }) => row.original.currentStream?.name ?? "-",
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.original.status;
          if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
          if (status === "APPLICANT") return <Badge variant="outline">Applicant</Badge>;
          if (status === "SUSPENDED") return <Badge variant="destructive">Suspended</Badge>;
          return <Badge variant="outline">{status}</Badge>;
        },
      },
    ],
    [],
  );

  const streamColumns = useMemo<ColumnDef<StreamRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
      },
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "capacity",
        header: "Capacity",
        cell: ({ row }) => (
          <NumericCell>{row.original.capacity ?? "-"}</NumericCell>
        ),
      },
    ],
    [],
  );

  const subjectColumns = useMemo<ColumnDef<SubjectRow>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-medium">{row.original.subject.code}</span>,
      },
      {
        id: "name",
        header: "Subject",
        cell: ({ row }) => row.original.subject.name,
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant={row.original.subject.isCore ? "secondary" : "outline"}>
            {row.original.subject.isCore ? "Core" : "Elective"}
          </Badge>
        ),
      },
      {
        id: "stream",
        header: "Stream",
        cell: ({ row }) => row.original.stream?.name ?? "All",
      },
      {
        id: "teacher",
        header: "Teacher",
        cell: ({ row }) => row.original.teacherProfile?.user.name ?? "-",
      },
      {
        id: "passMark",
        header: "Pass Mark",
        cell: ({ row }) => (
          <NumericCell>{row.original.subject.passMark}</NumericCell>
        ),
      },
    ],
    [],
  );

  const hasError = classQuery.error || studentsQuery.error;

  return (
    <div className="space-y-4">
      {classData ? (
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold">{classData.name}</h2>
            <p className="text-sm text-muted-foreground">
              Code: <span className="font-mono">{classData.code}</span>
              {classData.level != null ? ` · Level ${classData.level}` : ""}
              {classData.capacity != null ? ` · Capacity: ${classData.capacity}` : ""}
            </p>
          </div>
        </div>
      ) : null}

      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load class details</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(classQuery.error || studentsQuery.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "students", label: "Students", count: students.length },
          { id: "streams", label: "Streams", count: streams.length },
          { id: "subjects", label: "Subjects", count: subjects.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as ClassDetailView)}
        railLabel="Class Views"
      >
        <div className={activeView === "students" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Students</h2>
          <DataTable
            data={students}
            columns={studentColumns}
            searchPlaceholder="Search students"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              studentsQuery.isLoading ? "Loading students..." : "No students in this class."
            }
          />
        </div>

        <div className={activeView === "streams" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Streams</h2>
          <DataTable
            data={streams}
            columns={streamColumns}
            searchPlaceholder="Search streams"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              classQuery.isLoading ? "Loading streams..." : "No streams for this class."
            }
          />
        </div>

        <div className={activeView === "subjects" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Subjects</h2>
          <DataTable
            data={subjects}
            columns={subjectColumns}
            searchPlaceholder="Search subjects"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              classQuery.isLoading ? "Loading subjects..." : "No subjects assigned to this class."
            }
          />
        </div>
      </VerticalDataViews>
    </div>
  );
}
