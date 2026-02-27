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
  fetchTeacherAssignments,
  fetchTeacherProfiles,
  fetchTeacherSubjects,
  type TeacherAssignmentRecord,
  type TeacherProfileRecord,
  type TeacherSubjectRecord,
} from "@/lib/schools/admin-v2";

type TeachersView = "profiles" | "subjects" | "assignments";

export function SchoolsTeachersContent() {
  const [activeView, setActiveView] = useState<TeachersView>("profiles");

  const profilesQuery = useQuery({
    queryKey: ["schools", "teachers", "profiles"],
    queryFn: () => fetchTeacherProfiles({ page: 1, limit: 200 }),
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "teachers", "subjects"],
    queryFn: () => fetchTeacherSubjects({ page: 1, limit: 200 }),
  });
  const assignmentsQuery = useQuery({
    queryKey: ["schools", "teachers", "assignments"],
    queryFn: () => fetchTeacherAssignments({ page: 1, limit: 200 }),
  });

  const profiles = useMemo(() => profilesQuery.data?.data ?? [], [profilesQuery.data]);
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);
  const assignments = useMemo(
    () => assignmentsQuery.data?.data ?? [],
    [assignmentsQuery.data],
  );

  const profileColumns = useMemo<ColumnDef<TeacherProfileRecord>[]>(
    () => [
      {
        id: "teacher",
        header: "Teacher",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.user.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.employeeCode} / {row.original.user.email}
            </div>
          </div>
        ),
      },
      {
        id: "department",
        header: "Department",
        cell: ({ row }) => row.original.department || "-",
      },
      {
        id: "roles",
        header: "Profile Flags",
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.isClassTeacher ? <Badge variant="secondary">Class Teacher</Badge> : null}
            {row.original.isHod ? <Badge variant="secondary">HOD</Badge> : null}
            {!row.original.isClassTeacher && !row.original.isHod ? (
              <Badge variant="outline">General</Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "assignments",
        header: "Assignments",
        cell: ({ row }) => <NumericCell>{row.original._count.assignments}</NumericCell>,
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const subjectColumns = useMemo<ColumnDef<TeacherSubjectRecord>[]>(
    () => [
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.code}</div>
            <div className="text-xs text-muted-foreground">{row.original.name}</div>
          </div>
        ),
      },
      {
        id: "core",
        header: "Core",
        cell: ({ row }) => (
          <Badge variant={row.original.isCore ? "secondary" : "outline"}>
            {row.original.isCore ? "Core" : "Elective"}
          </Badge>
        ),
      },
      {
        id: "passMark",
        header: "Pass Mark",
        cell: ({ row }) => <NumericCell>{row.original.passMark.toFixed(2)}</NumericCell>,
      },
      {
        id: "assignments",
        header: "Assignments",
        cell: ({ row }) => <NumericCell>{row.original._count.classSubjects}</NumericCell>,
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const assignmentColumns = useMemo<ColumnDef<TeacherAssignmentRecord>[]>(
    () => [
      {
        id: "teacher",
        header: "Teacher",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.teacherProfile.user.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.teacherProfile.employeeCode}
            </div>
          </div>
        ),
      },
      {
        id: "classSubject",
        header: "Class / Subject",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.class.name}
              {row.original.stream ? ` / ${row.original.stream.name}` : ""}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.original.subject.code} - {row.original.subject.name}
            </div>
          </div>
        ),
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.term.name,
      },
      {
        id: "passMark",
        header: "Pass Mark",
        cell: ({ row }) => <NumericCell>{row.original.subject.passMark.toFixed(2)}</NumericCell>,
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const hasError = profilesQuery.error || subjectsQuery.error || assignmentsQuery.error;

  return (
    <div className="space-y-4">
      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load teacher management</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(
              profilesQuery.error || subjectsQuery.error || assignmentsQuery.error,
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "profiles", label: "Teacher Profiles", count: profiles.length },
          { id: "subjects", label: "Subjects", count: subjects.length },
          { id: "assignments", label: "Assignments", count: assignments.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as TeachersView)}
        railLabel="Teacher Views"
      >
        <div className={activeView === "profiles" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Teacher Profiles</h2>
          <DataTable
            data={profiles}
            columns={profileColumns}
            searchPlaceholder="Search teacher profiles"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={profilesQuery.isLoading ? "Loading profiles..." : "No profiles found."}
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
            emptyState={subjectsQuery.isLoading ? "Loading subjects..." : "No subjects found."}
          />
        </div>

        <div className={activeView === "assignments" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Class-Subject Assignments</h2>
          <DataTable
            data={assignments}
            columns={assignmentColumns}
            searchPlaceholder="Search assignments"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              assignmentsQuery.isLoading ? "Loading assignments..." : "No assignments found."
            }
          />
        </div>
      </VerticalDataViews>
    </div>
  );
}
