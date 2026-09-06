"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileList, MobileListEmpty, MobileListSectionHeader } from "@corelithzw/react";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

type Assignment = {
  id: string;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  maxScore: number | null;
  isPublished: boolean;
  classSubject: {
    id: string;
    subject: { id: string; name: string };
    class: { id: string; name: string };
    stream: { id: string; name: string } | null;
  };
  _count: { submissions: number };
};

type BoardRow = {
  student: { id: string; studentNo: string; firstName: string; lastName: string };
  submission: {
    id: string;
    status: "SUBMITTED" | "LATE" | "RETURNED" | "RESUBMIT";
    submittedAt: string;
    score: number | null;
    feedback: string | null;
  } | null;
};

const STATUS_LABELS: Record<NonNullable<BoardRow["submission"]>["status"], string> = {
  SUBMITTED: "In",
  LATE: "In late",
  RETURNED: "Marked",
  RESUBMIT: "Do it again",
};

type SubjectOption = { id: string; subject: { name: string }; stream: { name: string } | null };

/**
 * Homework set for a year group, and what has come back.
 *
 * The board opens on who has *not* handed in, because that is the list a
 * teacher works from on a Tuesday evening. Everything else — the marks, the
 * feedback — follows from a name on that list.
 *
 * Setting homework and publishing it are separate: a teacher drafts on a Sunday
 * and does not want thirty children reading a half-written instruction.
 */
export function HomeworkContent({
  classId,
  streamId,
  subjects,
}: {
  classId?: string;
  streamId?: string;
  subjects: SubjectOption[];
}) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [boardFor, setBoardFor] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [draft, setDraft] = useState({
    classSubjectId: "",
    title: "",
    instructions: "",
    dueAt: "",
    maxScore: "",
  });

  const listQuery = useQuery({
    queryKey: ["schools", "homework", classId ?? "mine", streamId ?? ""],
    queryFn: () =>
      fetchJson<{ assignments: Assignment[] }>(
        `/api/v2/schools/assignments?${new URLSearchParams({
          ...(classId ? { classId } : { mine: "true" }),
          ...(streamId ? { streamId } : {}),
        }).toString()}`,
      ),
  });

  const boardQuery = useQuery({
    queryKey: ["schools", "homework", "board", boardFor],
    queryFn: () =>
      fetchJson<{
        assignment: Assignment;
        rows: BoardRow[];
        summary: { total: number; in: number; late: number; marked: number };
      }>(`/api/v2/schools/assignments/${boardFor}`),
    enabled: boardFor !== null,
  });

  const assignments = useMemo(
    () => listQuery.data?.assignments ?? [],
    [listQuery.data],
  );

  /**
   * The subject cut is client-side. Everything a teacher has set is already on
   * the page — the list is one class's worth, not the school's — so asking the
   * server again for a slice of what is in hand would cost a round trip and a
   * flash of empty list.
   */
  const subjectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const assignment of assignments) {
      seen.set(assignment.classSubject.subject.id, assignment.classSubject.subject.name);
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [assignments]);

  const visible = useMemo(
    () =>
      subjectFilter
        ? assignments.filter(
            (assignment) => assignment.classSubject.subject.id === subjectFilter,
          )
        : assignments,
    [assignments, subjectFilter],
  );

  const narrowing = [
    subjectOptions.find((option) => option.value === subjectFilter)?.label,
  ].filter((entry): entry is string => Boolean(entry));

  const grouped = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const assignment of visible) {
      const key = assignment.classSubject.subject.name;
      const bucket = map.get(key);
      if (bucket) bucket.push(assignment);
      else map.set(key, [assignment]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  const createMutation = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/schools/assignments", {
        method: "POST",
        body: JSON.stringify({
          classSubjectId: draft.classSubjectId,
          title: draft.title.trim(),
          instructions: draft.instructions.trim() || null,
          dueAt: draft.dueAt ? new Date(`${draft.dueAt}T23:59:00`).toISOString() : null,
          maxScore: draft.maxScore ? Number(draft.maxScore) : null,
        }),
      }),
    onSuccess: () => {
      setFormOpen(false);
      setActionError(null);
      setDraft({
        classSubjectId: "",
        title: "",
        instructions: "",
        dueAt: "",
        maxScore: "",
      });
      void queryClient.invalidateQueries({ queryKey: ["schools", "homework"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const publishMutation = useMutation({
    mutationFn: (input: { id: string; publish: boolean }) =>
      fetchJson(`/api/v2/schools/assignments/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ publish: input.publish }),
      }),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "homework"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const board = boardQuery.data ?? null;
  const notIn = board?.rows.filter((row) => row.submission === null) ?? [];

  return (
    <div className="space-y-4">
      {listQuery.error ? (
        <LoadError
          what="the homework"
          error={listQuery.error}
          onRetry={() => void listQuery.refetch()}
        />
      ) : null}
      {actionError ? <SaveError what="That homework" error={actionError} /> : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar>
          <FilterSelect
            label="Subject"
            allLabel="Every subject"
            value={subjectFilter}
            options={subjectOptions}
            onChange={setSubjectFilter}
          />
        </FilterBar>
        <Button onClick={() => setFormOpen(true)} disabled={subjects.length === 0}>
          Set homework
        </Button>
      </div>

      {listQuery.isPending ? (
        <TableRowsSkeleton
          headers={["Homework", "Due", "In", "State"]}
          columns={[
            { twoLine: true },
            { width: 110 },
            { width: 70, badge: true },
            { width: 80, badge: true },
          ]}
          rows={5}
        />
      ) : (
        /*
          Setting a piece and withdrawing it are the same row's switch, so the
          list dims while either is in flight. Publishing twice because the
          badge had not caught up is how thirty children read a half-written
          instruction.
        */
        <SavingOverlay saving={publishMutation.isPending} label="Saving…">
          <MobileList>
            {grouped.length === 0 ? (
              <MobileListEmpty>
                {narrowing.length > 0 ? (
                  <NothingMatched
                    what="homework"
                    filters={narrowing}
                    onClear={() => setSubjectFilter("")}
                  />
                ) : (
                  <NothingYet
                    title="Nothing set yet"
                    body="Homework is drafted here and stays invisible to the class until you set it, so a Sunday's half-written instruction is nobody's problem but yours."
                    action={
                      <Button
                        onClick={() => setFormOpen(true)}
                        disabled={subjects.length === 0}
                      >
                        Set homework
                      </Button>
                    }
                  />
                )}
              </MobileListEmpty>
            ) : (
              grouped.map(([subject, rows]) => (
            <div key={subject}>
              <MobileListSectionHeader>{subject}</MobileListSectionHeader>
              {rows.map((assignment) => (
                <MobileList.Row
                  key={assignment.id}
                  static
                  title={assignment.title}
                  subtitle={
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <span>
                        {assignment.dueAt
                          ? `Due ${assignment.dueAt.slice(0, 10)}`
                          : "No deadline"}
                        {assignment.maxScore
                          ? ` · out of ${Number(assignment.maxScore)}`
                          : " · not marked"}
                      </span>
                      <Badge variant="outline">
                        {assignment._count.submissions} in
                      </Badge>
                      {assignment.isPublished ? (
                        <Badge variant="secondary">Set</Badge>
                      ) : (
                        <Badge variant="outline">Draft</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setBoardFor(assignment.id)}
                      >
                        Who has handed in
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={publishMutation.isPending}
                        onClick={() =>
                          publishMutation.mutate({
                            id: assignment.id,
                            publish: !assignment.isPublished,
                          })
                        }
                      >
                        {assignment.isPublished ? "Withdraw" : "Set it"}
                      </Button>
                    </span>
                  }
                />
              ))}
            </div>
              ))
            )}
          </MobileList>
        </SavingOverlay>
      )}

      <RecordDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Set homework"
        description="Saved as a draft. Nobody sees it until you set it."
        size="md"
        errors={createMutation.isError && actionError ? [actionError] : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.classSubjectId && draft.title.trim() && !createMutation.isPending) {
            createMutation.mutate();
          }
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !draft.classSubjectId ||
                !draft.title.trim() ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Saving…" : "Save as draft"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="homework-subject">Subject</Label>
            <Select
              value={draft.classSubjectId}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, classSubjectId: value }))
              }
            >
              <SelectTrigger id="homework-subject">
                <SelectValue placeholder="Choose a subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.subject.name}
                    {option.stream ? ` — ${option.stream.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="homework-title">What is it</Label>
            <Input
              id="homework-title"
              value={draft.title}
              maxLength={200}
              placeholder="Read chapter four and answer questions 1–5"
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="homework-instructions">Instructions</Label>
            <Textarea
              id="homework-instructions"
              rows={3}
              value={draft.instructions}
              onChange={(event) =>
                setDraft((current) => ({ ...current, instructions: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="homework-due">Due</Label>
            <Input
              id="homework-due"
              type="date"
              value={draft.dueAt}
              onChange={(event) =>
                setDraft((current) => ({ ...current, dueAt: event.target.value }))
              }
            />
            <p className="text-sm text-muted-foreground">
              Leave blank for reading with no deadline.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="homework-max">Out of</Label>
            <Input
              id="homework-max"
              type="number"
              min={1}
              value={draft.maxScore}
              onChange={(event) =>
                setDraft((current) => ({ ...current, maxScore: event.target.value }))
              }
            />
            <p className="text-sm text-muted-foreground">
              Leave blank if it is not marked.
            </p>
          </div>
        </div>
      </RecordDialog>

      <RecordDialog
        open={boardFor !== null}
        onOpenChange={(open) => {
          if (!open) setBoardFor(null);
        }}
        title={board ? board.assignment.title : "Who has handed in"}
        description={
          board
            ? `${board.summary.in} of ${board.summary.total} in · ${board.summary.late} late · ${board.summary.marked} marked`
            : "Loading…"
        }
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setBoardFor(null)}>
              Close
            </Button>
          </div>
        }
      >
        {/* The counts live in the body, not in `description`: the design
            system renders `DialogDescription` as `sr-only`, so anything
            load-bearing put there is invisible to the person reading. */}
        {board ? (
          <p className="text-sm text-muted-foreground">
            {board.summary.in} of {board.summary.total} in · {board.summary.late}{" "}
            late · {board.summary.marked} marked
            {board.assignment.dueAt
              ? ` · due ${board.assignment.dueAt.slice(0, 10)}`
              : ""}
          </p>
        ) : null}

        {boardQuery.error ? (
          <LoadError
            what="the class list"
            error={boardQuery.error}
            onRetry={() => void boardQuery.refetch()}
          />
        ) : null}

        {boardQuery.isPending ? (
          <TableRowsSkeleton
            headers={["Pupil", "State"]}
            columns={[{ twoLine: true }, { width: 110, badge: true }]}
            rows={8}
          />
        ) : null}

        {notIn.length > 0 ? (
          <Alert>
            <AlertTitle>
              {notIn.length} still to hand in
            </AlertTitle>
            <AlertDescription>
              {notIn
                .map((row) => `${row.student.lastName}, ${row.student.firstName}`)
                .join(", ")}
            </AlertDescription>
          </Alert>
        ) : board && board.rows.length > 0 ? (
          /*
            Nobody left to chase is the answer this dialog is opened for, and it
            is good news rather than a gap — so it says so instead of leaving
            the space where the missing names would have been blank.
          */
          <NothingLeftToDo
            title="Everybody has handed in"
            body="There is nobody left to chase for this one."
          />
        ) : null}

        <div className="space-y-1">
          {(board?.rows ?? []).map((row) => (
            <div
              key={row.student.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--edge-subtle)] py-2 last:border-0"
            >
              <span className="text-sm">
                {row.student.lastName}, {row.student.firstName}
                <span className="block text-muted-foreground">
                  {row.student.studentNo}
                </span>
              </span>
              {row.submission ? (
                <span className="flex items-center gap-2">
                  <Badge
                    variant={
                      row.submission.status === "LATE" ? "outline" : "secondary"
                    }
                  >
                    {STATUS_LABELS[row.submission.status]}
                  </Badge>
                  {row.submission.score !== null ? (
                    <span className="text-sm">{row.submission.score}</span>
                  ) : null}
                </span>
              ) : (
                <Badge variant="destructive">Not in</Badge>
              )}
            </div>
          ))}
        </div>
      </RecordDialog>
    </div>
  );
}
