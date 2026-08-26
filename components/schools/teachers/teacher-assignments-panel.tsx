"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card } from "@corelithzw/react";

import { RecordActions } from "@/components/schools/common/record-actions";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { NothingYet, SaveError } from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import {
  AssignmentFormDialog,
  EMPTY_ASSIGNMENT,
  type AssignmentFormValues,
} from "./assignment-form-dialog";

/**
 * What a teacher teaches, edited where it is read.
 *
 * This was a read-only list, which made the record page a poster: a head of
 * department looking at a colleague's nine lessons could see that one of them
 * had moved to another set and could do nothing about it without leaving for
 * the assignments table, finding the row again among two hundred and eighty,
 * and editing it there. The verbs are the same three the table has; they are
 * simply on the row that prompted the thought.
 *
 * Retired lessons stay in the list, dimmed, rather than vanishing. A teacher
 * whose Form 4 set ended last term still taught it, and a list that quietly
 * drops it reads as though they never did.
 */

export type TeacherAssignment = {
  id: string;
  isActive: boolean;
  term: { id: string; code: string; name: string } | null;
  class: { id: string; code: string; name: string } | null;
  stream: { id: string; code: string; name: string } | null;
  subject: { id: string; code: string; name: string; isCore: boolean } | null;
};

export function TeacherAssignmentsPanel({
  teacherProfileId,
  teacherName,
  assignments,
}: {
  teacherProfileId: string;
  teacherName: string;
  assignments: TeacherAssignment[];
}) {
  const queryClient = useQueryClient();
  const access = useSchoolAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<AssignmentFormValues>(EMPTY_ASSIGNMENT);

  const remove = useMutation({
    mutationFn: (assignment: TeacherAssignment) =>
      fetchJson(`/api/v2/schools/teachers/assignments/${assignment.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teacher", teacherProfileId] });
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
      void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
    },
  });

  const canCreate = access.can("schools.teachers", "create");

  const openAdd = () => {
    setDraft({ ...EMPTY_ASSIGNMENT, teacherProfileId });
    setDialogOpen(true);
  };

  const openEdit = (assignment: TeacherAssignment) => {
    setDraft({
      id: assignment.id,
      termId: assignment.term?.id ?? "",
      classId: assignment.class?.id ?? "",
      streamId: assignment.stream?.id ?? "",
      subjectId: assignment.subject?.id ?? "",
      teacherProfileId,
      isActive: assignment.isActive,
    });
    setDialogOpen(true);
  };

  return (
    <>
      <Card
        title="Teaches"
        subtitle={
          assignments.length === 1 ? "1 assignment" : `${assignments.length} assignments`
        }
        flush
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={!canCreate}
            title={canCreate ? undefined : "This is the registrar to do."}
            onClick={openAdd}
          >
            Add an assignment
          </Button>
        }
      >
        {remove.isError ? (
          <div className="p-3">
            <SaveError what="That assignment" error={remove.error} />
          </div>
        ) : null}

        {assignments.length === 0 ? (
          <div className="p-3">
            <NothingYet
              title="Nothing timetabled"
              body="No subject is against this teacher yet, so no class list, mark sheet or register will find them."
              action={
                <Button
                  variant="secondary"
                  disabled={!canCreate}
                  title={canCreate ? undefined : "This is the registrar to do."}
                  onClick={openAdd}
                >
                  Add an assignment
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--border-subtle)]">
            {assignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center gap-3 px-3 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--text-strong)]">
                    {assignment.subject?.name ?? "Subject"}
                  </span>
                  <span className="block truncate text-sm text-[var(--text-muted)]">
                    {[
                      assignment.class?.name,
                      assignment.stream?.name,
                      assignment.term?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>

                <span className="flex items-center gap-1.5">
                  {assignment.subject?.isCore ? <Badge tone="brand">Core</Badge> : null}
                  {assignment.isActive ? null : <Badge tone="neutral">Retired</Badge>}
                </span>

                <RecordActions
                  resource="schools.teachers"
                  verbs={[
                    {
                      label: "Edit",
                      action: "edit",
                      onSelect: () => openEdit(assignment),
                    },
                    {
                      label: "Remove",
                      action: "archive",
                      tone: "danger",
                      loading: remove.isPending && remove.variables?.id === assignment.id,
                      confirm: {
                        title: "Remove this assignment?",
                        description: `${teacherName} stops teaching ${assignment.subject?.name ?? "this subject"} to ${assignment.class?.name ?? "this class"}. Marks already recorded against the lesson go with it — turn it off instead if the term simply ended.`,
                        confirmLabel: "Remove the assignment",
                      },
                      onSelect: () => remove.mutate(assignment),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AssignmentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={draft}
        lockedTeacherName={teacherName}
      />
    </>
  );
}
