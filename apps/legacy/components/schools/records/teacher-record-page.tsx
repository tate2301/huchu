"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { RecordAttributes, type RecordAttribute } from "@corelithzw/module-records/components/record-attributes";
import { RecordMark } from "@corelithzw/module-records/components/record-mark";
import {
  RailSection,
  RecordPageShell,
  RelatedList,
  type RecordTab,
} from "@corelithzw/module-records/components/record-page-shell";
import {
  SubjectFiles,
  SubjectNotes,
  type SubjectFile,
  type SubjectNote,
} from "@corelithzw/module-records/components/subject-tabs";
import { useAttributeEditor } from "@corelithzw/module-records/components/use-attribute-editor";
import { RecordActions } from "@/components/schools/common/record-actions";
import { FilterSelect } from "@/components/schools/common/filter-select";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  RecordNotFound,
  SaveError,
  StatsSkeleton,
} from "@/components/schools/common/states";
import { TeacherAssignmentsPanel } from "@/components/schools/teachers/teacher-assignments-panel";
import { TeacherEmployeePanel } from "@/components/schools/teachers/teacher-employee-panel";
import { ApiError, fetchJson } from "@corelithzw/platform/api-client";
import {
  Badge,
  Buildings,
  Mail,
  Payments,
  Phone,
  ToggleLeft,
  Users,
  Work,
} from "@corelithzw/ui/lib/icons";
import { recordType } from "@corelithzw/module-records/registry";

/**
 * A teacher, as a record.
 *
 * The third type, and the one with a real wrinkle. **A teacher is one person with
 * two records** — this profile, which is the school's view of them, and an
 * `Employee`, which is payroll's (S-1.7). Their name, email and phone live on the
 * `User`; their salary and contract live on the `Employee`.
 *
 * So this page edits none of those. It edits what is genuinely the school's view:
 * department, whether they hold a form, whether they are a head of department, and
 * whether they are still teaching. Name and contact details are shown read-only
 * with the reason, because putting a second editor on a fact is how two screens
 * end up disagreeing about it — which is the bug S-1.7 existed to fix.
 *
 * No custom fields tab either: `CrmFieldDefinition` accepts TEACHER, but a
 * school's own fields about staff overlap with HR's, and deciding which system
 * owns "teaching qualification" is a product call rather than a wiring one.
 *
 * What the landing view *does* edit is the timetable. It was a read-only list,
 * which made the page a poster: a head of department who could see that one of
 * nine lessons had moved to another set had to leave for the assignments table
 * and find the row again among two hundred and eighty. The HR link is here for
 * the same reason — the list has always answered "who is not joined up", and
 * the record had no way to act on the answer.
 */

type Assignment = {
  id: string;
  isActive: boolean;
  term: { id: string; code: string; name: string } | null;
  class: { id: string; code: string; name: string } | null;
  stream: { id: string; code: string; name: string } | null;
  subject: { id: string; code: string; name: string; isCore: boolean } | null;
};

type TeacherRecord = {
  id: string;
  employeeCode: string;
  department: string | null;
  isClassTeacher: boolean;
  isHod: boolean;
  isActive: boolean;
  employeeId: string | null;
  employee: { id: string; employeeId: string; name: string; jobTitle: string | null } | null;
  avatarUrl: string | null;
  accent: string | null;
  user: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    isActive: boolean;
  } | null;
  assignments: Assignment[];
};

/**
 * Whether the teacher still takes the form, or took it two terms ago. Retired
 * lessons stay on the record — a teacher whose Form 4 set ended last term still
 * taught it — so the filter is how you ask about now.
 */
const CLASS_OPTIONS = [
  { value: "current", label: "Still teaching" },
  { value: "past", label: "No longer teaching" },
];

export function TeacherRecordPage({ teacherId }: { teacherId: string }) {
  const config = recordType("TEACHER");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("assignments");
  const [classFilter, setClassFilter] = useState("");

  const query = useQuery({
    queryKey: config.queryKey(teacherId),
    queryFn: () => fetchJson<TeacherRecord>(config.apiPath(teacherId)),
  });

  const edit = useAttributeEditor({
    path: config.apiPath(teacherId),
    invalidate: [config.queryKey(teacherId), ["schools", "teachers"]],
  });

  const notes = useQuery({
    queryKey: ["records", "comments", "TEACHER", teacherId],
    queryFn: () =>
      fetchJson<{ data: SubjectNote[] }>(
        `/api/v2/records/comments?subjectType=TEACHER&subjectId=${teacherId}`,
      ),
  });

  const files = useQuery({
    queryKey: ["records", "files", "TEACHER", teacherId],
    queryFn: () =>
      fetchJson<{ data: SubjectFile[] }>(
        `/api/v2/records/files?subjectType=TEACHER&subjectId=${teacherId}`,
      ),
  });

  // The profile route rather than this record's own PATCH route: only
  // `teachers/profiles/[id]` carries a DELETE, and it refuses while lessons
  // are still against the teacher.
  const remove = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/schools/teachers/profiles/${teacherId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
      router.push(config.indexHref);
    },
  });

  const teacher = query.data ?? null;

  const attributes = useMemo<RecordAttribute[]>(() => {
    if (!teacher) return [];
    // A mark on every row, and one that means something. The property list
    // falls back to a generic tag for a row that names no icon, so a page that
    // named none at all came out as a column of identical glyphs — which is
    // the ragged column the fallback exists to avoid, drawn the other way up.
    return [
      {
        id: "department",
        label: "Department",
        icon: Buildings,
        ...edit.text("department", teacher.department ?? ""),
      },
      {
        id: "role",
        label: "Role",
        icon: Work,
        ...edit.choice("isHod", String(teacher.isHod), [
          { value: "false", label: "Teacher" },
          { value: "true", label: "Head of department" },
        ]),
      },
      {
        id: "classTeacher",
        label: "Holds a form",
        icon: Users,
        ...edit.choice("isClassTeacher", String(teacher.isClassTeacher), [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]),
      },
      {
        id: "isActive",
        label: "Teaching",
        icon: ToggleLeft,
        ...edit.choice("isActive", String(teacher.isActive), [
          { value: "true", label: "Currently teaching" },
          { value: "false", label: "Not teaching" },
        ]),
      },
      // Read-only, and the labels say whose they are. A teacher is one person
      // with two records (S-1.7); a second editor on a shared fact is how the
      // two disagree.
      {
        id: "email",
        label: "Email (account)",
        icon: Mail,
        display: teacher.user?.email ?? "—",
      },
      {
        id: "phone",
        label: "Phone (account)",
        icon: Phone,
        display: teacher.user?.phone ?? "—",
      },
      {
        id: "employeeCode",
        label: "Staff number",
        icon: Badge,
        mono: true,
        display: teacher.employeeCode,
      },
      {
        id: "employee",
        label: "Payroll record",
        icon: Payments,
        display: teacher.employeeId ? "Linked" : "Not linked",
      },
    ];
  }, [teacher, edit]);

  if (query.isPending) {
    return (
      // Mirrors the record: the standing column with the mark and the property
      // list, the glance tiles under it, and the timetable panel beside them.
      <div
        className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]"
        data-testid="teacher-record-loading"
      >
        <div className="space-y-4">
          <CardsSkeleton count={1} columns={1} lines={6} />
          <StatsSkeleton count={3} />
        </div>
        <CardsSkeleton count={4} columns={1} lines={2} />
      </div>
    );
  }

  if (query.isError || !teacher) {
    // A teacher whose profile was deleted is a stale link, not a fault. Only a
    // 404 means "gone" — everything else is a read that has to be retried, and
    // sending somebody back to the staff list would lose the record they were
    // actually looking at.
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return notFound ? (
      <RecordNotFound
        what="That teacher"
        backHref={config.indexHref}
        backLabel="Back to the teachers"
      />
    ) : (
      <LoadError
        what="this teacher's record"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const name = teacher.user?.name ?? teacher.user?.email ?? "Teacher";
  const assignments = teacher.assignments ?? [];

  /**
   * The classes this teacher stands in front of, one row each.
   *
   * The rail has counted them since the page existed and there was no way to
   * open one — a head of department reading "Classes 5" had to go back out to
   * the class list and find all five by name. Distinct, because a teacher who
   * takes a form for three subjects is in front of one class, not three.
   */
  const classRows = [
    ...new Map(
      assignments
        .filter((assignment) => assignment.class)
        .map((assignment) => [
          assignment.class!.id,
          {
            id: assignment.class!.id,
            name: assignment.class!.name,
            streamName: assignment.stream?.name ?? null,
            subjects: assignments
              .filter((other) => other.class?.id === assignment.class!.id)
              .map((other) => other.subject?.code)
              .filter((code): code is string => Boolean(code)),
            anyActive: assignments.some(
              (other) => other.class?.id === assignment.class!.id && other.isActive,
            ),
          },
        ]),
    ).values(),
  ];

  const visibleClasses = classRows.filter((row) => {
    if (classFilter === "current") return row.anyActive;
    if (classFilter === "past") return !row.anyActive;
    return true;
  });


  const tabs: RecordTab[] = [
    {
      value: "assignments",
      label: "Teaches",
      count: assignments.length,
      // The landing view: the timetable, editable, and whether payroll knows
      // this person exists — the two things a record page is opened to settle.
      content: (
        <div className="space-y-4">
          <TeacherAssignmentsPanel
            teacherProfileId={teacherId}
            teacherName={name}
          />
          <TeacherEmployeePanel
            teacherProfileId={teacherId}
            teacherName={name}
            employee={teacher.employee}
          />
        </div>
      ),
    },
    {
      value: "classes",
      label: "Classes",
      count: classRows.length,
      content:
        classRows.length === 0 ? (
          <NothingYet
            title="This teacher is not in front of a class"
            body="A class appears here once a subject is timetabled to them. Add an assignment on the Teaches tab and the form it is against shows up."
          />
        ) : (
          <div className="space-y-3">
            {/* A teacher on their fourth year carries forms they stopped taking
                two terms ago, and the useful question is which they have now. */}
            {classRows.length > 3 ? (
              <FilterSelect
                label="Class"
                allLabel="Every class"
                value={classFilter}
                options={CLASS_OPTIONS}
                onChange={setClassFilter}
              />
            ) : null}

            {visibleClasses.length === 0 ? (
              <NothingMatched
                what="classes"
                filters={[
                  CLASS_OPTIONS.find((option) => option.value === classFilter)?.label ?? "",
                ].filter(Boolean)}
                onClear={() => setClassFilter("")}
              />
            ) : (
              <RelatedList
                items={visibleClasses}
                emptyMessage="This teacher is not in front of a class."
                renderItem={(row) => ({
                  href: recordType("CLASS").href(row.id),
                  title: row.streamName ? `${row.name} · ${row.streamName}` : row.name,
                  subtitle: row.subjects.join(" · ") || null,
                  meta: row.anyActive ? undefined : "Retired",
                })}
              />
            )}
          </div>
        ),
    },
    {
      value: "notes",
      label: "Notes",
      count: notes.data?.data?.length ?? 0,
      // Scoped to the tab. A Notes read that failed must not take the timetable
      // down with it — that is the half of the page somebody came for.
      content: notes.error ? (
        <LoadError
          what="this teacher's notes"
          error={notes.error}
          onRetry={() => void notes.refetch()}
        />
      ) : (
        <SubjectNotes
          subject={{ type: "TEACHER", id: teacherId }}
          notes={notes.data?.data ?? []}
          isPending={notes.isPending}
        />
      ),
    },
    {
      value: "files",
      label: "Files",
      count: files.data?.data?.length ?? 0,
      content: files.error ? (
        <LoadError
          what="this teacher's files"
          error={files.error}
          onRetry={() => void files.refetch()}
        />
      ) : (
        <SubjectFiles files={files.data?.data ?? []} isPending={files.isPending} />
      ),
    },
  ];

  // Distinct subjects and classes, because "teaches 3 subjects across 5 classes"
  // is what a timetabler wants and a count of assignment rows is not.
  const subjects = new Set(assignments.map((a) => a.subject?.id).filter(Boolean));
  const classes = new Set(assignments.map((a) => a.class?.id).filter(Boolean));

  return (
    <RecordPageShell
      backHref={config.indexHref}
      backLabel={config.labelPlural}
      title={name}
      reference={teacher.employeeCode}
      subtitle={
        [
          teacher.department,
          teacher.isHod ? "Head of department" : null,
          teacher.isClassTeacher ? "Form teacher" : null,
          teacher.isActive ? null : "Not teaching",
        ]
          .filter(Boolean)
          .join(" · ") || null
      }
      leading={
        <RecordMark
          kind={config.kind}
          name={name}
          avatarUrl={teacher.avatarUrl}
          accent={teacher.accent}
          size="lg"
        />
      }
      primaryAction={
        <RecordActions
          resource="schools.teachers"
          verbs={[
            {
              label: "Delete",
              action: "archive",
              tone: "danger",
              loading: remove.isPending,
              unavailable:
                assignments.length > 0
                  ? "Remove their assignments first — a teacher with lessons against them cannot be deleted."
                  : undefined,
              confirm: {
                title: `Delete ${name}'s profile?`,
                description:
                  "The school stops seeing them as a teacher. Their staff account and their HR record are untouched — turn the profile off instead if they have simply left.",
                confirmLabel: "Delete the profile",
              },
              onSelect: () => remove.mutate(),
            },
          ]}
        />
      }
      attributes={
        <div className="space-y-3">
          {/* Two writes, two sentences. The delete is refused while lessons are
              against the teacher and the verb already says so — what lands here
              is the refusal nobody could see coming, such as a lesson somebody
              else timetabled while this page was open. The property list has no
              button to hold its own fault: it commits on blur. */}
          {remove.error ? (
            <SaveError what="That teacher's profile" error={remove.error} />
          ) : null}
          {edit.save.error ? <SaveError what="That change" error={edit.save.error} /> : null}
          <RecordAttributes attributes={attributes} />
        </div>
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rail={
        <RailSection title="At a glance">
          <dl className="space-y-2 text-sm">
            <Glance label="Subjects" value={String(subjects.size)} />
            <Glance label="Classes" value={String(classes.size)} />
            <Glance label="Assignments" value={String(assignments.length)} />
          </dl>
        </RailSection>
      }
    />
  );
}

function Glance({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-medium text-[var(--text-strong)]">{value}</dd>
    </div>
  );
}
