"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { RecordMark } from "@/components/records/record-mark";
import {
  RailSection,
  RecordPageShell,
  type RecordTab,
} from "@/components/records/record-page-shell";
import {
  SubjectFiles,
  SubjectNotes,
  type SubjectFile,
  type SubjectNote,
} from "@/components/records/subject-tabs";
import { useAttributeEditor } from "@/components/records/use-attribute-editor";
import { RecordActions } from "@/components/schools/common/record-actions";
import { RecordNotFound } from "@/components/schools/common/states";
import { TeacherAssignmentsPanel } from "@/components/schools/teachers/teacher-assignments-panel";
import { TeacherEmployeePanel } from "@/components/schools/teachers/teacher-employee-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson } from "@/lib/api-client";
import { recordType } from "@/lib/records/registry";

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

export function TeacherRecordPage({ teacherId }: { teacherId: string }) {
  const config = recordType("TEACHER");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("assignments");

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
    return [
      {
        id: "department",
        label: "Department",
        ...edit.text("department", teacher.department ?? ""),
      },
      {
        id: "role",
        label: "Role",
        ...edit.choice("isHod", String(teacher.isHod), [
          { value: "false", label: "Teacher" },
          { value: "true", label: "Head of department" },
        ]),
      },
      {
        id: "classTeacher",
        label: "Holds a form",
        ...edit.choice("isClassTeacher", String(teacher.isClassTeacher), [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]),
      },
      {
        id: "isActive",
        label: "Teaching",
        ...edit.choice("isActive", String(teacher.isActive), [
          { value: "true", label: "Currently teaching" },
          { value: "false", label: "Not teaching" },
        ]),
      },
      // Read-only, and the labels say whose they are. A teacher is one person
      // with two records (S-1.7); a second editor on a shared fact is how the
      // two disagree.
      { id: "email", label: "Email (account)", display: teacher.user?.email ?? "—" },
      { id: "phone", label: "Phone (account)", display: teacher.user?.phone ?? "—" },
      { id: "employeeCode", label: "Staff number", mono: true, display: teacher.employeeCode },
      {
        id: "employee",
        label: "Payroll record",
        display: teacher.employeeId ? "Linked" : "Not linked",
      },
    ];
  }, [teacher, edit]);

  if (query.isPending) {
    return (
      <div className="space-y-4" data-testid="teacher-record-loading">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !teacher) {
    return (
      <RecordNotFound
        what="That teacher"
        backHref={config.indexHref}
        backLabel="Back to the teachers"
      />
    );
  }

  const name = teacher.user?.name ?? teacher.user?.email ?? "Teacher";
  const assignments = teacher.assignments ?? [];

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
            assignments={assignments}
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
      value: "notes",
      label: "Notes",
      count: notes.data?.data?.length ?? 0,
      content: (
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
      content: <SubjectFiles files={files.data?.data ?? []} isPending={files.isPending} />,
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
      attributes={<RecordAttributes attributes={attributes} />}
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
