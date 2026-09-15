"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, MobileList, MobileListEmpty } from "@corelithzw/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageChrome } from "@/components/layout/page-chrome";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PageBand } from "@/components/schools/common/page-band";
import { EntityLink } from "@/components/records/entity-link";
import { RecordCell } from "@/components/records/record-table";
import { PersonCell, RecordNameCell } from "@/components/schools/common/identity-cell";
import {
  CreateButton,
  RecordActions,
  type RecordVerb,
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
} from "@/components/schools/teachers/assignment-form-dialog";
import {
  BulkAllocationSheet,
  type BulkAllocationResult,
  type BulkAllocationValues,
} from "@/components/schools/teachers/bulk-allocation-sheet";
import { DEPARTMENT_SUGGESTIONS } from "@/components/schools/teachers/departments";
import {
  EMPTY_SUBJECT,
  SubjectFormDialog,
  type SubjectFormValues,
} from "@/components/schools/teachers/subject-form-dialog";
import {
  EMPTY_TEACHER,
  TeacherFormDialog,
  type TeacherFormValues,
} from "@/components/schools/teachers/teacher-form-dialog";

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

/**
 * The staff list is the active staff unless somebody asks otherwise: the
 * endpoint defaults `isActive` to true, so there is no "everyone" to offer and
 * the unfiltered choice is named for what it actually returns. Archived is how
 * a teacher who has left is found again, and brought back.
 */
const STAFF_OPTIONS = [{ value: "inactive", label: "Archived" }];

const TAUGHT_OPTIONS = [
  { value: "active", label: "Still taught" },
  { value: "inactive", label: "Retired" },
];

function activeParam(filter: ActiveFilter) {
  return filter === "" ? undefined : filter === "active";
}

export function SchoolsTeachersContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
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
   * The staff as a whole, for the band's two numbers and the department list.
   * The filtered query cannot supply either: a page narrowed to the archived
   * would report seven staff and offer one department.
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
    /*
     * Faculty order, not alphabetical order.
     *
     * A staff list is read the way a timetable is grouped — Mathematics,
     * Languages, Sciences, Humanities — and an alphabetical dropdown that
     * opens on "Commercials" makes somebody hunt for the department they were
     * already thinking of. Anything the school named for itself and this list
     * has never heard of keeps its alphabetical place after the known ones,
     * because inventing a position for it would be a guess.
     */
    const rank = (value: string) => {
      const index = DEPARTMENT_SUGGESTIONS.indexOf(
        value as (typeof DEPARTMENT_SUGGESTIONS)[number],
      );
      return index === -1 ? DEPARTMENT_SUGGESTIONS.length : index;
    };
    return [...seen]
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map((value) => ({ value, label: value }));
  }, [allProfiles]);

  const tally = useMemo(
    () => ({
      total: allProfiles.length,
      withoutHr: allProfiles.filter((profile) => !profile.employee).length,
    }),
    [allProfiles],
  );

  /* ── the verbs ─────────────────────────────────────────────────────── */

  /**
   * Taking somebody off the staff list turns the profile off rather than
   * destroying it: their timetable, their marks and their registers are the
   * school's record of terms already taught, and a teacher who has left is not
   * a teacher who was never there. `DELETE` is the route's name for it.
   */
  const archiveTeacher = useMutation({
    mutationFn: (profile: TeacherProfileRecord) =>
      fetchJson(`/api/v2/schools/teachers/profiles/${profile.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
    },
  });

  const reinstateTeacher = useMutation({
    mutationFn: (profile: TeacherProfileRecord) =>
      fetchJson(`/api/v2/schools/teachers/profiles/${profile.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: true }),
      }),
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
        // scanned, not read. The employee code is the supporting line because
        // it is the half that is unique; the email moved to a column of its
        // own, because an address is somewhere you can write TO and a code is
        // something you compare — setting the two in one mono grey run said
        // they were the same kind of fact.
        cell: ({ row }) => (
          <PersonCell
            kind="teacher"
            href={`/schools/teachers/${row.original.id}`}
            name={row.original.user.name}
            reference={row.original.employeeCode}
            context={row.original.department || undefined}
          />
        ),
      },
      {
        id: "email",
        header: "Email",
        cell: ({ row }) => <RecordCell kind="email" value={row.original.user.email} />,
      },
      {
        id: "department",
        header: "Department",
        cell: ({ row }) => row.original.department || "—",
      },
      {
        // Off by default: two flags out of a possible two, on a table that
        // already carries a department, a count and an HR state. Whoever wants
        // them turns the column on from Columns.
        id: "roles",
        header: "Profile flags",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.isClassTeacher ? <Badge tone="brand">Class teacher</Badge> : null}
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
        // from here. The badge is the whole cell and it is the link — the
        // button beside it repeated "Find the employee" down every row, and
        // the joining itself wants the room the record page has.
        id: "hr",
        header: "HR record",
        cell: ({ row }) => (
          <Link href={`/schools/teachers/${row.original.id}`}>
            <Badge tone={row.original.employee ? "success" : "warn"}>
              {row.original.employee?.employeeId ?? "No HR record"}
            </Badge>
          </Link>
        ),
      },
      {
        id: "active",
        header: "Status",
        // One word for one state across the screen: the filter offers Archived,
        // so the row cannot answer "Inactive".
        cell: ({ row }) => (
          <Badge tone={row.original.isActive ? "success" : "neutral"}>
            {row.original.isActive ? "Active" : "Archived"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const profile = row.original;
          const verbs: RecordVerb[] = [
            { label: "Edit", action: "edit", onSelect: () => editTeacher(profile) },
          ];
          if (!profile.employee) {
            verbs.push({
              label: "Find the employee",
              action: "edit",
              onSelect: () => router.push(`/schools/teachers/${profile.id}`),
            });
          }
          verbs.push(
            profile.isActive
              ? {
                  label: "Archive",
                  action: "archive",
                  tone: "warning",
                  loading:
                    archiveTeacher.isPending &&
                    archiveTeacher.variables?.id === profile.id,
                  confirm: {
                    title: `Archive ${profile.user.name}?`,
                    description:
                      "They come off the staff list and out of every picker, and their staff account and HR record are untouched. Everything they have already taught, marked and registered stays where it is, and Archived in the status filter brings them back.",
                    confirmLabel: "Archive the profile",
                  },
                  onSelect: () => archiveTeacher.mutate(profile),
                }
              : {
                  // Reinstating is a PATCH of one field, and the route checks
                  // `edit` for it — so the button asks the same question.
                  label: "Bring them back",
                  action: "edit",
                  loading:
                    reinstateTeacher.isPending &&
                    reinstateTeacher.variables?.id === profile.id,
                  onSelect: () => reinstateTeacher.mutate(profile),
                },
          );
          return (
            <div className="flex justify-end">
              <RecordActions
                layout="menu"
                resource="schools.teachers"
                label={`Actions for ${profile.user.name}`}
                verbs={verbs}
              />
            </div>
          );
        },
      },
    ],
    [editTeacher, archiveTeacher, reinstateTeacher, router],
  );

  const subjectColumns = useMemo<ColumnDef<TeacherSubjectRecord>[]>(
    () => [
      {
        id: "subject",
        header: "Subject",
        // Name first: the list is sorted by name, and leading with the code
        // made an alphabetical list look arbitrary.
        cell: ({ row }) => (
          <RecordNameCell
            kind="subject"
            href={`/management/master-data/schools/subjects/${row.original.id}`}
            name={row.original.name}
            reference={row.original.code}
          />
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
        header: "Pass mark",
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
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            {/* Amending a subject is `schools.academics`, which is what
                `/api/v2/schools/subjects/[id]` checks. Creating one is
                `schools.teachers`. See the note at the top of the file. */}
            <RecordActions
              layout="menu"
              resource="schools.academics"
              label={`Actions for ${row.original.name}`}
              verbs={[
                {
                  label: "Edit",
                  action: "edit",
                  onSelect: () => editSubject(row.original),
                },
                {
                  label: "Delete",
                  action: "archive",
                  tone: "danger",
                  loading:
                    deleteSubject.isPending &&
                    deleteSubject.variables?.id === row.original.id,
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
          </div>
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
          <PersonCell
            kind="teacher"
            href={`/schools/teachers/${row.original.teacherProfile.id}`}
            name={row.original.teacherProfile.user.name}
            reference={row.original.teacherProfile.employeeCode}
          />
        ),
      },
      {
        id: "classSubject",
        header: "Class / subject",
        // Both halves are records, so both are links: an assignment is the
        // edge between them, and the question after "who teaches this" is
        // almost always about one end of it.
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium">
              <EntityLink
                href={`/management/master-data/schools/classes/${row.original.class.id}`}
              >
                {row.original.class.name}
                {row.original.stream ? ` / ${row.original.stream.name}` : ""}
              </EntityLink>
            </span>
            <span className="acct-caption block truncate font-mono">
              <EntityLink
                href={`/management/master-data/schools/subjects/${row.original.subject.id}`}
                muted
              >
                {row.original.subject.code} — {row.original.subject.name}
              </EntityLink>
            </span>
          </span>
        ),
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.term.name,
      },
      {
        id: "passMark",
        header: "Pass mark",
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
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RecordActions
              layout="menu"
              resource="schools.teachers"
              label={`Actions for ${row.original.teacherProfile.user.name}, ${row.original.subject.name}`}
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
          </div>
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
    profileActive === "inactive" ? "Archived" : null,
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
      <PageChrome title="Teaching staff">
        <CreateButton
          resource="schools.teachers"
          label="Add a teacher"
          onSelect={() => setTeacherDialog(EMPTY_TEACHER)}
        />
      </PageChrome>

      <PageBand
        chips={[
          { label: "On the staff", value: tally.total.toLocaleString(), tone: "success" },
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
      {archiveTeacher.error ? (
        <SaveError what="That teacher's profile" error={archiveTeacher.error} />
      ) : null}
      {reinstateTeacher.error ? (
        <SaveError what="That teacher's profile" error={reinstateTeacher.error} />
      ) : null}
      {deleteSubject.error ? (
        <SaveError what="That subject" error={deleteSubject.error} />
      ) : null}
      {deleteAssignment.error ? (
        <SaveError what="That assignment" error={deleteAssignment.error} />
      ) : null}

      <VerticalDataViews
        items={[
          // No count: the band above already says how many are on the staff.
          { id: "profiles", label: "Teacher profiles" },
          { id: "subjects", label: "Subjects", count: subjects.length },
          { id: "assignments", label: "Assignments", count: assignments.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as TeachersView)}
        railLabel="Teacher views"
      >
        <div className={activeView === "profiles" ? "space-y-3" : "hidden"}>
          <DataTable
            data={profiles}
            columns={profileColumns}
            initialColumnVisibility={{ roles: false }}
            searchPlaceholder="Search teacher profiles"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            /* Narrowing is answered in one row. The filters sat on a row of
               their own above the search box, so the same question was asked
               in two places a band apart. */
            toolbar={
              <>
                <FilterSelect
                  label="Status"
                  allLabel="On the staff"
                  value={profileActive}
                  options={STAFF_OPTIONS}
                  onChange={(value) => setProfileActive(value as ActiveFilter)}
                />
                <FilterSelect
                  label="Department"
                  allLabel="Every department"
                  value={department}
                  options={departmentOptions}
                  onChange={setDepartment}
                />
              </>
            }
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
                        row.isActive ? null : "Archived",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      trailing={
                        <span className="font-mono text-xs tabular-nums">
                          {row._count.assignments}
                        </span>
                      }
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
                  headers={[
                    "Teacher",
                    "Email",
                    "Department",
                    "Assignments",
                    "HR record",
                    "Status",
                  ]}
                  columns={[
                    { avatar: true, twoLine: true },
                    { width: 185 },
                    { width: 140 },
                    { width: 95, align: "right" },
                    { width: 140, badge: true },
                    { width: 85, badge: true },
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
          <DataTable
            data={subjects}
            columns={subjectColumns}
            searchPlaceholder="Search subjects"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <FilterSelect
                label="Status"
                allLabel="All subjects"
                value={subjectActive}
                options={TAUGHT_OPTIONS}
                onChange={(value) => setSubjectActive(value as ActiveFilter)}
              />
            }
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
                        `Pass mark ${row.passMark}%`,
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
                  headers={["Subject", "Core", "Pass mark", "Assignments", "Active"]}
                  columns={[
                    { avatar: true, twoLine: true },
                    { width: 90, badge: true },
                    { width: 110, align: "right" },
                    { width: 110, align: "right" },
                    { width: 90, badge: true },
                  ]}
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
          <DataTable
            data={assignments}
            columns={assignmentColumns}
            searchPlaceholder="Search assignments"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            toolbar={
              <>
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
                {/* This list is every lesson that HAS a teacher. The question
                    it cannot answer is the one an office asks in the first
                    week — which lesson has nobody against it — and the only
                    screen that answers it had nothing but the sidebar pointing
                    at it. Labelled for what it is for rather than for what it
                    contains. */}
                <Button asChild variant="secondary" size="sm">
                  <Link href="/schools/teachers/assignments">Find the gaps</Link>
                </Button>
              </>
            }
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
                  headers={["Teacher", "Class / subject", "Term", "Pass mark", "Active"]}
                  columns={[
                    { avatar: true, twoLine: true },
                    { twoLine: true },
                    { width: 120 },
                    { width: 110, align: "right" },
                    { width: 90, badge: true },
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
