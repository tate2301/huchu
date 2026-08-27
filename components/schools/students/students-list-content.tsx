"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, MobileList, MobileListSectionHeader } from "@corelithzw/react";

import { PageBand } from "@/components/schools/common/page-band";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import {
  StudentFormSheet,
  type StudentFormValues,
} from "@/components/schools/students/student-form-sheet";
import { CreateButton } from "@/components/schools/common/record-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import {
  createStudent,
  fetchStudentRoll,
  updateStudent,
  type FeeStanding,
  type StudentRollRecord,
  type StudentStanding,
} from "@/lib/schools/students-v2";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "On the roll" },
  { value: "APPLICANT", label: "Applicant" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "GRADUATED", label: "Left — completed" },
  { value: "WITHDRAWN", label: "Left — withdrawn" },
];

const BOARDING_OPTIONS = [
  { value: "boarding", label: "Boarders" },
  { value: "day", label: "Day scholars" },
];

const PORTAL_OPTIONS = [
  { value: "claimed", label: "Signed in" },
  { value: "none", label: "Never signed in" },
];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  APPLICANT: "Applicant",
  SUSPENDED: "Suspended",
  GRADUATED: "Graduated",
  WITHDRAWN: "Withdrawn",
};

function statusBadge(status: string) {
  const label = STATUS_LABELS[status] ?? status;
  if (status === "ACTIVE") return <Badge tone="success">{label}</Badge>;
  if (status === "APPLICANT") return <Badge tone="info">{label}</Badge>;
  if (status === "SUSPENDED") return <Badge tone="danger">{label}</Badge>;
  return <Badge tone="neutral">{label}</Badge>;
}

/**
 * Where a family stands, in one word.
 *
 * Not a figure: a school billing in two currencies has no single total, and
 * the question this column answers is "is there a conversation to have", not
 * "how much". The amount is on the pupil's own page, in the currency it was
 * billed in.
 */
function feeBadge(standing: FeeStanding | undefined) {
  if (!standing || standing === "NOT_BILLED") {
    return <span className="text-sm text-muted-foreground">Not billed</span>;
  }
  if (standing === "PAID") return <Badge tone="success">Paid</Badge>;
  if (standing === "WAIVER") return <Badge tone="info">Waiver</Badge>;
  if (standing === "OVERDUE") return <Badge tone="danger">Overdue</Badge>;
  if (standing === "PARTIAL") return <Badge tone="warn">Partial</Badge>;
  return <Badge tone="warn">Due</Badge>;
}

/**
 * The whole roll.
 *
 * This page used to be a year-group picker and nothing else, on the argument
 * that no school wants a list of 800 children. That is true of a list you
 * cannot narrow — and the answer is filters, not a page that refuses to show
 * anybody. The year group is still one press away and still its own route;
 * this is the register the office reads when the question is "where is
 * Tanaka", which a picker cannot answer at all.
 *
 * The counts in the band are the school's, not the page's: filtering to Form 2
 * must not make it look as though the school lost 700 children.
 */
export function StudentsListContent() {
  const queryClient = useQueryClient();
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 50,
    search: "",
  });
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [boardingFilter, setBoardingFilter] = useState("");
  const [portalFilter, setPortalFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRollRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });
  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const streams = useMemo(
    () => classes.find((row) => row.id === classFilter)?.streams ?? [],
    [classes, classFilter],
  );

  const search = queryState.search ?? "";
  /** Narrowing changes what page 1 means, so every filter goes back to it. */
  const toFirstPage = () => setQueryState((current) => ({ ...current, page: 1 }));

  const filters = {
    search: search.trim() || undefined,
    status: statusFilter || undefined,
    classId: classFilter || undefined,
    streamId: streamFilter || undefined,
    isBoarding:
      boardingFilter === "" ? undefined : boardingFilter === "boarding",
    hasPortalAccount:
      portalFilter === "" ? undefined : portalFilter === "claimed",
  };

  const rollQuery = useQuery({
    queryKey: ["schools", "students", "roll", queryState.page, queryState.pageSize, filters],
    queryFn: () =>
      fetchStudentRoll({
        ...filters,
        page: queryState.page,
        limit: queryState.pageSize,
        withSummary: true,
      }),
  });

  /**
   * The band's numbers. Four count-only reads rather than one aggregate
   * endpoint, because they must not move when the filters do — and because
   * every one of them is answered by the grant this page already holds.
   */
  const tallyQuery = useQuery({
    queryKey: ["schools", "students", "tally"],
    queryFn: async () => {
      const [all, active, applicants, suspended, boarders] = await Promise.all([
        fetchStudentRoll({ limit: 1 }),
        fetchStudentRoll({ limit: 1, status: "ACTIVE" }),
        fetchStudentRoll({ limit: 1, status: "APPLICANT" }),
        fetchStudentRoll({ limit: 1, status: "SUSPENDED" }),
        fetchStudentRoll({ limit: 1, isBoarding: true }),
      ]);
      return {
        all: all.pagination.total,
        active: active.pagination.total,
        applicants: applicants.pagination.total,
        suspended: suspended.pagination.total,
        boarders: boarders.pagination.total,
      };
    },
  });

  const students = useMemo(() => rollQuery.data?.data ?? [], [rollQuery.data]);
  const standing: Record<string, StudentStanding> = rollQuery.data?.summary ?? {};
  const total = rollQuery.data?.pagination.total ?? 0;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "students"] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: StudentFormValues) => {
      const payload = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        admissionNo: values.admissionNo.trim() || null,
        dateOfBirth: values.dateOfBirth || null,
        gender: values.gender || null,
        status: values.status,
        currentClassId: values.currentClassId || null,
        currentStreamId: values.currentStreamId || null,
        isBoarding: values.isBoarding,
        admissionDate: values.admissionDate || null,
        customFields: values.customFields,
      };
      if (editing) {
        return updateStudent(editing.id, {
          ...payload,
          // Only sent when the office typed one: the server refuses an empty
          // student number, and an untouched field is not a change.
          ...(values.studentNo.trim() ? { studentNo: values.studentNo.trim() } : {}),
        });
      }
      return createStudent({
        ...payload,
        ...(values.studentNo.trim() ? { studentNo: values.studentNo.trim() } : {}),
        guardianLinks: values.guardianLinks.map((link) => ({
          guardianId: link.guardianId,
          relationship: link.relationship.trim(),
          isPrimary: link.isPrimary,
        })),
      });
    },
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: string }) =>
      updateStudent(input.id, { status: input.status }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const namedFilters = [
    classes.find((row) => row.id === classFilter)?.name,
    streams.find((row) => row.id === streamFilter)?.name,
    STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label,
    BOARDING_OPTIONS.find((option) => option.value === boardingFilter)?.label,
    PORTAL_OPTIONS.find((option) => option.value === portalFilter)?.label,
    search.trim() || undefined,
  ].filter((entry): entry is string => Boolean(entry));

  function clearFilters() {
    setQueryState((current) => ({ ...current, page: 1, search: "" }));
    setClassFilter("");
    setStreamFilter("");
    setStatusFilter("");
    setBoardingFilter("");
    setPortalFilter("");
  }

  /** Only worth a heading when more than one year group is on screen. */
  const yearGroupFor = useMemo(() => {
    if (classFilter) return undefined;
    return (student: StudentRollRecord) =>
      student.currentClass
        ? { key: student.currentClass.id, label: student.currentClass.name }
        : { key: "unplaced", label: "Not in a year group yet" };
  }, [classFilter]);

  const columns = useMemo<ColumnDef<StudentRollRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <PersonAvatar
              firstName={row.original.firstName}
              lastName={row.original.lastName}
            />
            <div className="min-w-0">
              <div className="font-medium">
                <Link
                  href={`/schools/students/${row.original.id}`}
                  className="hover:underline"
                >
                  {row.original.firstName} {row.original.lastName}
                </Link>
              </div>
              <div className="text-sm text-muted-foreground">
                {row.original.currentClass?.name ?? "No year group"}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "admission",
        header: "Admission",
        cell: ({ row }) => (
          <NumericCell>{row.original.admissionNo ?? row.original.studentNo}</NumericCell>
        ),
      },
      {
        id: "class",
        header: "Class",
        cell: ({ row }) => row.original.currentStream?.name ?? "—",
      },
      {
        id: "year",
        header: "Year",
        cell: ({ row }) => row.original.currentClass?.name ?? "—",
      },
      {
        id: "guardian",
        header: "Primary guardian",
        cell: ({ row }) => {
          const links = row.original.guardianLinks ?? [];
          const primary = links.find((link) => link.isPrimary) ?? links[0];
          if (!primary) {
            return <span className="text-sm text-muted-foreground">No guardian linked</span>;
          }
          return (
            <Link
              href={`/schools/guardians/${primary.guardian.id}`}
              className="hover:underline"
            >
              {primary.guardian.firstName} {primary.guardian.lastName}
            </Link>
          );
        },
      },
      {
        id: "fees",
        header: "Fees",
        cell: ({ row }) => feeBadge(standing[row.original.id]?.fees),
      },
      {
        id: "attendance",
        header: "Attendance",
        cell: ({ row }) => {
          const rate = standing[row.original.id]?.attendanceRate;
          if (rate === null || rate === undefined) {
            return <span className="text-sm text-muted-foreground">No register yet</span>;
          }
          return <NumericCell>{rate.toFixed(1)}%</NumericCell>;
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => statusBadge(row.original.status),
      },
      {
        id: "verbs",
        header: "",
        cell: ({ row }) => {
          const student = row.original;
          const offRoll = student.status === "WITHDRAWN" || student.status === "GRADUATED";
          return (
            <RecordActions
              resource="schools.students"
              verbs={[
                {
                  label: "Edit",
                  action: "edit",
                  onSelect: () => {
                    setEditing(student);
                    setFormOpen(true);
                  },
                },
                offRoll
                  ? {
                      label: "Put back on the roll",
                      action: "edit",
                      loading: statusMutation.isPending,
                      onSelect: () =>
                        statusMutation.mutate({ id: student.id, status: "ACTIVE" }),
                    }
                  : {
                      label: "Take off the roll",
                      action: "archive",
                      tone: "danger" as const,
                      loading: statusMutation.isPending,
                      confirm: {
                        title: `Take ${student.firstName} ${student.lastName} off the roll`,
                        description:
                          "The record stays — their marks, register and fee history are untouched. They stop counting towards the school's numbers and drop out of the class lists.",
                        confirmLabel: "Take off the roll",
                      },
                      onSelect: () =>
                        statusMutation.mutate({ id: student.id, status: "WITHDRAWN" }),
                    },
              ]}
            />
          );
        },
      },
    ],
    [standing, statusMutation],
  );

  if (rollQuery.isError) {
    return (
      <LoadError
        what="the roll"
        error={rollQuery.error}
        onRetry={() => void rollQuery.refetch()}
      />
    );
  }

  const tally = tallyQuery.data;
  const nothingAtAll =
    !rollQuery.isPending && students.length === 0 && namedFilters.length === 0;

  return (
    <div className="space-y-4">
      {/* The heading lives here rather than in the route file because the one
          create verb belongs in it, and the dialog that verb opens is state
          this component owns. */}
      <PageHeading
        title="All students"
        primaryAction={
          <CreateButton
            resource="schools.students"
            label="New student"
            onSelect={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />
        }
      />

      <PageBand
        chips={[
          { label: "Active", value: tally?.active ?? "—", tone: "success" },
          { label: "Applicants", value: tally?.applicants ?? "—", tone: "brand" },
          { label: "Boarders", value: tally?.boarders ?? "—" },
          {
            label: "Suspended",
            value: tally?.suspended ?? "—",
            tone: (tally?.suspended ?? 0) > 0 ? "danger" : "neutral",
          },
        ]}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/schools/students/roll-up">Roll up the year</Link>
          </Button>
        }
      />

      {actionError ? <LoadError what="that change" error={actionError} /> : null}

      <FilterBar>
        <FilterSelect
          label="Year group"
          allLabel="Every year group"
          value={classFilter}
          options={classes.map((row) => ({ value: row.id, label: row.name }))}
          onChange={(value) => {
            setClassFilter(value);
            setStreamFilter("");
            toFirstPage();
          }}
        />
        <FilterSelect
          label="Class"
          allLabel="Every class"
          value={streamFilter}
          options={streams.map((stream) => ({ value: stream.id, label: stream.name }))}
          onChange={(value) => {
            setStreamFilter(value);
            toFirstPage();
          }}
        />
        <FilterSelect
          label="Status"
          allLabel="Any status"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setStatusFilter(value);
            toFirstPage();
          }}
        />
        <FilterSelect
          label="Boarding"
          allLabel="Boarders and day"
          value={boardingFilter}
          options={BOARDING_OPTIONS}
          onChange={(value) => {
            setBoardingFilter(value);
            toFirstPage();
          }}
        />
        <FilterSelect
          label="Portal account"
          allLabel="Any account"
          value={portalFilter}
          options={PORTAL_OPTIONS}
          onChange={(value) => {
            setPortalFilter(value);
            toFirstPage();
          }}
        />
      </FilterBar>

      <p className="text-sm text-muted-foreground">
        {rollQuery.isPending
          ? "Reading the roll…"
          : `${total} student${total === 1 ? "" : "s"} · sorted by class`}
      </p>

      <DataTable
        data={students}
        columns={columns}
        searchPlaceholder="Search name or admission number"
        searchSubmitLabel="Search"
        queryState={queryState}
        onQueryStateChange={(next) =>
          setQueryState((current) => ({
            ...current,
            ...next,
            // A new search term is a new result set; staying on page 4 of the
            // old one shows an empty table and reads as "nobody matched".
            ...(next.search !== undefined && next.search !== current.search
              ? { page: 1 }
              : {}),
          }))
        }
        searchBehavior="submit"
        searchScope="server"
        features={{ sorting: false, globalFilter: true, pagination: true }}
        pagination={{
          enabled: true,
          server: true,
          total,
          totalPages: rollQuery.data?.pagination.pages ?? 1,
        }}
        rowGroup={yearGroupFor}
        mobileListRenderer={({ rows }) => (
          <MobileList>
            {rows.map(({ row }, index) => {
              const group = yearGroupFor?.(row);
              const previous = index > 0 ? yearGroupFor?.(rows[index - 1].row) : undefined;
              return (
                <Fragment key={row.id}>
                  {group && group.key !== previous?.key ? (
                    <MobileListSectionHeader>{group.label}</MobileListSectionHeader>
                  ) : null}
                  <MobileList.Row
                    leading={
                      <PersonAvatar firstName={row.firstName} lastName={row.lastName} />
                    }
                    title={`${row.firstName} ${row.lastName}`}
                    subtitle={[
                      row.admissionNo ?? row.studentNo,
                      row.currentStream?.name ?? row.currentClass?.name ?? "No class",
                      row.isBoarding ? "Boarder" : "Day scholar",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    onClick={() => {
                      window.location.href = `/schools/students/${row.id}`;
                    }}
                  />
                </Fragment>
              );
            })}
          </MobileList>
        )}
        emptyState={
          rollQuery.isPending ? (
            <TableRowsSkeleton
              rows={8}
              columns={[
                { avatar: true, twoLine: true },
                { width: 120 },
                { width: 100 },
                { width: 100 },
                {},
                { width: 90 },
                { width: 90 },
              ]}
            />
          ) : nothingAtAll ? (
            <NothingYet
              title="Nobody is on the roll yet"
              body="Add the first pupil, or bring the whole school over from your old system under Import records."
            />
          ) : (
            <NothingMatched what="students" filters={namedFilters} onClear={clearFilters} />
          )
        }
      />

      <StudentFormSheet
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) setEditing(null);
        }}
        student={editing}
        isSubmitting={saveMutation.isPending}
        error={saveMutation.isError ? actionError : null}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  );
}
