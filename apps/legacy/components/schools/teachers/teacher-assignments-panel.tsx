"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card } from "@corelithzw/react";

import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { RecordActions } from "@/components/schools/common/record-actions";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import {
  fetchTeacherAssignments,
  type TeacherAssignmentRecord,
} from "@/lib/schools/admin-v2";
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
 *
 * The rows are read here rather than handed down from the record's own query.
 * The panel is the only thing that changes them, so it is the only thing that
 * has to know when they are in flight or when a write was refused — a list
 * that has to wait for a whole record page to re-read itself after a delete
 * spends a second showing a lesson somebody has just removed.
 */

export function TeacherAssignmentsPanel({
  teacherProfileId,
  teacherName,
}: {
  teacherProfileId: string;
  teacherName: string;
}) {
  const queryClient = useQueryClient();
  const access = useSchoolAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<AssignmentFormValues>(EMPTY_ASSIGNMENT);
  const [termId, setTermId] = useState("");
  const [status, setStatus] = useState("");

  const query = useQuery({
    queryKey: ["schools", "teacher", teacherProfileId, "assignments"],
    // Every lesson, then narrowed on the client: a teacher carries tens of
    // rows, not thousands, and asking the server again for each filter would
    // blank the list somebody is reading in order to shorten it.
    queryFn: () => fetchTeacherAssignments({ page: 1, limit: 200, teacherProfileId }),
  });

  const assignments = useMemo(() => query.data?.data ?? [], [query.data]);

  const remove = useMutation({
    mutationFn: (assignment: TeacherAssignmentRecord) =>
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

  // The terms this teacher actually has lessons in. Offering the school's whole
  // calendar would offer terms that can only empty the list.
  const termOptions = useMemo(
    () => [
      ...new Map(
        assignments.map((assignment) => [
          assignment.term.id,
          { value: assignment.term.id, label: assignment.term.name },
        ]),
      ).values(),
    ],
    [assignments],
  );

  const visible = assignments.filter((assignment) => {
    if (termId && assignment.term.id !== termId) return false;
    if (status === "active" && !assignment.isActive) return false;
    if (status === "retired" && assignment.isActive) return false;
    return true;
  });

  const filtersInForce = [
    termId ? termOptions.find((option) => option.value === termId)?.label : null,
    status === "active" ? "Still taught" : status === "retired" ? "Retired" : null,
  ].filter((value): value is string => Boolean(value));

  const clearFilters = () => {
    setTermId("");
    setStatus("");
  };

  const openAdd = () => {
    setDraft({ ...EMPTY_ASSIGNMENT, teacherProfileId });
    setDialogOpen(true);
  };

  const openEdit = (assignment: TeacherAssignmentRecord) => {
    setDraft({
      id: assignment.id,
      termId: assignment.term.id,
      classId: assignment.class.id,
      streamId: assignment.stream?.id ?? "",
      subjectId: assignment.subject.id,
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
          query.isPending
            ? undefined
            : assignments.length === 1
              ? "1 assignment"
              : `${assignments.length} assignments`
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

        {query.isPending ? (
          <div className="p-3">
            <TableRowsSkeleton
              headers={["Subject", "Class and term", "", ""]}
              columns={[
                { twoLine: true },
                { width: 96, badge: true },
                { width: 150 },
              ]}
              rows={4}
            />
          </div>
        ) : query.error ? (
          <div className="p-3">
            <LoadError
              what="this teacher's lessons"
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          </div>
        ) : (
          <>
            {assignments.length > 0 ? (
              <div className="border-b border-[color:var(--border-subtle)] p-3">
                <FilterBar>
                  <FilterSelect
                    label="Term"
                    allLabel="Every term"
                    value={termId}
                    options={termOptions}
                    onChange={setTermId}
                  />
                  <FilterSelect
                    label="Status"
                    allLabel="Taught and retired"
                    value={status}
                    options={[
                      { value: "active", label: "Still taught" },
                      { value: "retired", label: "Retired" },
                    ]}
                    onChange={setStatus}
                  />
                </FilterBar>
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
            ) : visible.length === 0 ? (
              <div className="p-3">
                <NothingMatched
                  what="lessons"
                  filters={filtersInForce}
                  onClear={clearFilters}
                />
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--border-subtle)]">
                {visible.map((assignment, index) => (
                  <li
                    key={assignment.id}
                    className="campus-row-in flex flex-wrap items-center gap-3 px-3 py-3"
                    style={{ animationDelay: `${index * 40}ms` }}
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
          </>
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
