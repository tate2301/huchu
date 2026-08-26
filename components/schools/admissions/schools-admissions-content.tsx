"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  fetchSchoolsClasses,
  fetchSchoolsEnrollments,
  fetchSchoolsTerms,
  type SchoolsEnrollmentRecord,
} from "@/lib/schools/admin-v2";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function statusBadge(status: string) {
  if (status === "ACTIVE") return <Badge tone="success">Active</Badge>;
  if (status === "TRANSFERRED") return <Badge tone="info">Transferred</Badge>;
  if (status === "WITHDRAWN") return <Badge tone="danger">Withdrawn</Badge>;
  return <Badge tone="neutral">Completed</Badge>;
}

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "COMPLETED", label: "Completed" },
];

export function SchoolsAdmissionsContent() {
  const [classFilter, setClassFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "enrolments"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 50 }),
  });

  const enrollmentsQuery = useQuery({
    queryKey: ["schools", "admissions", "enrollments", classFilter, termFilter, statusFilter],
    queryFn: () =>
      fetchSchoolsEnrollments({
        page: 1,
        limit: 250,
        classId: classFilter || undefined,
        termId: termFilter || undefined,
        status: statusFilter || undefined,
      }),
  });

  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const enrollments = useMemo(
    () => enrollmentsQuery.data?.data ?? [],
    [enrollmentsQuery.data],
  );

  const namedFilters = [
    classes.find((row) => row.id === classFilter)?.name,
    terms.find((row) => row.id === termFilter)?.name,
    STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label,
  ].filter((entry): entry is string => Boolean(entry));

  function clearFilters() {
    setClassFilter("");
    setTermFilter("");
    setStatusFilter("");
  }

  const columns = useMemo<ColumnDef<SchoolsEnrollmentRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          // An enrolment row is nearly always read on the way to the child it
          // is about, so the name is a way through to their record.
          <div>
            <div className="font-medium">
              <Link
                href={`/schools/students/${row.original.student.id}`}
                className="hover:underline"
              >
                {row.original.student.firstName} {row.original.student.lastName}
              </Link>
            </div>
            <div className="text-sm text-muted-foreground">
              {row.original.student.studentNo} · {row.original.term.name}
            </div>
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

  if (enrollmentsQuery.error) {
    return (
      <LoadError
        what="the enrolments"
        error={enrollmentsQuery.error}
        onRetry={() => void enrollmentsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <FilterBar>
        <FilterSelect
          label="Year group"
          allLabel="Every year group"
          value={classFilter}
          options={classes.map((row) => ({ value: row.id, label: row.name }))}
          onChange={setClassFilter}
        />
        <FilterSelect
          label="Term"
          allLabel="Every term"
          value={termFilter}
          options={terms.map((row) => ({ value: row.id, label: row.name }))}
          onChange={setTermFilter}
        />
        <FilterSelect
          label="Status"
          allLabel="Any status"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={setStatusFilter}
        />
      </FilterBar>

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
        searchPlaceholder="Search enrolments"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={
          enrollmentsQuery.isPending ? (
            <TableRowsSkeleton
              rows={6}
              columns={[{ twoLine: true }, {}, { width: 100 }, { width: 110 }, { width: 110 }]}
            />
          ) : namedFilters.length > 0 ? (
            <NothingMatched
              what="enrolments"
              filters={namedFilters}
              onClear={clearFilters}
            />
          ) : (
            <NothingYet
              title="Nobody has been enrolled yet"
              body="An enrolment is written when an accepted applicant is put on the roll, or when the year is rolled up."
            />
          )
        }
      />
    </div>
  );
}
