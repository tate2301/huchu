"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, MobileList, MobileListSectionHeader } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { PrintDocumentButton } from "@/components/schools/common/print-document-button";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { ClassFilter } from "@/components/schools/common/class-filter";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { PageCaption } from "@/components/schools/records/page-caption";
import { RecordTabs } from "@/components/schools/records/record-tabs";
import {
  StudentFormSheet,
  type StudentFormValues,
} from "@/components/schools/students/student-form-sheet";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import {
  createStudent,
  deleteStudent,
  fetchStudentRoll,
  updateStudent,
  type StudentRollRecord,
} from "@/lib/schools/students-v2";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "APPLICANT", label: "Applicant" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "GRADUATED", label: "Graduated" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

const BOARDING_OPTIONS = [
  { value: "boarding", label: "Boarders" },
  { value: "day", label: "Day scholars" },
];

function statusBadge(status: string) {
  if (status === "ACTIVE") return <Badge tone="success">Active</Badge>;
  if (status === "APPLICANT") return <Badge tone="info">Applicant</Badge>;
  if (status === "SUSPENDED") return <Badge tone="danger">Suspended</Badge>;
  if (status === "GRADUATED") return <Badge tone="neutral">Graduated</Badge>;
  return <Badge tone="neutral">Withdrawn</Badge>;
}

/** The two cuts of a year group the canvas draws. */
type ClassTab = "roll" | "boarders";

/**
 * The register for one year group.
 *
 * Scoped by route rather than by a dropdown over everything, so the query asks
 * for one class's students and the page never holds the whole school. Within
 * the group the students are ordered by surname and headed by their class —
 * "Form 2 Blue", the unit a class teacher actually works in — unless a single
 * class is already chosen, in which case the heading would repeat itself.
 *
 * The Class filter still offers every class in the school, and choosing one
 * navigates rather than filters in place. That is deliberate: the year group
 * is the route, so "which class am I looking at" and "the address of this
 * page" have to stay the same fact. A dropdown that quietly showed Form 3 on
 * the Form 2 URL would break the back button and every link anyone sent.
 *
 * Guardians are named rather than counted. "2" tells a class teacher ringing
 * home nothing; "Grace Mutasa, Peter Mutasa" is the answer they came for, and
 * "No guardian linked" is a job for the office rather than a zero.
 */
export function ClassStudentsContent({
  classId,
  className,
  initialStreamId,
  termName,
}: {
  classId: string;
  /** The year group's name, resolved on the server so the heading is right on first paint. */
  className: string;
  initialStreamId?: string;
  /** The term in view, for the caption. Omitted where no term is running. */
  termName?: string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<ClassTab>("roll");
  const [search, setSearch] = useState("");
  const [streamFilter, setStreamFilter] = useState(initialStreamId ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [boardingFilter, setBoardingFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRollRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  /**
   * The tab wins over the Boarding filter, because a tab replaces the
   * population and a filter narrows one. Sitting on "Boarders" with the
   * filter set to day scholars is a contradiction; the tab is the newer
   * decision, so it is the one honoured.
   */
  const boarding =
    tab === "boarders" ? true : boardingFilter === "" ? undefined : boardingFilter === "boarding";

  const studentsQuery = useQuery({
    queryKey: [
      "schools",
      "students",
      "by-class",
      classId,
      tab,
      search,
      streamFilter,
      statusFilter,
      boardingFilter,
    ],
    queryFn: () =>
      fetchStudentRoll({
        page: 1,
        limit: 200,
        classId,
        search: search.trim() || undefined,
        streamId: streamFilter || undefined,
        status: statusFilter || undefined,
        isBoarding: boarding,
      }),
  });

  /**
   * The band counts the whole year group, not the filtered view: narrowing to
   * the boarders must not read as though the class shrank to 44.
   */
  const tallyQuery = useQuery({
    queryKey: ["schools", "students", "by-class", classId, "tally"],
    queryFn: async () => {
      const [roll, boarders, suspended] = await Promise.all([
        fetchStudentRoll({ limit: 1, classId, status: "ACTIVE" }),
        fetchStudentRoll({ limit: 1, classId, isBoarding: true }),
        fetchStudentRoll({ limit: 1, classId, status: "SUSPENDED" }),
      ]);
      return {
        roll: roll.pagination.total,
        boarders: boarders.pagination.total,
        suspended: suspended.pagination.total,
      };
    },
  });

  const students = useMemo(() => studentsQuery.data?.data ?? [], [studentsQuery.data]);
  const schoolClass = useMemo(
    () => (classesQuery.data?.data ?? []).find((row) => row.id === classId) ?? null,
    [classesQuery.data, classId],
  );
  const streams = schoolClass?.streams ?? [];

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
        ...(values.studentNo.trim() ? { studentNo: values.studentNo.trim() } : {}),
      };
      return editing
        ? updateStudent(editing.id, payload)
        : createStudent({
            ...payload,
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
   * The hard delete, for a row typed twice this morning and nothing else. The
   * server refuses the moment a mark, an invoice or a register line exists,
   * which is right — a school does not erase a child who was here.
   */
  const deleteMutation = useMutation({
    mutationFn: (student: StudentRollRecord) => deleteStudent(student.id),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  /** Only worth a heading when more than one class is on screen. */
  const streamGroupFor = useMemo(() => {
    if (streamFilter) return undefined;
    return (student: StudentRollRecord) =>
      student.currentStream
        ? { key: student.currentStream.id, label: student.currentStream.name }
        : { key: "unstreamed", label: "Not in a class yet" };
  }, [streamFilter]);

  const namedFilters = [
    streams.find((row) => row.id === streamFilter)?.name,
    STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label,
    BOARDING_OPTIONS.find((option) => option.value === boardingFilter)?.label,
    search.trim() || undefined,
  ].filter((entry): entry is string => Boolean(entry));

  function clearFilters() {
    setStreamFilter("");
    setStatusFilter("");
    setBoardingFilter("");
    setSearch("");
  }

  const columns = useMemo<ColumnDef<StudentRollRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        // A face, then the name. A list of eight hundred children is scanned
        // rather than read, and the same child is the same colour wherever
        // they appear.
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
                  {row.original.lastName}, {row.original.firstName}
                </Link>
              </div>
              <div className="text-sm text-muted-foreground">
                {row.original.studentNo}
                {row.original.admissionNo
                  ? ` · Admission ${row.original.admissionNo}`
                  : ""}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "stream",
        header: "Class",
        cell: ({ row }) => row.original.currentStream?.name ?? "—",
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
          <Badge tone={row.original.isBoarding ? "brand" : "outline"}>
            {row.original.isBoarding ? "Boarder" : "Day"}
          </Badge>
        ),
      },
      {
        id: "guardians",
        header: "Guardians",
        cell: ({ row }) => {
          const links = row.original.guardianLinks ?? [];
          if (links.length === 0) {
            return <span className="text-sm text-muted-foreground">No guardian linked</span>;
          }
          return (
            <span className="text-sm">
              {links
                .map((link) => `${link.guardian.firstName} ${link.guardian.lastName}`)
                .join(", ")}
            </span>
          );
        },
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
                          "The record stays — their marks, register and fee history are untouched. They drop out of this class list and stop counting towards the school's numbers.",
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
                    student._count.resultLines +
                      student._count.enrollments +
                      student._count.boardingAllocations >
                    0
                      ? "There are marks, enrolments or a bed against this pupil. Take them off the roll instead."
                      : undefined,
                  confirm: {
                    title: `Delete ${student.lastName}, ${student.firstName}`,
                    description: `The record goes for good, along with ${student._count.guardianLinks} guardian ${student._count.guardianLinks === 1 ? "link" : "links"}. Nothing has been written about this pupil yet, which is the only reason this is allowed.`,
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
    [statusMutation, deleteMutation],
  );

  if (studentsQuery.error) {
    return (
      <LoadError
        what={`the ${className} register`}
        error={studentsQuery.error}
        onRetry={() => void studentsQuery.refetch()}
      />
    );
  }

  const tally = tallyQuery.data;

  return (
    <div className="space-y-4">
      {/* The app bar carries the year group's name — the sidebar already says
          "Students" one column left, so the page does not say it twice. */}
      <PageChrome title={className} backHref="/schools/students" backLabel="All students">
        <CreateButton
          resource="schools.students"
          label="New student"
          onSelect={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      </PageChrome>

      <PageCaption>
        {[termName, `${tally?.roll ?? "—"} on the roll`].filter(Boolean).join(" · ")}
      </PageCaption>

      <PageBand
        chips={[
          { label: "On the roll", value: tally?.roll ?? "—", tone: "success" },
          { label: "Boarders", value: tally?.boarders ?? "—" },
          {
            label: "Suspended",
            value: tally?.suspended ?? "—",
            tone: (tally?.suspended ?? 0) > 0 ? "danger" : "neutral",
          },
        ]}
        actions={
          <>
            <PrintDocumentButton
              sourceKey="schools.class-list"
              filters={{ classId }}
              label="Class list"
            />
            <PrintDocumentButton
              sourceKey="schools.class-list"
              filters={{ classId }}
              format="csv"
              label="Export"
            />
          </>
        }
      />

      {actionError ? <SaveError what="That change" error={actionError} /> : null}

      {/* Tabs, search and filters in one row, because all three change what
          the table under them shows and nothing else on the page. */}
      <TableControls
        tabs={
          <RecordTabs<ClassTab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "roll", label: "On the roll", count: tally?.roll },
              { id: "boarders", label: "Boarders", count: tally?.boarders },
            ]}
          />
        }
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search this year group"
          />
        }
        filters={
          <>
            {/* Every class in the school, not just this one's streams: the
                office lands here from a link and the next question is nearly
                always another year group. Choosing one changes the route. */}
            <ClassFilter
              label="Class"
              allLabel="Every class"
              value={{ classId, streamId: streamFilter }}
              onChange={(next) => {
                if (next.classId && next.classId !== classId) {
                  router.push(
                    next.streamId
                      ? `/schools/students/class/${next.classId}?streamId=${next.streamId}`
                      : `/schools/students/class/${next.classId}`,
                  );
                  return;
                }
                if (!next.classId) {
                  router.push("/schools/students");
                  return;
                }
                setStreamFilter(next.streamId);
              }}
            />
            <FilterSelect
              label="Status"
              allLabel="Any status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={setStatusFilter}
            />
            <FilterSelect
              label="Boarding"
              allLabel="Boarders and day"
              value={boardingFilter}
              options={BOARDING_OPTIONS}
              onChange={setBoardingFilter}
            />
          </>
        }
      />

      <DataTable
        data={students}
        columns={columns}
        pagination={{ enabled: true }}
        features={{ sorting: false, globalFilter: false, pagination: true }}
        rowGroup={streamGroupFor}
        mobileListRenderer={({ rows }) => (
          <MobileList>
            {rows.map(({ row }, index) => {
              const group = streamGroupFor?.(row);
              const previous =
                index > 0 ? streamGroupFor?.(rows[index - 1].row) : undefined;
              return (
                <Fragment key={row.id}>
                  {group && group.key !== previous?.key ? (
                    <MobileListSectionHeader>{group.label}</MobileListSectionHeader>
                  ) : null}
                  <MobileList.Row
                    leading={
                      <PersonAvatar firstName={row.firstName} lastName={row.lastName} />
                    }
                    title={`${row.lastName}, ${row.firstName}`}
                    subtitle={[
                      row.studentNo,
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
          studentsQuery.isPending ? (
            <TableRowsSkeleton
              rows={8}
              columns={[
                { avatar: true, twoLine: true },
                { width: 90 },
                { width: 100 },
                { width: 90 },
                {},
              ]}
            />
          ) : namedFilters.length > 0 ? (
            <NothingMatched what="students" filters={namedFilters} onClear={clearFilters} />
          ) : (
            <NothingYet
              title={`Nobody is in ${className} yet`}
              body="Add a pupil to this year group, or move one here from their own record."
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
    </div>
  );
}
