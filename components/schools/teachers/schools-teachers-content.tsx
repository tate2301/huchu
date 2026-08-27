"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, MobileList, MobileListEmpty } from "@corelithzw/react";
import Link from "next/link";

import { PageHeading } from "@/components/layout/page-heading";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import {
  CreateButton,
  RecordActions,
} from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsClasses,
  fetchTeacherAssignments,
  fetchTeacherProfiles,
  fetchTeacherSubjects,
  type TeacherAssignmentRecord,
  type TeacherProfileRecord,
  type TeacherSubjectRecord,
} from "@/lib/schools/admin-v2";
import {
  AssignmentFormDialog,
  EMPTY_ASSIGNMENT,
  type AssignmentFormValues,
} from "./assignment-form-dialog";
import { BulkAllocationSheet, type BulkAllocationResult, type BulkAllocationValues } from "./bulk-allocation-sheet";
import { EmployeeLinkCell } from "./employee-link-cell";
import {
  EMPTY_SUBJECT,
  SubjectFormDialog,
  type SubjectFormValues,
} from "./subject-form-dialog";
import {
  EMPTY_TEACHER,
  TeacherFormDialog,
  type TeacherFormValues,
} from "./teacher-form-dialog";

/**
 * The staff list, and the two tables that hang off it.
 *
 * Three things this page could not do, all of them the same omission — the
 * only verbs it carried were creates. A teacher typed in with the wrong staff
 * number stayed wrong; a subject renamed by the ministry stayed under its old
 * name; a lesson allocated to the wrong set could be added again but never
 * moved. Every row now carries edit and archive, gated the way the endpoint
 * behind it is gated.
 *
 * The subject verbs are gated differently from the subject *create*, and that
 * is deliberate rather than an oversight: creating goes through
 * `teachers/subjects` under `schools.teachers`, amending goes through
 * `schools/subjects/[id]` under `schools.academics`. The buttons match the
 * endpoints, because a screen that offers a verb the API will refuse teaches
 * the permission model one red alert at a time.
 */

type TeachersView = "profiles" | "subjects" | "assignments";

/**
 * "Still here" versus "has left" for staff, and "still taught" for subjects.
 * Both were previously baked into the sort — `isActive desc` — which made the
 * list neither alphabetical nor filterable. It is a filter now, and the order
 * is plain alphabetical.
 */
type ActiveFilter = "" | "active" | "inactive";

const ACTIVE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const TAUGHT_OPTIONS = [
  { value: "active", label: "Still taught" },
  { value: "inactive", label: "Retired" },
];

function activeParam(filter: ActiveFilter) {
  return filter === "" ? undefined : filter === "active";
}

export function SchoolsTeachersContent() {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<TeachersView>("profiles");

  const [profileActive, setProfileActive] = useState<ActiveFilter>("");
  const [department, setDepartment] = useState("");
  const [subjectActive, setSubjectActive] = useState<ActiveFilter>("");
  const [assignmentClassId, setAssignmentClassId] = useState("");
  const [assignmentSubjectId, setAssignmentSubjectId] = useState("");
  const [assignmentActive, setAssignmentActive] = useState<ActiveFilter>("");

  const [teacherDialog, setTeacherDialog] = useState<TeacherFormValues | null>(null);
  const [subjectDialog, setSubjectDialog] = useState<SubjectFormValues | null>(null);
  const [assignmentDialog, setAssignmentDialog] = useState<AssignmentFormValues | null>(null);

  const [allocateOpen, setAllocateOpen] = useState(false);
  const [allocateError, setAllocateError] = useState<string | null>(null);
  const [allocateResult, setAllocateResult] = useState<BulkAllocationResult | null>(null);

  /* ── the data ──────────────────────────────────────────────────────── */

  const profilesQuery = useQuery({
    queryKey: ["schools", "teachers", "profiles", "list", profileActive],
    queryFn: () =>
      fetchTeacherProfiles({ page: 1, limit: 200, isActive: activeParam(profileActive) }),
  });

  /**
   * Every profile, whatever the filter, for the band's two numbers and the
   * department list. The filtered query cannot supply either: a page narrowed
   * to "Inactive" would report seven staff and offer one department.
   */
  const staffTallyQuery = useQuery({
    queryKey: ["schools", "teachers", "profiles", "tally"],
    queryFn: () => fetchTeacherProfiles({ page: 1, limit: 200 }),
  });

  const subjectsQuery = useQuery({
    queryKey: ["schools", "teachers", "subjects", "list", subjectActive],
    queryFn: () =>
      fetchTeacherSubjects({ page: 1, limit: 200, isActive: activeParam(subjectActive) }),
  });

  const assignmentsQuery = useQuery({
    queryKey: [
      "schools",
      "teachers",
      "assignments",
      "list",
      assignmentClassId,
      assignmentSubjectId,
      assignmentActive,
    ],
    queryFn: () =>
      fetchTeacherAssignments({
        page: 1,
        limit: 200,
        classId: assignmentClassId || undefined,
        subjectId: assignmentSubjectId || undefined,
        isActive: activeParam(assignmentActive),
      }),
  });

  const classesQuery = useQuery({
    queryKey: ["schools", "teachers", "classes"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const allSubjectsQuery = useQuery({
    queryKey: ["schools", "teachers", "subjects", "all"],
    queryFn: () => fetchTeacherSubjects({ page: 1, limit: 200 }),
  });

  const allProfiles = useMemo(
    () => staffTallyQuery.data?.data ?? [],
    [staffTallyQuery.data],
  );
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);
  const assignments = useMemo(
    () => assignmentsQuery.data?.data ?? [],
    [assignmentsQuery.data],
  );
  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);

  /**
   * Department is filtered here rather than in the query: the profiles route
   * takes no `department` param, only a free-text `search` that also matches
   * names and emails — so "Sciences" would have returned Mrs Sciencewala too.
   */
  const profiles = useMemo(() => {
    const rows = profilesQuery.data?.data ?? [];
    if (!department) return rows;
    return rows.filter((profile) => (profile.department ?? "") === department);
  }, [profilesQuery.data, department]);

  const departmentOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const profile of allProfiles) {
      if (profile.department) seen.add(profile.department);
    }
    return [...seen]
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value }));
  }, [allProfiles]);

  const tally = useMemo(
    () => ({
      total: allProfiles.length,
      active: allProfiles.filter((profile) => profile.isActive).length,
      withoutHr: allProfiles.filter((profile) => !profile.employee).length,
    }),
    [allProfiles],
  );

  /* ── the verbs ─────────────────────────────────────────────────────── */

  const deleteTeacher = useMutation({
    mutationFn: (profile: TeacherProfileRecord) =>
      fetchJson(`/api/v2/schools/teachers/profiles/${profile.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
    },
  });

  const deleteSubject = useMutation({
    mutationFn: (subject: TeacherSubjectRecord) =>
      fetchJson(`/api/v2/schools/subjects/${subject.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
      void queryClient.invalidateQueries({ queryKey: ["schools", "subjects"] });
    },
  });

  const deleteAssignment = useMutation({
    mutationFn: (assignment: TeacherAssignmentRecord) =>
      fetchJson(`/api/v2/schools/teachers/assignments/${assignment.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
      void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
    },
  });

  const allocate = useMutation({
    mutationFn: async (values: BulkAllocationValues) =>
      fetchJson<BulkAllocationResult>("/api/v2/schools/teachers/assignments/bulk", {
        method: "POST",
        body: JSON.stringify({
          subjectId: values.subjectId,
          teacherProfileId: values.teacherProfileId,
          targets: values.classIds.map((classId) => ({ classId })),
        }),
      }),
    onSuccess: (result) => {
      // Kept open: "3 lessons now clash" is the part that needs acting on.
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
      void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
      setAllocateResult(result);
      setAllocateError(null);
    },
    onError: (error) => {
      setAllocateResult(null);
      setAllocateError(getApiErrorMessage(error));
    },
  });

  const editTeacher = useCallback((profile: TeacherProfileRecord) => {
    setTeacherDialog({
      id: profile.id,
      userId: profile.user.id,
      employeeCode: profile.employeeCode,
      department: profile.department ?? "",
      isClassTeacher: profile.isClassTeacher,
      isHod: profile.isHod,
      isActive: profile.isActive,
      userLabel: `${profile.user.name} · ${profile.user.email}`,
    });
  }, []);

  const editSubject = useCallback((subject: TeacherSubjectRecord) => {
    setSubjectDialog({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      isCore: subject.isCore,
      isActive: subject.isActive,
      passMark: String(subject.passMark),
    });
  }, []);

  const editAssignment = useCallback((assignment: TeacherAssignmentRecord) => {
    setAssignmentDialog({
      id: assignment.id,
      termId: assignment.term.id,
      classId: assignment.class.id,
      streamId: assignment.stream?.id ?? "",
      subjectId: assignment.subject.id,
      teacherProfileId: assignment.teacherProfile.id,
      isActive: assignment.isActive,
    });
  }, []);

  /* ── the columns ───────────────────────────────────────────────────── */

  const profileColumns = useMemo<ColumnDef<TeacherProfileRecord>[]>(
    () => [
      {
        id: "teacher",
        header: "Teacher",
        // Staff get a face for the same reason pupils do: a directory is
        // scanned, not read.
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <PersonAvatar name={row.original.user.name} />
            <div className="min-w-0">
              <Link
                href={`/schools/teachers/${row.original.id}`}
                className="block truncate font-medium text-[var(--text-link)] hover:underline"
              >
                {row.original.user.name}
              </Link>
              <div className="truncate font-mono text-sm text-[var(--text-muted)]">
                {row.original.employeeCode} / {row.original.user.email}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "department",
        header: "Department",
        cell: ({ row }) => row.original.department || "—",
      },
      {
        id: "roles",
        header: "Profile Flags",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.isClassTeacher ? <Badge tone="brand">Class Teacher</Badge> : null}
            {row.original.isHod ? <Badge tone="info">HOD</Badge> : null}
            {!row.original.isClassTeacher && !row.original.isHod ? (
              <Badge tone="neutral">General</Badge>
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
        // In the list rather than on a detail page: the useful question is
        // "which of my staff are not joined up", and that is only answerable
        // from here.
        id: "hr",
        header: "HR record",
        cell: ({ row }) => <EmployeeLinkCell profile={row.original} />,
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) => (
          <Badge tone={row.original.isActive ? "success" : "neutral"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.teachers"
            verbs={[
              { label: "Edit", action: "edit", onSelect: () => editTeacher(row.original) },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading:
                  deleteTeacher.isPending && deleteTeacher.variables?.id === row.original.id,
                unavailable:
                  row.original._count.assignments > 0
                    ? "Remove their assignments first — a teacher with lessons against them cannot be deleted."
                    : undefined,
                confirm: {
                  title: `Delete ${row.original.user.name}'s profile?`,
                  description:
                    "The school stops seeing them as a teacher. Their staff account and their HR record are untouched — turn the profile off instead if they have simply left.",
                  confirmLabel: "Delete the profile",
                },
                onSelect: () => deleteTeacher.mutate(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [editTeacher, deleteTeacher],
  );

  const subjectColumns = useMemo<ColumnDef<TeacherSubjectRecord>[]>(
    () => [
      {
        id: "subject",
        header: "Subject",
        // Name first: the list is sorted by name, and leading with the code
        // made an alphabetical list look arbitrary.
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.name}</div>
            <div className="font-mono text-sm text-[var(--text-muted)]">
              {row.original.code}
            </div>
          </div>
        ),
      },
      {
        id: "core",
        header: "Core",
        cell: ({ row }) => (
          <Badge tone={row.original.isCore ? "brand" : "neutral"}>
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
          <Badge tone={row.original.isActive ? "success" : "neutral"}>
            {row.original.isActive ? "Active" : "Retired"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <RecordActions
            // Amending a subject is `schools.academics`, which is what
            // `/api/v2/schools/subjects/[id]` checks. Creating one is
            // `schools.teachers`. See the note at the top of the file.
            resource="schools.academics"
            verbs={[
              { label: "Edit", action: "edit", onSelect: () => editSubject(row.original) },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading:
                  deleteSubject.isPending && deleteSubject.variables?.id === row.original.id,
                unavailable:
                  row.original._count.classSubjects > 0
                    ? "It is on a timetable. Turn it off with Edit instead — the marks recorded in it stay readable."
                    : undefined,
                confirm: {
                  title: `Delete ${row.original.name}?`,
                  description:
                    "The subject leaves the syllabus entirely. A subject the school has simply stopped offering should be turned off instead, so its results stay readable.",
                  confirmLabel: "Delete the subject",
                },
                onSelect: () => deleteSubject.mutate(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [editSubject, deleteSubject],
  );

  const assignmentColumns = useMemo<ColumnDef<TeacherAssignmentRecord>[]>(
    () => [
      {
        id: "teacher",
        header: "Teacher",
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/schools/teachers/${row.original.teacherProfile.id}`}
              className="block truncate font-medium text-[var(--text-link)] hover:underline"
            >
              {row.original.teacherProfile.user.name}
            </Link>
            <div className="font-mono text-sm text-[var(--text-muted)]">
              {row.original.teacherProfile.employeeCode}
            </div>
          </div>
        ),
      },
      {
        id: "classSubject",
        header: "Class / Subject",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">
              {row.original.class.name}
              {row.original.stream ? ` / ${row.original.stream.name}` : ""}
            </div>
            <div className="truncate text-sm text-[var(--text-muted)]">
              {row.original.subject.code} — {row.original.subject.name}
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
          <Badge tone={row.original.isActive ? "success" : "neutral"}>
            {row.original.isActive ? "Active" : "Retired"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.teachers"
            verbs={[
              {
                label: "Edit",
                action: "edit",
                onSelect: () => editAssignment(row.original),
              },
              {
                label: "Remove",
                action: "archive",
                tone: "danger",
                loading:
                  deleteAssignment.isPending &&
                  deleteAssignment.variables?.id === row.original.id,
                confirm: {
                  title: "Remove this assignment?",
                  description: `${row.original.teacherProfile.user.name} stops teaching ${row.original.subject.name} to ${row.original.class.name}. Marks recorded against the lesson go with it — turn it off instead if the term simply ended.`,
                  confirmLabel: "Remove the assignment",
                },
                onSelect: () => deleteAssignment.mutate(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [editAssignment, deleteAssignment],
  );

  /* ── the page ──────────────────────────────────────────────────────── */

  const yearGroupOptions = classes.map((entry) => ({
    value: entry.id,
    label: entry.name,
  }));
  const subjectFilterOptions = (allSubjectsQuery.data?.data ?? []).map((subject) => ({
    value: subject.id,
    label: subject.name,
  }));

  const profileFilters = [
    profileActive === "active" ? "Active" : profileActive === "inactive" ? "Inactive" : null,
    department || null,
  ].filter((value): value is string => Boolean(value));

  const assignmentFilters = [
    assignmentClassId
      ? yearGroupOptions.find((option) => option.value === assignmentClassId)?.label
      : null,
    assignmentSubjectId
      ? subjectFilterOptions.find((option) => option.value === assignmentSubjectId)?.label
      : null,
    assignmentActive === "active"
      ? "Active"
      : assignmentActive === "inactive"
        ? "Retired"
        : null,
  ].filter((value): value is string => Boolean(value));

  const loadError =
    profilesQuery.error ??
    subjectsQuery.error ??
    assignmentsQuery.error ??
    // The tally is not a table, but it is the band's two numbers and the whole
    // department dropdown. A page that silently reports "0 on the staff list"
    // because a count failed is worse than one that says the count failed.
    staffTallyQuery.error ??
    null;

  return (
    <div className="space-y-4">
      <PageHeading
        title="Teachers"
        description={
          staffTallyQuery.isPending
            ? undefined
            : `${tally.total.toLocaleString()} on the staff list`
        }
        primaryAction={
          <CreateButton
            resource="schools.teachers"
            label="Add a teacher"
            onSelect={() => setTeacherDialog(EMPTY_TEACHER)}
          />
        }
      />

      <PageBand
        chips={[
          { label: "Active", value: tally.active.toLocaleString(), tone: "success" },
          { label: "No HR record", value: tally.withoutHr.toLocaleString(), tone: "warn" },
        ]}
        actions={
          <RecordActions
            resource="schools.teachers"
            verbs={[
              {
                label: "Add a subject",
                action: "create",
                onSelect: () => setSubjectDialog(EMPTY_SUBJECT),
              },
              {
                label: "Allocate a teacher",
                action: "create",
                unavailable:
                  subjects.length === 0 || allProfiles.length === 0
                    ? "There has to be a subject and a teacher to put together."
                    : undefined,
                onSelect: () => {
                  setAllocateError(null);
                  setAllocateResult(null);
                  setAllocateOpen(true);
                },
              },
            ]}
          />
        }
      />

      {loadError ? (
        <LoadError
          what="teacher management"
          error={loadError}
          onRetry={() => {
            void profilesQuery.refetch();
            void subjectsQuery.refetch();
            void assignmentsQuery.refetch();
            void staffTallyQuery.refetch();
          }}
        />
      ) : null}

      {/*
        The three deletes each disable themselves when the endpoint would
        refuse — a teacher with lessons, a subject on a timetable. What is left
        is the refusal nobody could predict from the row: a dependency created
        in another tab, a permission changed under the reader. Named separately
        rather than as one "that did not save", because a page with three
        tables needs to say which one.
      */}
      {deleteTeacher.error ? (
        <SaveError what="That teacher's profile" error={deleteTeacher.error} />
      ) : null}
      {deleteSubject.error ? (
        <SaveError what="That subject" error={deleteSubject.error} />
      ) : null}
      {deleteAssignment.error ? (
        <SaveError what="That assignment" error={deleteAssignment.error} />
      ) : null}

      <VerticalDataViews
        items={[
          { id: "profiles", label: "Teacher Profiles", count: tally.total },
          { id: "subjects", label: "Subjects", count: subjects.length },
          { id: "assignments", label: "Assignments", count: assignments.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as TeachersView)}
        railLabel="Teacher Views"
      >
        <div className={activeView === "profiles" ? "space-y-3" : "hidden"}>
          <FilterBar>
            <FilterSelect
              label="Status"
              allLabel="Everyone"
              value={profileActive}
              options={ACTIVE_OPTIONS}
              onChange={(value) => setProfileActive(value as ActiveFilter)}
            />
            <FilterSelect
              label="Department"
              allLabel="Every department"
              value={department}
              options={departmentOptions}
              onChange={setDepartment}
            />
          </FilterBar>
          <DataTable
            data={profiles}
            columns={profileColumns}
            searchPlaceholder="Search teacher profiles"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            mobileListRenderer={({ rows }) => (
              <MobileList>
                {rows.length === 0 ? (
                  <MobileListEmpty>
                    {profilesQuery.isPending ? "Loading profiles…" : "No profiles found."}
                  </MobileListEmpty>
                ) : (
                  rows.map(({ row }) => (
                    <MobileList.Row
                      key={row.id}
                      title={row.user.name ?? row.employeeCode}
                      subtitle={[
                        row.employeeCode,
                        row.department,
                        row.employee ? `HR ${row.employee.employeeId}` : "No HR record",
                        row.isHod ? "HOD" : null,
                        row.isClassTeacher ? "Class teacher" : null,
                        row.isActive ? null : "Inactive",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      onClick={() => {
                        window.location.href = `/schools/teachers/${row.id}`;
                      }}
                    />
                  ))
                )}
              </MobileList>
            )}
            emptyState={
              profilesQuery.isPending ? (
                <TableRowsSkeleton
                  columns={[
                    { avatar: true, twoLine: true },
                    { width: 140 },
                    { width: 185 },
                    { width: 95 },
                    { width: 195 },
                    { width: 85 },
                  ]}
                />
              ) : profileFilters.length > 0 ? (
                <NothingMatched
                  what="teachers"
                  filters={profileFilters}
                  onClear={() => {
                    setProfileActive("");
                    setDepartment("");
                  }}
                />
              ) : (
                <NothingYet
                  title="No teacher profiles yet"
                  body="A staff account becomes a teacher here. Until it does, nobody can be put in front of a class, mark a register or enter a result."
                  action={
                    <CreateButton
                      resource="schools.teachers"
                      label="Add a teacher"
                      onSelect={() => setTeacherDialog(EMPTY_TEACHER)}
                    />
                  }
                />
              )
            }
          />
        </div>

        <div className={activeView === "subjects" ? "space-y-3" : "hidden"}>
          <FilterBar>
            <FilterSelect
              label="Status"
              allLabel="All subjects"
              value={subjectActive}
              options={TAUGHT_OPTIONS}
              onChange={(value) => setSubjectActive(value as ActiveFilter)}
            />
          </FilterBar>
          <DataTable
            data={subjects}
            columns={subjectColumns}
            searchPlaceholder="Search subjects"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            mobileListRenderer={({ rows }) => (
              <MobileList>
                {rows.length === 0 ? (
                  <MobileListEmpty>
                    {subjectsQuery.isPending ? "Loading subjects…" : "No subjects found."}
                  </MobileListEmpty>
                ) : (
                  rows.map(({ row }) => (
                    <MobileList.Row
                      key={row.id}
                      static
                      title={row.name}
                      subtitle={[
                        row.code,
                        row.isCore ? "Core" : "Optional",
                        `Pass ${row.passMark}%`,
                        row.isActive ? null : "Retired",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ))
                )}
              </MobileList>
            )}
            emptyState={
              subjectsQuery.isPending ? (
                <TableRowsSkeleton
                  columns={[{ twoLine: true }, { width: 90 }, { width: 110 }, { width: 110 }, { width: 90 }]}
                />
              ) : subjectActive !== "" ? (
                <NothingMatched
                  what="subjects"
                  filters={[subjectActive === "active" ? "Still taught" : "Retired"]}
                  onClear={() => setSubjectActive("")}
                />
              ) : (
                <NothingYet
                  title="No subjects yet"
                  body="A subject is what a lesson, a mark sheet and a report card are all about. Nothing can be timetabled until one exists."
                  action={
                    <CreateButton
                      resource="schools.teachers"
                      label="Add a subject"
                      onSelect={() => setSubjectDialog(EMPTY_SUBJECT)}
                    />
                  }
                />
              )
            }
          />
        </div>

        <div className={activeView === "assignments" ? "space-y-3" : "hidden"}>
          <FilterBar>
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={assignmentClassId}
              options={yearGroupOptions}
              onChange={setAssignmentClassId}
            />
            <FilterSelect
              label="Subject"
              allLabel="Every subject"
              value={assignmentSubjectId}
              options={subjectFilterOptions}
              onChange={setAssignmentSubjectId}
            />
            <FilterSelect
              label="Status"
              allLabel="Everyone"
              value={assignmentActive}
              options={TAUGHT_OPTIONS}
              onChange={(value) => setAssignmentActive(value as ActiveFilter)}
            />
          </FilterBar>
          <DataTable
            data={assignments}
            columns={assignmentColumns}
            searchPlaceholder="Search assignments"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            rowGroup={(row) => ({
              key: `${row.class.id}:${row.stream?.id ?? ""}`,
              label: row.stream
                ? `${row.class.name} · ${row.stream.name}`
                : row.class.name,
            })}
            mobileListRenderer={({ rows }) => (
              <MobileList>
                {rows.length === 0 ? (
                  <MobileListEmpty>
                    {assignmentsQuery.isPending
                      ? "Loading assignments…"
                      : "No assignments found."}
                  </MobileListEmpty>
                ) : (
                  rows.map(({ row }) => (
                    <MobileList.Row
                      key={row.id}
                      static
                      title={`${row.subject.code} — ${row.subject.name}`}
                      subtitle={[
                        row.class.name,
                        row.stream?.name,
                        row.teacherProfile?.user.name,
                        row.term.name,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ))
                )}
              </MobileList>
            )}
            emptyState={
              assignmentsQuery.isPending ? (
                <TableRowsSkeleton
                  columns={[
                    { twoLine: true },
                    { twoLine: true },
                    { width: 120 },
                    { width: 110 },
                    { width: 90 },
                  ]}
                />
              ) : assignmentFilters.length > 0 ? (
                <NothingMatched
                  what="assignments"
                  filters={assignmentFilters}
                  onClear={() => {
                    setAssignmentClassId("");
                    setAssignmentSubjectId("");
                    setAssignmentActive("");
                  }}
                />
              ) : (
                <NothingYet
                  title="Nothing timetabled yet"
                  body="An assignment is one line of the timetable: who teaches what, to which form, in which term."
                  action={
                    <CreateButton
                      resource="schools.teachers"
                      label="Add an assignment"
                      onSelect={() => setAssignmentDialog(EMPTY_ASSIGNMENT)}
                    />
                  }
                />
              )
            }
          />
        </div>
      </VerticalDataViews>

      <TeacherFormDialog
        open={teacherDialog !== null}
        onOpenChange={(open) => {
          if (!open) setTeacherDialog(null);
        }}
        initial={teacherDialog ?? EMPTY_TEACHER}
      />

      <SubjectFormDialog
        open={subjectDialog !== null}
        onOpenChange={(open) => {
          if (!open) setSubjectDialog(null);
        }}
        initial={subjectDialog ?? EMPTY_SUBJECT}
      />

      <AssignmentFormDialog
        open={assignmentDialog !== null}
        onOpenChange={(open) => {
          if (!open) setAssignmentDialog(null);
        }}
        initial={assignmentDialog ?? EMPTY_ASSIGNMENT}
      />

      <BulkAllocationSheet
        open={allocateOpen}
        onOpenChange={(open) => {
          setAllocateOpen(open);
          if (!open) {
            setAllocateError(null);
            setAllocateResult(null);
          }
        }}
        subjects={subjects}
        teachers={allProfiles}
        classes={classes}
        isSubmitting={allocate.isPending}
        error={allocateError}
        result={allocateResult}
        onSubmit={(values) => allocate.mutate(values)}
      />
    </div>
  );
}
