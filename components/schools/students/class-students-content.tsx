"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, MobileList, MobileListSectionHeader } from "@corelithzw/react";

import { PageHeading } from "@/components/layout/page-heading";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { PrintDocumentButton } from "@/components/schools/common/print-document-button";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
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
import { DataTable } from "@/components/ui/data-table";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import {
  createStudent,
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

/**
 * The register for one year group.
 *
 * Scoped by route rather than by a dropdown over everything, so the query asks
 * for one class's students and the page never holds the whole school. Within
 * the group the students are ordered by surname and headed by their class —
 * "Form 2 Blue", the unit a class teacher actually works in — unless a single
 * class is already chosen, in which case the heading would repeat itself.
 *
 * Guardians are named rather than counted. "2" tells a class teacher ringing
 * home nothing; "Grace Mutasa, Peter Mutasa" is the answer they came for, and
 * "No guardian linked" is a job for the office rather than a zero.
 */
export function ClassStudentsContent({
  classId,
  className,
  initialStreamId,
}: {
  classId: string;
  /** The year group's name, resolved on the server so the heading is right on first paint. */
  className: string;
  initialStreamId?: string;
}) {
  const queryClient = useQueryClient();
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

  const studentsQuery = useQuery({
    queryKey: [
      "schools",
      "students",
      "by-class",
      classId,
      streamFilter,
      statusFilter,
      boardingFilter,
    ],
    queryFn: () =>
      fetchStudentRoll({
        page: 1,
        limit: 200,
        classId,
        streamId: streamFilter || undefined,
        status: statusFilter || undefined,
        isBoarding: boardingFilter === "" ? undefined : boardingFilter === "boarding",
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
  ].filter((entry): entry is string => Boolean(entry));

  function clearFilters() {
    setStreamFilter("");
    setStatusFilter("");
    setBoardingFilter("");
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
              ]}
            />
          );
        },
      },
    ],
    [statusMutation],
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
      <PageHeading
        title={className}
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

      {actionError ? <LoadError what="that change" error={actionError} /> : null}

      <FilterBar>
        {streams.length > 0 ? (
          <FilterSelect
            label="Class"
            allLabel="Every class"
            value={streamFilter}
            options={streams.map((stream) => ({ value: stream.id, label: stream.name }))}
            onChange={setStreamFilter}
          />
        ) : null}
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
      </FilterBar>

      <DataTable
        data={students}
        columns={columns}
        searchPlaceholder="Search this year group"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
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
