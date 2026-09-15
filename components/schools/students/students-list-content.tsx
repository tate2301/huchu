"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, MobileList, MobileListSectionHeader } from "@corelithzw/react";

import { EntityLink } from "@/components/records/entity-link";
import { RecordMark } from "@/components/records/record-mark";
import { RecordCell, recordCellTone } from "@/components/records/record-table";
import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import {
  ClassFilter,
  ALL_CLASSES,
  type ClassFilterValue,
} from "@/components/schools/common/class-filter";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { PopulationTabs } from "@/components/schools/records/population-tabs";
import {
  StudentFormSheet,
  type StudentFormValues,
} from "@/components/schools/students/student-form-sheet";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import { getApiErrorMessage } from "@/lib/api-client";
import { recordType } from "@/lib/records/registry";
import {
  createStudent,
  deleteStudent,
  fetchStudentRoll,
  updateStudent,
  type FeeStanding,
  type StudentRollRecord,
  type StudentStanding,
} from "@/lib/schools/students-v2";

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
 * Where the controls sit is the canvas's rule and not a preference. The band
 * carries state — how many are active, how many are boarding — and those
 * numbers are the school's, not the page's: filtering to Form 2 must not make
 * it look as though the school lost 700 children. The tabs, the search box and
 * the filters all change what the table below shows and nothing else, so they
 * travel with the table in one row above it.
 */

/** The cuts of the roll the canvas draws, in its order. */
type RollTab = "all" | "active" | "applicants" | "suspended" | "boarders";

/**
 * Each tab is a query, not a client-side filter of one.
 *
 * A school with 900 children pages the roll, so "Suspended" filtered in the
 * browser would only ever find the suspended pupils who happened to be on the
 * page you were looking at.
 */
const TAB_QUERY: Record<RollTab, { status?: string; isBoarding?: boolean }> = {
  all: {},
  active: { status: "ACTIVE" },
  applicants: { status: "APPLICANT" },
  suspended: { status: "SUSPENDED" },
  boarders: { isBoarding: true },
};

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

export function StudentsListContent() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<RollTab>("active");
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 50,
    search: "",
  });
  const [classValue, setClassValue] = useState<ClassFilterValue>(ALL_CLASSES);
  const [statusFilter, setStatusFilter] = useState("");
  const [boardingFilter, setBoardingFilter] = useState("");
  const [portalFilter, setPortalFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRollRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const search = queryState.search ?? "";
  /** Narrowing changes what page 1 means, so every filter goes back to it. */
  const toFirstPage = () => setQueryState((current) => ({ ...current, page: 1 }));

  const filters = {
    ...TAB_QUERY[tab],
    search: search.trim() || undefined,
    // An explicit status filter beats the tab's: choosing "Left — withdrawn"
    // while sitting on Active has to show the withdrawn, not nothing.
    ...(statusFilter ? { status: statusFilter } : {}),
    classId: classValue.classId || undefined,
    streamId: classValue.streamId || undefined,
    ...(boardingFilter ? { isBoarding: boardingFilter === "boarding" } : {}),
    hasPortalAccount: portalFilter === "" ? undefined : portalFilter === "claimed",
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
   * The band's numbers and the tab counts, in one read.
   *
   * Five count-only queries rather than one aggregate endpoint, because they
   * must not move when the filters do — and because every one of them is
   * answered by the grant this page already holds.
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
  const standing = useMemo<Record<string, StudentStanding>>(
    () => rollQuery.data?.summary ?? {},
    [rollQuery.data],
  );
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

  /**
   * The hard delete, which the server refuses the moment anything hangs off
   * the child — a mark, an invoice, a register line. That refusal is right, so
   * this verb is for the record somebody typed twice this morning and nothing
   * else; the everyday verb is taking them off the roll.
   */
  const deleteMutation = useMutation({
    mutationFn: (student: StudentRollRecord) => deleteStudent(student.id),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  /**
   * The narrowing in force, in the reader's own words — and without the search
   * term, which the empty state names separately. A search folded in with the
   * filters turns "no students match that search" into a sentence that lists
   * what was typed twice and offers to clear filters nobody set.
   */
  const namedFilters = [
    classValue.classId ? "the chosen class" : undefined,
    STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label,
    BOARDING_OPTIONS.find((option) => option.value === boardingFilter)?.label,
    PORTAL_OPTIONS.find((option) => option.value === portalFilter)?.label,
  ].filter((entry): entry is string => Boolean(entry));

  function clearFilters() {
    setQueryState((current) => ({ ...current, page: 1, search: "" }));
    setClassValue(ALL_CLASSES);
    setStatusFilter("");
    setBoardingFilter("");
    setPortalFilter("");
  }

  /** Only worth a heading when more than one year group is on screen. */
  const yearGroupFor = useMemo(() => {
    if (classValue.classId) return undefined;
    return (student: StudentRollRecord) =>
      student.currentClass
        ? { key: student.currentClass.id, label: student.currentClass.name }
        : { key: "unplaced", label: "Not in a year group yet" };
  }, [classValue.classId]);

  const columns = useMemo<ColumnDef<StudentRollRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        // The mark, the name and the one line that tells two Tendai Moyos
        // apart, as one cell. The admission number leads it because it is the
        // half that is unique, and the year group follows because that is what
        // somebody at the counter is holding in their head.
        //
        // It is why there is no Admission column and no Year column any more:
        // three columns saying what one cell says cost 220px of a register
        // that is read across.
        cell: ({ row }) => (
          <PersonCell
            firstName={row.original.firstName}
            lastName={row.original.lastName}
            href={recordType("STUDENT").href(row.original.id)}
            reference={row.original.admissionNo ?? row.original.studentNo}
            context={row.original.currentClass?.name}
          />
        ),
      },
      {
        id: "class",
        header: "Class",
        cell: ({ row }) => (
          <RecordCell
            value={row.original.currentStream?.name}
            className="text-[color:var(--text-muted)]"
          />
        ),
      },
      {
        id: "guardian",
        header: "Primary guardian",
        cell: ({ row }) => {
          const links = row.original.guardianLinks ?? [];
          const primary = links.find((link) => link.isPrimary) ?? links[0];
          // Named in words rather than dashed. A child with nobody attached is
          // the one row on this register somebody has to act on, and a dash
          // under "Primary guardian" reads as a column that failed to load.
          if (!primary) {
            return <span className="text-sm text-muted-foreground">No guardian linked</span>;
          }
          // The truncation is owned by the cell, not by the link: a link is an
          // inline child and will not clamp itself, so a long name wrapped to
          // two lines and made its row twice as tall as its neighbours.
          return (
            <span className="block truncate">
              <EntityLink
                href={recordType("GUARDIAN").href(primary.guardian.id)}
                className={recordCellTone("relation")}
              >
                {primary.guardian.firstName} {primary.guardian.lastName}
              </EntityLink>
            </span>
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
          return <RecordCell kind="number" value={`${rate.toFixed(1)}%`} />;
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => statusBadge(row.original.status),
      },
      {
        id: "verbs",
        // An affordance, not a field — but it still needs a header cell, or the
        // body rows carry one more cell than the head.
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => {
          const student = row.original;
          const name = `${student.firstName} ${student.lastName}`;
          const offRoll = student.status === "WITHDRAWN" || student.status === "GRADUATED";
          /** Anything already written about the child makes deletion wrong. */
          const history =
            student._count.resultLines +
            student._count.enrollments +
            student._count.boardingAllocations;
          return (
            <RecordActions
              layout="menu"
              label={`Row actions for ${name}`}
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
                        title: `Take ${name} off the roll`,
                        description:
                          "The record stays — their marks, register and fee history are untouched. They stop counting towards the school's numbers and drop out of the class lists.",
                        confirmLabel: "Take off the roll",
                      },
                      onSelect: () =>
                        statusMutation.mutate({ id: student.id, status: "WITHDRAWN" }),
                    },
                {
                  label: "Delete",
                  action: "archive",
                  tone: "danger" as const,
                  loading: deleteMutation.isPending,
                  unavailable:
                    history > 0
                      ? "There are marks, enrolments or a bed against this pupil. Take them off the roll instead."
                      : undefined,
                  confirm: {
                    title: `Delete ${name}`,
                    description: `The record goes for good, along with ${student._count.guardianLinks} guardian ${student._count.guardianLinks === 1 ? "link" : "links"}. Nothing has been written about this pupil yet, which is the only reason this is allowed — if they were ever here, take them off the roll instead.`,
                    confirmLabel: "Delete the record",
                  },
                  onSelect: () => deleteMutation.mutate(student),
                },
              ]}
            />
          );
        },
      },
    ],
    [standing, statusMutation, deleteMutation],
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
    !rollQuery.isPending &&
    students.length === 0 &&
    namedFilters.length === 0 &&
    !search.trim();

  return (
    <SchoolsPage
      band={
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
            <>
              <Button asChild variant="secondary" size="sm">
                <Link href="/schools/students/roll-up">Roll up the year</Link>
              </Button>
              {/* Named for what it does. It prints the roll as it stands,
                  filters and all — "Export" promised a file the button has
                  never produced. */}
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                Print the roll
              </Button>
            </>
          }
        />
      }
    >
      {/* The page is named once, in the app bar, and the one create verb goes
          with the name. The dialog it opens runs on state this component owns,
          which is why the registration is here and not in the route file. */}
      <PageChrome title="All students">
        <CreateButton
          resource="schools.students"
          label="New student"
          onSelect={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      </PageChrome>

      {actionError ? <SaveError what="That change" error={actionError} /> : null}

      {/* One row, read left to right: which population, then how it is
          narrowed, then how many of it there are. The filters used to sit on a
          row of their own behind a "Filter" button this screen wrote for
          itself — so "narrow it down" was answered in two places a band apart,
          and the answer on a phone was different again. `TableControls` folds
          them behind one button below `sm` and carries the active count on it,
          which is the same instinct done once for every campus list. */}
      <TableControls
        sticky
        tabs={
          <PopulationTabs<RollTab>
            value={tab}
            onChange={(next) => {
              setTab(next);
              toFirstPage();
            }}
            tabs={[
              { id: "all", label: "All", count: tally?.all },
              { id: "active", label: "Active", count: tally?.active },
              { id: "applicants", label: "Applicants", count: tally?.applicants },
              { id: "suspended", label: "Suspended", count: tally?.suspended },
              { id: "boarders", label: "Boarders", count: tally?.boarders },
            ]}
          />
        }
        search={
          <TableSearch
            value={search}
            onChange={(next) =>
              setQueryState((current) => ({ ...current, search: next, page: 1 }))
            }
            placeholder="Search name or admission number"
          />
        }
        filterCount={activeFilterCount(
          classValue.classId,
          statusFilter,
          boardingFilter,
          portalFilter,
        )}
        filters={
          <>
            <ClassFilter
              value={classValue}
              onChange={(next) => {
                setClassValue(next);
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
          </>
        }
        // The answer to whatever the filters just asked, beside the question
        // rather than under the table — and not in the band, which carries the
        // school's own numbers and must not move when a filter does.
        count={rollQuery.isPending ? null : `${students.length} of ${total}`}
        actions={
          namedFilters.length > 0 || search.trim() ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear the filters
            </Button>
          ) : null
        }
      />

      {/* No card, and no title over the table: the bar names the page and the
          lit tab names the population. A card that repeated both spent a band
          of vertical space saying what two controls above it had just said. */}
      <DataTable
        data={students}
        columns={columns}
        queryState={queryState}
        onQueryStateChange={(next) =>
          setQueryState((current) => ({ ...current, ...next }))
        }
        features={{ sorting: false, globalFilter: false, pagination: true }}
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
                      <RecordMark
                        kind="student"
                        name={`${row.firstName} ${row.lastName}`}
                        size="sm"
                      />
                    }
                    title={`${row.firstName} ${row.lastName}`}
                    // The same facts the table's name cell carries, in the same
                    // order, so the roll says the same thing about a child
                    // whichever width you meet it at.
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
              headers={["Student", "Class", "Primary guardian", "Fees", "Attendance", "Status", ""]}
              columns={[
                { avatar: true, twoLine: true },
                { width: 100 },
                {},
                { width: 90, badge: true },
                { width: 90, align: "right" },
                { width: 90, badge: true },
                { width: 44 },
              ]}
            />
          ) : nothingAtAll ? (
            <NothingYet
              title="Nobody is on the roll yet"
              body="Add the first pupil, or bring the whole school over from your old system under Import records."
            />
          ) : (
            <NothingMatched
              what="students"
              filters={namedFilters}
              search={search}
              onClear={clearFilters}
            />
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
    </SchoolsPage>
  );
}
