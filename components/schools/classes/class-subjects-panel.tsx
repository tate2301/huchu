"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchTeacherAssignments,
  type TeacherAssignmentRecord,
} from "@/lib/schools/admin-v2";
import { recordType } from "@/lib/records/registry";
import { ClassSubjectFormDialog } from "@/components/schools/classes/class-subject-form-dialog";

/**
 * What a class is taught, and by whom.
 *
 * The class record could list its subjects and do nothing to them — the tab
 * was a read-only echo of an include, so the answer to "History has no teacher"
 * was to leave the page and go and find the assignments screen. Timetabling a
 * subject onto a class, moving it to another teacher and taking it off again
 * all happen here now, next to the sentence that told you about the gap.
 *
 * Like the streams panel, it reads its own rows rather than trusting the
 * record's snapshot: this is the thing that changes them.
 */
export function ClassSubjectsPanel({
  classId,
  className,
}: {
  classId: string;
  className: string;
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherAssignmentRecord | null>(null);
  const [staffing, setStaffing] = useState("");
  const [termId, setTermId] = useState("");

  const assignmentsQuery = useQuery({
    queryKey: ["schools", "class-subjects", classId],
    queryFn: () => fetchTeacherAssignments({ classId, page: 1, limit: 200 }),
  });

  const assignments = useMemo(
    () => assignmentsQuery.data?.data ?? [],
    [assignmentsQuery.data],
  );

  /** Only the terms this class is actually taught in — an empty option can
   *  only ever blank the list. */
  const termOptions = useMemo(
    () => [
      ...new Map(
        assignments.map((row) => [row.term.id, { value: row.term.id, label: row.term.name }]),
      ).values(),
    ],
    [assignments],
  );

  const visible = useMemo(
    () =>
      assignments.filter((row) => {
        if (termId && row.term.id !== termId) return false;
        if (staffing === "unstaffed" && row.teacherProfile) return false;
        if (staffing === "staffed" && !row.teacherProfile) return false;
        return true;
      }),
    [assignments, termId, staffing],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "class-subjects", classId] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "class", classId] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
  }

  const save = useMutation({
    mutationFn: (values: {
      termId: string;
      subjectId: string;
      streamId: string;
      teacherProfileId: string;
    }) =>
      editing
        ? fetchJson(`/api/v2/schools/teachers/assignments/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              teacherProfileId: values.teacherProfileId,
              streamId: values.streamId || null,
            }),
          })
        : fetchJson("/api/v2/schools/teachers/assignments", {
            method: "POST",
            body: JSON.stringify({
              termId: values.termId,
              classId,
              subjectId: values.subjectId,
              streamId: values.streamId || null,
              teacherProfileId: values.teacherProfileId,
            }),
          }),
    onSuccess: () => {
      setDialogOpen(false);
      setEditing(null);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/teachers/assignments/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const narrowed = [
    termOptions.find((option) => option.value === termId)?.label,
    staffing === "unstaffed"
      ? "Without a teacher"
      : staffing === "staffed"
        ? "With a teacher"
        : "",
  ].filter((value): value is string => Boolean(value));

  const unstaffed = assignments.filter((row) => !row.teacherProfile).length;

  return (
    <div className="space-y-3">
      {assignmentsQuery.error ? (
        <LoadError
          what="the subjects this class takes"
          error={assignmentsQuery.error}
          onRetry={() => void assignmentsQuery.refetch()}
        />
      ) : null}

      {remove.error ? (
        <SaveError what="The class-subject" error={remove.error} />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          {assignmentsQuery.isPending
            ? "Reading the timetable…"
            : assignments.length === 0
              ? "Nothing is timetabled to this class."
              : `${assignments.length} timetabled${
                  unstaffed > 0 ? ` · ${unstaffed} with no teacher assigned` : ""
                }.`}
        </p>
        <CreateButton
          resource="schools.academics"
          label="Timetable a subject"
          onSelect={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        />
      </div>

      {/* Only once there is enough to hunt through. Four subjects do not need
          narrowing, and a filter row above four rows is furniture. */}
      {assignments.length > 4 ? (
        <FilterBar>
          <FilterSelect
            label="Term"
            allLabel="Every term"
            value={termId}
            options={termOptions}
            onChange={setTermId}
          />
          <FilterSelect
            label="Teacher"
            allLabel="Staffed or not"
            value={staffing}
            options={[
              { value: "unstaffed", label: "Without a teacher" },
              { value: "staffed", label: "With a teacher" },
            ]}
            onChange={setStaffing}
          />
        </FilterBar>
      ) : null}

      {assignmentsQuery.isPending ? (
        <TableRowsSkeleton
          headers={["Subject", "Teacher", ""]}
          columns={[{ twoLine: true }, { width: 160 }, { width: 60 }]}
          rows={5}
        />
      ) : assignments.length === 0 ? (
        <NothingYet
          title="No subjects are timetabled to this class"
          body={
            `A subject reaches ${className} through an assignment — which subject, ` +
            "taught by whom, in which term. Start with the core ones every pupil " +
            "takes — Mathematics, English Language, Combined Science, Shona — then " +
            "the electives this year group has chosen, Geography and History among " +
            "them. Timetable the first one and the mark sheets follow."
          }
        />
      ) : visible.length === 0 ? (
        <NothingMatched
          what="subjects"
          filters={narrowed}
          onClear={() => {
            setTermId("");
            setStaffing("");
          }}
        />
      ) : (
        <ul className="divide-y divide-[color:var(--border-subtle)]">
          {visible.map((row, index) => (
            <li
              key={row.id}
              className="campus-row-in flex flex-wrap items-center justify-between gap-3 py-3"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="min-w-0">
                <Link
                  href={recordType("SUBJECT").href(row.subject.id)}
                  className="font-medium text-[color:var(--text-strong)] hover:underline"
                >
                  {row.subject.name}
                </Link>
                {/* Who teaches it is what an office is asked about a class's
                    subject, so it leads rather than sitting in a count. */}
                <p
                  className={
                    row.teacherProfile
                      ? "text-sm text-[color:var(--text-muted)]"
                      : "text-sm text-[color:var(--text-danger)]"
                  }
                >
                  {row.teacherProfile?.user.name ?? "No teacher assigned"}
                  {row.stream ? ` · ${row.stream.name}` : ""}
                  {` · ${row.term.name}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {row.subject.isCore ? <Badge tone="brand">Core</Badge> : null}
                <RecordActions
                  resource="schools.academics"
                  verbs={[
                    {
                      label: "Change the teacher",
                      action: "edit",
                      onSelect: () => {
                        setEditing(row);
                        setDialogOpen(true);
                      },
                    },
                    {
                      label: "Take it off",
                      action: "archive",
                      tone: "danger",
                      loading: remove.isPending && remove.variables === row.id,
                      confirm: {
                        title: `Take ${row.subject.name} off ${className}?`,
                        description:
                          "Every timetabled lesson for it goes with the assignment, and the mark sheet stops being built. Marks already recorded stay.",
                        confirmLabel: "Take it off",
                      },
                      onSelect: () => remove.mutate(row.id),
                    },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ClassSubjectFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            save.reset();
          }
        }}
        classId={classId}
        className={className}
        editing={
          editing
            ? {
                subjectName: editing.subject.name,
                termId: editing.term.id,
                subjectId: editing.subject.id,
                streamId: editing.stream?.id ?? "",
                teacherProfileId: editing.teacherProfile?.id ?? "",
              }
            : null
        }
        takenSubjectIds={assignments.map((row) => `${row.term.id}:${row.subject.id}`)}
        isSubmitting={save.isPending}
        error={save.error ? getApiErrorMessage(save.error) : null}
        onSubmit={(values) => save.mutate(values)}
      />
    </div>
  );
}
