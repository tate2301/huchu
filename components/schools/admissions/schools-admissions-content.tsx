"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { RecordCell } from "@/components/records/record-table";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { PersonCell } from "@/components/schools/common/identity-cell";
import {
  activeFilterCount,
  FilterSelect,
} from "@/components/schools/common/filter-select";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/records/states";
import { useDebounced } from "@/hooks/use-debounced";
import { DataTable } from "@/components/ui/data-table";
import { recordType } from "@/lib/records/registry";
import { formatSchoolDate } from "@/lib/schools/format";
import {
  fetchSchoolsClasses,
  fetchSchoolsEnrollments,
  fetchSchoolsTerms,
  type SchoolsEnrollmentRecord,
} from "@/lib/schools/admin-v2";

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
  /**
   * Searched at the endpoint rather than over the rows already fetched. The
   * box used to belong to the table, which matched only the page in hand and
   * left the screen unable to say which of the search and the filters had
   * emptied the list.
   */
  const [search, setSearch] = useState("");
  /** Fetched rather than filtered, so the box is a request; see the guardians
   *  register for why it is held for a moment before it becomes one. */
  const debouncedSearch = useDebounced(search, 300);
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
    queryKey: [
      "schools",
      "admissions",
      "enrollments",
      debouncedSearch,
      classFilter,
      termFilter,
      statusFilter,
    ],
    queryFn: () =>
      fetchSchoolsEnrollments({
        page: 1,
        limit: 250,
        search: debouncedSearch.trim() || undefined,
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
  const total = enrollmentsQuery.data?.pagination.total ?? enrollments.length;

  const namedFilters = [
    classes.find((row) => row.id === classFilter)?.name,
    terms.find((row) => row.id === termFilter)?.name,
    STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label,
  ].filter((entry): entry is string => Boolean(entry));

  function clearFilters() {
    setSearch("");
    setClassFilter("");
    setTermFilter("");
    setStatusFilter("");
  }

  const columns = useMemo<ColumnDef<SchoolsEnrollmentRecord>[]>(
    () => [
      {
        id: "student",
        header: "Pupil",
        // An enrolment row is nearly always read on the way to the child it is
        // about, so the name is the way through to their record — with the
        // mark and the number that tell two of them apart, the same cell the
        // roll and the class list draw.
        cell: ({ row }) => (
          <PersonCell
            firstName={row.original.student.firstName}
            lastName={row.original.student.lastName}
            href={recordType("STUDENT").href(row.original.student.id)}
            reference={row.original.student.studentNo}
            context={row.original.term.name}
          />
        ),
      },
      {
        id: "placement",
        header: "Class",
        cell: ({ row }) => (
          <RecordCell
            kind="relation"
            href={recordType("CLASS").href(row.original.class.id)}
            value={
              row.original.stream
                ? `${row.original.class.name} · ${row.original.stream.name}`
                : row.original.class.name
            }
          />
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
        cell: ({ row }) => (
          <RecordCell kind="date" value={formatSchoolDate(row.original.enrolledAt)} />
        ),
      },
      {
        id: "endedAt",
        header: "Ended",
        // Still on the roll, said in words. A dash here and a dash under
        // "Enrolled" are two different facts.
        cell: ({ row }) =>
          row.original.endedAt ? (
            <RecordCell kind="date" value={formatSchoolDate(row.original.endedAt)} />
          ) : (
            <span className="text-sm text-[var(--text-muted)]">Still enrolled</span>
          ),
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
      {/*
        The filter reads span three endpoints. If the year groups or the terms
        will not load the pickers below are empty dropdowns with no explanation,
        which reads as "this school has no terms" — so the failure says which
        list is missing rather than letting the control lie about it.
      */}
      {classesQuery.error || termsQuery.error ? (
        <LoadError
          what="the filter lists"
          error={classesQuery.error ?? termsQuery.error}
          onRetry={() => {
            void classesQuery.refetch();
            void termsQuery.refetch();
          }}
        />
      ) : null}

      {/* One row over the table, and the four hand-built tiles that used to
          sit between them are gone. "Enrollments 214 / Active 198 / …" was the
          same answer the Status filter gives, counted over the rows the filters
          had already narrowed — so choosing Withdrawn made three of the four
          read nought. What is left is the count, beside the question it
          answers.

          The controls rode in the table's own toolbar until now, which cost
          this screen the two things every other campus list has: the filters
          fold behind one button on a phone, and that button carries how many
          of them are in force — a filter you cannot see is how a list ends up
          looking empty for no visible reason. */}
      <TableControls
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search name or admission number"
          />
        }
        filterCount={activeFilterCount(classFilter, termFilter, statusFilter)}
        filters={
          <>
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
          </>
        }
        count={enrollmentsQuery.isPending ? null : `${enrollments.length} of ${total}`}
      />

      {enrollmentsQuery.isPending ? (
        /*
          The skeleton is the table, not a message inside an empty one.
          `emptyState` is where "nothing matched" goes; putting the loading bars
          there made the table draw its own chrome around a placeholder and
          reflow twice as the rows landed.
        */
        <TableRowsSkeleton
          headers={["Pupil", "Class", "Status", "Enrolled", "Ended"]}
          columns={[
            { avatar: true, twoLine: true },
            {},
            { width: 100, badge: true },
            { width: 110, align: "right" },
            { width: 110, align: "right" },
          ]}
          rows={8}
        />
      ) : (
        /*
          This screen only reads — an enrolment is written from the pipeline
          when an accepted applicant goes on the roll, and corrected there. The
          dim is still the right interlock while a filter change is in flight:
          rows from the old filter under the new one's controls are rows
          somebody will read as the answer to a question they did not ask.
        */
        <SavingOverlay
          saving={enrollmentsQuery.isFetching}
          label="Narrowing the list…"
        >
          <DataTable
            data={enrollments}
            columns={columns}
            // The narrowing is answered once, in the row above. Left on, the
            // table draws a second search box under the first.
            features={{ globalFilter: false, pagination: true }}
            pagination={{ enabled: true }}
            mobileCardRenderer={({ row }) => (
              // Five columns at 390px is a sideways scroll showing one and a
              // half of them. The same facts, stacked, in the order the table
              // reads them.
              <div className="space-y-1.5">
                <PersonCell
                  firstName={row.student.firstName}
                  lastName={row.student.lastName}
                  href={recordType("STUDENT").href(row.student.id)}
                  reference={row.student.studentNo}
                  context={row.term.name}
                />
                <div className="flex flex-wrap items-center gap-2 pl-[2.125rem]">
                  {statusBadge(row.status)}
                  <span className="text-sm text-[var(--text-muted)]">
                    {row.class.name}
                    {row.stream ? ` · ${row.stream.name}` : ""}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-[var(--text-muted)]">
                    {formatSchoolDate(row.enrolledAt)}
                  </span>
                </div>
              </div>
            )}
            emptyState={
              namedFilters.length > 0 || search.trim() ? (
                <NothingMatched
                  what="enrolments"
                  filters={namedFilters}
                  search={search}
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
        </SavingOverlay>
      )}
    </div>
  );
}
