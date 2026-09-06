"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { ClassFilter, ALL_CLASSES, classFilterParams, type ClassFilterValue } from "@/components/schools/common/class-filter";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { RecordActions } from "@/components/schools/common/record-actions";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { DataTable } from "@/components/ui/data-table";
import { fetchJson } from "@/lib/api-client";
import { fetchSchoolsSubjects } from "@/lib/schools/admin-v2";

/**
 * Who teaches what, for the whole school at once.
 *
 * The teacher record answers this one teacher at a time and that is the wrong
 * shape for the two questions a timetable is actually built from: which class
 * has a subject with nobody against it, and who is carrying more than they can
 * mark. Both are questions about the grid, not about a person, and neither can
 * be answered by opening forty-eight records.
 *
 * So the unassigned row is the point of the screen. A subject on a class with
 * no teacher is the gap that turns into an empty period, an unmarked sheet and
 * a parent asking why; it is drawn as a warning rather than a blank because a
 * blank reads as "loading" and gets scrolled past.
 *
 * Editing an assignment is deliberately absent. Moving a subject from one
 * teacher to another is not a field change, it is two decisions — take it off
 * her, give it to him — and the teacher record does that properly with the
 * bulk allocation sheet. This screen finds the gaps and removes what is wrong.
 */

type Assignment = {
  id: string;
  isActive: boolean;
  term: { id: string; code: string; name: string } | null;
  class: { id: string; code: string; name: string } | null;
  stream: { id: string; code: string; name: string } | null;
  subject: {
    id: string;
    code: string;
    name: string;
    isCore: boolean;
    passMark: number | null;
  } | null;
  teacherProfile: {
    id: string;
    employeeCode: string | null;
    isClassTeacher: boolean;
    isHod: boolean;
    isActive: boolean;
    user: { id: string; name: string | null; email: string } | null;
  } | null;
};

type AssignmentsResponse = {
  data: Assignment[];
  pagination: { total: number };
};

export function TeacherAssignmentsContent() {
  const queryClient = useQueryClient();

  const [classValue, setClassValue] = useState<ClassFilterValue>(ALL_CLASSES);
  const [subjectId, setSubjectId] = useState("");
  const [search, setSearch] = useState("");

  const assignmentsQuery = useQuery({
    queryKey: ["schools", "teacher-assignments", { classValue, subjectId, search }],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "300", isActive: "true" });
      const scoped = classFilterParams(classValue);
      if (scoped.classId) params.set("classId", scoped.classId);
      if (scoped.streamId) params.set("streamId", scoped.streamId);
      if (subjectId) params.set("subjectId", subjectId);
      if (search) params.set("search", search);
      return fetchJson<AssignmentsResponse>(
        `/api/v2/schools/teachers/assignments?${params.toString()}`,
      );
    },
  });

  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects", "assignment-filter"],
    queryFn: () => fetchSchoolsSubjects({ limit: 200 }),
    staleTime: 5 * 60_000,
  });

  /**
   * Removing an allocation, not the teacher and not the subject.
   *
   * The class keeps the subject and the subject falls to nobody, which is the
   * state the warning row is for — a school that has taken Mathematics off Mrs
   * Nyathi and not yet given it to anybody needs to see that, loudly, until
   * somebody fixes it.
   */
  const removeMutation = useMutation({
    mutationFn: (assignment: Assignment) =>
      fetchJson(`/api/v2/schools/teachers/assignments/${assignment.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teacher-assignments"] });
    },
  });

  const assignments = useMemo(
    () => assignmentsQuery.data?.data ?? [],
    [assignmentsQuery.data],
  );
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);

  const counts = useMemo(() => {
    const unassigned = assignments.filter((row) => !row.teacherProfile).length;
    const teachers = new Set(
      assignments.map((row) => row.teacherProfile?.id).filter(Boolean),
    ).size;
    return { total: assignments.length, unassigned, teachers };
  }, [assignments]);

  const columns = useMemo<ColumnDef<Assignment>[]>(
    () => [
      {
        id: "class",
        header: "Class",
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate font-medium">
              {row.original.class?.name ?? "—"}
              {row.original.stream ? ` ${row.original.stream.name}` : ""}
            </span>
            <span className="block truncate text-sm text-muted-foreground">
              {row.original.term?.name ?? "No term"}
            </span>
          </div>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate">{row.original.subject?.name ?? "—"}</span>
            {row.original.subject?.isCore ? <Badge tone="brand">Core</Badge> : null}
          </div>
        ),
      },
      {
        id: "teacher",
        header: "Teacher",
        cell: ({ row }) => {
          const profile = row.original.teacherProfile;
          if (!profile) {
            // The gap, said out loud. This is what the screen is for.
            return <Badge tone="warn">Nobody teaches it</Badge>;
          }
          return (
            <div className="flex min-w-0 items-center gap-2">
              <PersonAvatar name={profile.user?.name ?? "?"} />
              <div className="min-w-0">
                <Link
                  href={`/schools/teachers/${profile.id}`}
                  className="block truncate hover:underline"
                >
                  {profile.user?.name ?? "Unnamed"}
                </Link>
                <span className="block truncate text-sm text-muted-foreground">
                  {profile.employeeCode ?? profile.user?.email ?? ""}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: "role",
        header: "Holds",
        cell: ({ row }) => {
          const profile = row.original.teacherProfile;
          if (!profile) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {profile.isHod ? <Badge tone="brand">HoD</Badge> : null}
              {profile.isClassTeacher ? <Badge>Form teacher</Badge> : null}
              {!profile.isHod && !profile.isClassTeacher ? (
                <span className="text-sm text-muted-foreground">Teaching only</span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          row.original.teacherProfile ? (
            <RecordActions
              resource="schools.teachers"
              verbs={[
                {
                  label: "Take it off them",
                  action: "archive",
                  tone: "danger",
                  loading:
                    removeMutation.isPending &&
                    removeMutation.variables?.id === row.original.id,
                  onSelect: () => removeMutation.mutate(row.original),
                  confirm: {
                    title: `Take ${row.original.subject?.name ?? "this subject"} off ${
                      row.original.teacherProfile.user?.name ?? "this teacher"
                    }?`,
                    description:
                      "The class keeps the subject and it falls to nobody, so it will show here as unassigned until somebody else is given it. Marks already entered stay where they are.",
                    confirmLabel: "Take it off them",
                  },
                },
              ]}
            />
          ) : null,
      },
    ],
    [removeMutation],
  );

  const filtered = Boolean(classValue.classId || subjectId || search);

  return (
    <>
      <PageChrome title="Staff assignments" />

      <PageBand
        chips={[
          { label: "Allocations", value: counts.total },
          {
            label: "Nobody teaching",
            value: counts.unassigned,
            tone: counts.unassigned > 0 ? "warn" : "neutral",
          },
          { label: "Teachers", value: counts.teachers },
        ]}
      />

      <TableControls
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search teacher, subject or class"
          />
        }
        filters={
          <>
            <ClassFilter value={classValue} onChange={setClassValue} />
            <FilterSelect
              label="Subject"
              value={subjectId}
              onChange={setSubjectId}
              allLabel="Every subject"
              options={subjects.map((subject) => ({
                value: subject.id,
                label: subject.name,
              }))}
            />
          </>
        }
      />

      {assignmentsQuery.isPending ? (
        <TableRowsSkeleton
          headers={["Class", "Subject", "Teacher", "Holds"]}
          columns={[
            { twoLine: true },
            { width: 180 },
            { avatar: true, twoLine: true },
            { width: 140, badge: true },
            { width: 120 },
          ]}
        />
      ) : assignmentsQuery.isError ? (
        <LoadError what="the assignments" error={assignmentsQuery.error} />
      ) : assignments.length === 0 ? (
        filtered ? (
          <NothingMatched
            what="assignments"
            onClear={() => {
              setClassValue(ALL_CLASSES);
              setSubjectId("");
              setSearch("");
            }}
          />
        ) : (
          <NothingYet
            title="Nothing is allocated yet"
            body="Give a class's subjects to the teachers who take them, from the teacher's own record."
          />
        )
      ) : (
        <DataTable columns={columns} data={assignments} />
      )}

      {removeMutation.isError ? (
        <SaveError what="The allocation" error={removeMutation.error} />
      ) : null}
    </>
  );
}
