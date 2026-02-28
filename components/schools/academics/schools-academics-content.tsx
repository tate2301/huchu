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
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsClasses,
  fetchSchoolsSubjects,
  type SchoolsClassRecord,
  type SchoolsSubjectRecord,
} from "@/lib/schools/admin-v2";

type AcademicsView = "classes" | "subjects";

export function SchoolsAcademicsContent() {
  const [activeView, setActiveView] = useState<AcademicsView>("classes");

  const classesQuery = useQuery({
    queryKey: ["schools", "academics", "classes"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "academics", "subjects"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 200 }),
  });

  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const subjects = useMemo(
    () => subjectsQuery.data?.data ?? [],
    [subjectsQuery.data],
  );
  const hasError = classesQuery.error || subjectsQuery.error;

  const classColumns = useMemo<ColumnDef<SchoolsClassRecord>[]>(
    () => [
      {
        id: "class",
        header: "Class",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              <Link
                href={`/schools/classes/${row.original.id}`}
                className="hover:underline"
              >
                {row.original.code} - {row.original.name}
              </Link>
            </div>
            <div className="text-xs text-muted-foreground">
              Level: {row.original.level ?? "-"}
            </div>
          </div>
        ),
      },
      {
        id: "capacity",
        header: "Capacity",
        cell: ({ row }) => <NumericCell>{row.original.capacity ?? "-"}</NumericCell>,
      },
      {
        id: "streams",
        header: "Streams",
        cell: ({ row }) => <NumericCell>{row.original._count.streams}</NumericCell>,
      },
      {
        id: "students",
        header: "Students",
        cell: ({ row }) => <NumericCell>{row.original._count.students}</NumericCell>,
      },
    ],
    [],
  );

  const subjectColumns = useMemo<ColumnDef<SchoolsSubjectRecord>[]>(
    () => [
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.code} - {row.original.name}
            </div>
          </div>
        ),
      },
      {
        id: "core",
        header: "Core",
        cell: ({ row }) => (
          <Badge variant={row.original.isCore ? "secondary" : "outline"}>
            {row.original.isCore ? "Core" : "Optional"}
          </Badge>
        ),
      },
      {
        id: "passMark",
        header: "Pass Mark",
        cell: ({ row }) => <NumericCell>{row.original.passMark.toFixed(2)}</NumericCell>,
      },
      {
        id: "mappedClasses",
        header: "Class Mappings",
        cell: ({ row }) => (
          <NumericCell>{row.original._count.classSubjects}</NumericCell>
        ),
      },
      {
        id: "active",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "destructive"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load academics setup</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(classesQuery.error || subjectsQuery.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "classes", label: "Classes", count: classes.length },
          { id: "subjects", label: "Subjects", count: subjects.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as AcademicsView)}
        railLabel="Academics Views"
      >
        <div className={activeView === "classes" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Class and Stream Structure</h2>
          <DataTable
            data={classes}
            columns={classColumns}
            searchPlaceholder="Search classes"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              classesQuery.isLoading ? "Loading classes..." : "No classes configured yet."
            }
          />
        </div>

        <div className={activeView === "subjects" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Subject Catalog</h2>
          <DataTable
            data={subjects}
            columns={subjectColumns}
            searchPlaceholder="Search subjects"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              subjectsQuery.isLoading
                ? "Loading subjects..."
                : "No subjects configured yet."
            }
          />
        </div>
      </VerticalDataViews>
    </div>
  );
}

