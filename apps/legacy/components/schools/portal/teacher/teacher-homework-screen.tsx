"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, EmptyState, Progress } from "@corelithzw/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useTeacherPortal } from "./teacher-portal-context";

type SubmissionStatus = "SUBMITTED" | "LATE" | "RETURNED" | "RESUBMIT";

/** The service's own labels, kept in step with `SUBMISSION_LABELS`. */
const STATUS_LABELS: Record<SubmissionStatus, string> = {
  SUBMITTED: "In",
  LATE: "In late",
  RETURNED: "Marked",
  RESUBMIT: "Do it again",
};

const STATUS_TONES: Record<SubmissionStatus, "success" | "warn" | "info"> = {
  SUBMITTED: "info",
  LATE: "warn",
  RETURNED: "success",
  RESUBMIT: "warn",
};

type Homework = {
  id: string;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  maxScore: number | null;
  isPublished: boolean;
  publishedAt: string | null;
  setOn: string;
  classSubjectId: string;
  classId: string | null;
  className: string;
  streamName: string | null;
  subjectId: string | null;
  subjectName: string;
  roll: number;
  handedIn: number;
  late: number;
  marked: number;
  resubmit: number;
};

type BoardRow = {
  student: { id: string; studentNo: string; firstName: string; lastName: string };
  submission: {
    id: string;
    status: SubmissionStatus;
    submittedAt: string;
    score: number | null;
    feedback: string | null;
  } | null;
};

type Board = {
  assignment: {
    id: string;
    title: string;
    instructions: string | null;
    dueAt: string | null;
    maxScore: number | null;
    isPublished: boolean;
  };
  rows: BoardRow[];
  summary: { total: number; in: number; late: number; marked: number };
};

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function day(value: string | null) {
  return value ? DAY.format(new Date(value)) : null;
}

/** Whole percent, and 0 rather than NaN when there is nothing to divide by. */
function percent(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

type Filter = "all" | "draft" | "set" | "due" | "done";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Everything set" },
  { value: "draft", label: "Drafts" },
  { value: "set", label: "Given to the class" },
  { value: "due", label: "Due this week" },
  { value: "done", label: "All in and marked" },
];

function matches(row: Homework, filter: Filter) {
  if (filter === "draft") return !row.isPublished;
  if (filter === "set") return row.isPublished;
  if (filter === "done") {
    return row.roll > 0 && row.handedIn === row.roll && row.marked === row.handedIn;
  }
  if (filter === "due") {
    if (!row.dueAt) return false;
    const due = new Date(row.dueAt).getTime();
    const now = Date.now();
    return due >= now && due <= now + 7 * 24 * 60 * 60 * 1000;
  }
  return true;
}

/**
 * Homework and tasks: what a teacher set, and what came back.
 *
 * Two numbers carry the screen, and they are deliberately not the same
 * fraction. Handed in is counted against the *roll*, because thirty children
 * were given the work and the ones who did nothing are the point. Marked is
 * counted against what was handed in, because a teacher cannot mark work that
 * has not arrived, and scoring it out of thirty would make a finished evening
 * look like a half-done one.
 *
 * Opening a row shows the board, which is built from the class list rather
 * than from the submissions: a child who has handed in nothing is a row that
 * says so. A list of submissions answers a question nobody asks.
 *
 * The demo filtered with a row of pills. These are dropdowns — the standing
 * instruction, and it earns itself here, because two filters that each need a
 * label ("which class", "which state") are unreadable as two rows of chips.
 */
export function TeacherHomeworkScreen() {
  const queryClient = useQueryClient();
  const { day: portalDay, classSubjectId, error: portalError } = useTeacherPortal();

  const [classFilter, setClassFilter] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [openBoard, setOpenBoard] = useState<Homework | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    classSubjectId: "",
    title: "",
    instructions: "",
    dueAt: "",
    maxScore: "",
  });

  const classes = portalDay.classes;

  const list = useQuery({
    queryKey: ["schools", "portal", "teacher", "homework"],
    queryFn: () =>
      fetchJson<{ termId: string; assignments: Homework[] }>(
        "/api/v2/schools/portal/teacher/me/homework",
      ),
  });

  const board = useQuery({
    queryKey: ["schools", "portal", "teacher", "homework", "board", openBoard?.id],
    queryFn: () => fetchJson<Board>(`/api/v2/schools/assignments/${openBoard?.id}`),
    enabled: openBoard !== null,
  });

  const assignments = list.data?.assignments ?? [];
  const shown = assignments.filter(
    (row) =>
      (classFilter === "" || row.classSubjectId === classFilter) && matches(row, filter),
  );

  const create = useMutation({
    mutationFn: (publish: boolean) =>
      fetchJson("/api/v2/schools/assignments", {
        method: "POST",
        body: JSON.stringify({
          classSubjectId: draft.classSubjectId,
          title: draft.title.trim(),
          instructions: draft.instructions.trim() || null,
          // The deadline is the end of the day chosen. A teacher types a date;
          // treating it as midnight would make work handed in that afternoon
          // late.
          dueAt: draft.dueAt ? new Date(`${draft.dueAt}T23:59:00`).toISOString() : null,
          maxScore: draft.maxScore ? Number(draft.maxScore) : null,
          publish,
        }),
      }),
    onSuccess: (_result, publish) => {
      setFormOpen(false);
      setSaved(
        publish
          ? `"${draft.title.trim()}" is set — the class can see it now`
          : `"${draft.title.trim()}" saved as a draft`,
      );
      setDraft({
        classSubjectId: "",
        title: "",
        instructions: "",
        dueAt: "",
        maxScore: "",
      });
      void queryClient.invalidateQueries({ queryKey: ["schools", "portal", "teacher"] });
    },
  });

  const publish = useMutation({
    mutationFn: (input: { id: string; publish: boolean }) =>
      fetchJson(`/api/v2/schools/assignments/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ publish: input.publish }),
      }),
    onSuccess: (_result, input) => {
      setSaved(input.publish ? "The class can see it now" : "Withdrawn from the class");
      void queryClient.invalidateQueries({ queryKey: ["schools", "portal", "teacher"] });
    },
  });

  const mark = useMutation({
    mutationFn: (input: { submissionId: string; score: number | null }) =>
      fetchJson(`/api/v2/schools/assignments/${openBoard?.id}`, {
        method: "POST",
        body: JSON.stringify({
          action: "mark",
          submissionId: input.submissionId,
          score: input.score,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "portal", "teacher"] });
    },
  });

  const show = (row: Homework) => {
    setOpenBoard(row);
    setScores({});
    mark.reset();
    publish.reset();
  };

  if (portalError) {
    return <LoadError what="your classes" error={portalError} />;
  }

  if (classes.length === 0) {
    return (
      <EmptyState
        title="You have no classes this term"
        body="Homework is set against a class you teach. Ask the school office to put you on the timetable and this fills up."
      />
    );
  }

  const boardData = board.data ?? null;
  const notIn = boardData?.rows.filter((row) => row.submission === null) ?? [];

  return (
    <div className="flex flex-col gap-4">
      {list.error ? (
        <LoadError
          what="your homework"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      ) : null}
      {/* Setting and withdrawing happen from the row and from the board, and
          the board closes on success — so the failure is said out here where
          it stays put. Marking's failure lives in the board with the marks. */}
      {create.error ? <SaveError what="That homework" error={create.error} /> : null}
      {publish.error ? <SaveError what="That change" error={publish.error} /> : null}
      {saved ? <Alert tone="success" title={saved} onDismiss={() => setSaved(null)} /> : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-[42rem] text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          Everything you have set this term. Open one to see who has handed in and
          what is still to mark.
        </p>
        <Button
          variant="primary"
          onClick={() => {
            setDraft((current) => ({
              ...current,
              classSubjectId: current.classSubjectId || classSubjectId || "",
            }));
            create.reset();
            setFormOpen(true);
          }}
        >
          Set homework
        </Button>
      </div>

      <FilterBar>
        <FilterSelect
          label="Class"
          value={classFilter}
          allLabel="All my classes"
          onChange={setClassFilter}
          options={classes.map((row) => ({
            value: row.classSubjectId,
            label: `${row.className}${row.streamName ? ` ${row.streamName}` : ""} · ${row.subjectName}`,
          }))}
        />
        <FilterSelect
          label="Show"
          value={filter === "all" ? "" : filter}
          allLabel="Everything set"
          onChange={(value) => setFilter((value || "all") as Filter)}
          options={FILTERS.filter((option) => option.value !== "all")}
        />
      </FilterBar>

      {list.isPending ? (
        <TableRowsSkeleton
          headers={["Homework", "Handed in", "Marked"]}
          columns={[{ twoLine: true }, { width: 180 }, { width: 180 }]}
          rows={6}
        />
      ) : assignments.length === 0 ? (
        <NothingYet
          title="Nothing set yet"
          body="Homework you set appears here, with how much of it has come back. Nobody sees a draft until you set it."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setDraft((current) => ({
                  ...current,
                  classSubjectId: current.classSubjectId || classSubjectId || "",
                }));
                create.reset();
                setFormOpen(true);
              }}
            >
              Set homework
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <NothingMatched
          what="homework"
          filters={[
            classFilter
              ? classes.find((row) => row.classSubjectId === classFilter)?.className
              : null,
            filter === "all" ? null : FILTERS.find((row) => row.value === filter)?.label,
          ].filter((value): value is string => Boolean(value))}
          onClear={() => {
            setClassFilter("");
            setFilter("all");
          }}
        />
      ) : (
        <ul className="flex flex-col rounded-[var(--radius-md)] border border-[color:var(--border)]">
          {shown.map((row) => {
            const inPercent = percent(row.handedIn, row.roll);
            const markedPercent = percent(row.marked, row.handedIn);
            return (
              <li
                key={row.id}
                className="border-b border-[color:var(--border-subtle)] last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => show(row)}
                  className="flex w-full flex-wrap items-start gap-4 px-4 py-3 text-left"
                >
                  <div className="min-w-[16rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">
                        {row.className}
                        {row.streamName ? ` ${row.streamName}` : ""} · {row.subjectName}
                      </Badge>
                      {row.isPublished ? (
                        <Badge tone="success" dot>
                          Given to the class
                        </Badge>
                      ) : (
                        <Badge tone="warn" dot>
                          Draft
                        </Badge>
                      )}
                      <Badge tone="outline">
                        {row.maxScore === null
                          ? "Not marked out of anything"
                          : `Out of ${row.maxScore}`}
                      </Badge>
                    </div>
                    <p className="mt-2 text-[length:var(--type-body)] font-semibold text-[color:var(--text-strong)]">
                      {row.title}
                    </p>
                    <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                      Set {day(row.setOn)} ·{" "}
                      {row.dueAt ? `due ${day(row.dueAt)}` : "no deadline"}
                    </p>

                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <span className="w-[4.5rem] shrink-0 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                          Handed in
                        </span>
                        <Progress
                          className="min-w-0 flex-1"
                          value={row.handedIn}
                          max={Math.max(row.roll, 1)}
                          label={`Handed in for ${row.title}`}
                        />
                        <span className="w-[3.5rem] shrink-0 text-right font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-body)]">
                          {row.handedIn}/{row.roll}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-[4.5rem] shrink-0 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                          Marked
                        </span>
                        <Progress
                          className="min-w-0 flex-1"
                          tone="success"
                          value={row.marked}
                          max={Math.max(row.handedIn, 1)}
                          label={`Marked for ${row.title}`}
                        />
                        <span className="w-[3.5rem] shrink-0 text-right font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-body)]">
                          {row.marked}/{row.handedIn}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:w-[15rem]">
                    {[
                      { label: "Handed in", value: `${inPercent}%` },
                      { label: "Marked", value: `${markedPercent}%` },
                      { label: "Waiting", value: `${row.handedIn - row.marked}` },
                    ].map((cell) => (
                      <div
                        key={cell.label}
                        className="rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] px-3 py-2"
                      >
                        <p className="font-[family-name:var(--font-mono)] text-[length:var(--type-body)] font-semibold tabular-nums text-[color:var(--text-strong)]">
                          {cell.value}
                        </p>
                        <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                          {cell.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <RecordDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Set homework"
        description="What the class has to do, and when it is due."
        size="md"
        errors={create.error ? [getApiErrorMessage(create.error)] : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              loading={create.isPending && create.variables === false}
              disabled={!draft.classSubjectId || !draft.title.trim()}
              onClick={() => create.mutate(false)}
            >
              Save as a draft
            </Button>
            <Button
              variant="primary"
              loading={create.isPending && create.variables === true}
              disabled={!draft.classSubjectId || !draft.title.trim()}
              onClick={() => create.mutate(true)}
            >
              Set it now
            </Button>
          </>
        }
      >
        <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          A draft is yours alone until you set it. Setting it puts the work in front
          of the class.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="homework-class">Class</Label>
            <Select
              value={draft.classSubjectId}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, classSubjectId: value }))
              }
            >
              <SelectTrigger id="homework-class" className="w-full">
                <SelectValue placeholder="Choose one of your classes" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((row) => (
                  <SelectItem key={row.classSubjectId} value={row.classSubjectId}>
                    {row.className}
                    {row.streamName ? ` ${row.streamName}` : ""} · {row.subjectName} ·{" "}
                    {row.size} on the roll
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
              placeholder="Read chapter four and answer questions 1 to 5"
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
              placeholder="Anything the class needs beyond the title. Parents see this too."
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
            <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              Leave it blank for reading set over a holiday. Work is due at the end of
              the day you choose.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="homework-max">Out of</Label>
            <Input
              id="homework-max"
              type="number"
              min={1}
              inputMode="numeric"
              className="tabular-nums"
              value={draft.maxScore}
              onChange={(event) =>
                setDraft((current) => ({ ...current, maxScore: event.target.value }))
              }
            />
            <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              Leave it blank if you are not scoring it.
            </p>
          </div>
        </div>
      </RecordDialog>

      <RecordDialog
        open={openBoard !== null}
        onOpenChange={(open) => {
          if (!open) setOpenBoard(null);
        }}
        title={openBoard?.title ?? "Who has handed in"}
        description="Every child on the class list, whether they have handed in or not."
        size="lg"
        errors={
          // Publishing and marking both happen in here, so what went wrong is
          // said in here — an alert on the page behind the dialog is an alert
          // nobody reads.
          [
            board.error ? getApiErrorMessage(board.error) : null,
            publish.error ? getApiErrorMessage(publish.error) : null,
            mark.error ? getApiErrorMessage(mark.error) : null,
          ].filter((value): value is string => value !== null)
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpenBoard(null)}>
              Close
            </Button>
            {openBoard ? (
              <Button
                variant={openBoard.isPublished ? "secondary" : "primary"}
                loading={publish.isPending}
                onClick={() =>
                  publish.mutate(
                    { id: openBoard.id, publish: !openBoard.isPublished },
                    { onSuccess: () => setOpenBoard(null) },
                  )
                }
              >
                {openBoard.isPublished ? "Withdraw it" : "Set it now"}
              </Button>
            ) : null}
          </>
        }
      >
        {openBoard ? (
          <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
            {openBoard.className}
            {openBoard.streamName ? ` ${openBoard.streamName}` : ""} ·{" "}
            {openBoard.subjectName} ·{" "}
            {openBoard.dueAt ? `due ${day(openBoard.dueAt)}` : "no deadline"}
            {openBoard.maxScore === null ? "" : ` · out of ${openBoard.maxScore}`}
          </p>
        ) : null}

        {boardData ? (
          <p className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
            {boardData.summary.in} of {boardData.summary.total} in ·{" "}
            {boardData.summary.late} late · {boardData.summary.marked} marked
          </p>
        ) : null}

        {notIn.length > 0 ? (
          <Alert tone="warn" title={`${notIn.length} still to hand in`}>
            {notIn
              .map((row) => `${row.student.lastName}, ${row.student.firstName}`)
              .join(", ")}
          </Alert>
        ) : null}

        {board.isPending ? (
          <TableRowsSkeleton
            headers={["Pupil", "State", "Mark"]}
            columns={[
              { avatar: true, twoLine: true },
              { width: 96, badge: true },
              { width: 88, align: "right" },
            ]}
            rows={8}
          />
        ) : boardData && boardData.rows.length === 0 ? (
          <NothingYet
            title="Nobody is on this class list"
            body="No active pupil has this class as their year group, so there is nobody to hand it in."
          />
        ) : (
          /* One mark at a time, and the row being written is the one that must
             stop taking taps — a second number entered mid-save overwrites the
             first one silently. */
          <SavingOverlay saving={mark.isPending} label="Saving the mark…">
            <ul className="flex flex-col">
              {(boardData?.rows ?? []).map((row) => {
                const submission = row.submission;
                const pending = mark.isPending && mark.variables?.submissionId === submission?.id;
                return (
                  <li
                    key={row.student.id}
                    className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border-subtle)] py-3 last:border-b-0"
                  >
                    <PersonAvatar
                      firstName={row.student.firstName}
                      lastName={row.student.lastName}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                        {row.student.lastName}, {row.student.firstName}
                      </p>
                      <p className="truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                        {row.student.studentNo}
                        {submission
                          ? ` · ${TIME.format(new Date(submission.submittedAt))}`
                          : ""}
                      </p>
                    </div>

                    {submission === null ? (
                      <Badge tone="danger" dot>
                        Not in
                      </Badge>
                    ) : (
                      <Badge tone={STATUS_TONES[submission.status]} dot>
                        {STATUS_LABELS[submission.status]}
                      </Badge>
                    )}

                    {submission && submission.score !== null ? (
                      <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] tabular-nums text-[color:var(--text-strong)]">
                        {submission.score}
                        {openBoard?.maxScore === null ? "" : `/${openBoard?.maxScore}`}
                      </span>
                    ) : null}

                    {submission && openBoard?.maxScore !== null ? (
                      <Input
                        aria-label={`Mark for ${row.student.firstName} ${row.student.lastName}`}
                        className="w-20 text-right font-mono tabular-nums"
                        inputMode="decimal"
                        placeholder="—"
                        value={scores[submission.id] ?? ""}
                        onChange={(event) =>
                          setScores((current) => ({
                            ...current,
                            [submission.id]: event.target.value,
                          }))
                        }
                      />
                    ) : null}

                    {submission ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={pending}
                        onClick={() => {
                          const typed = scores[submission.id]?.trim() ?? "";
                          mark.mutate(
                            {
                              submissionId: submission.id,
                              score: typed === "" ? null : Number(typed),
                            },
                            {
                              // The saved mark comes back on the row itself, so
                              // the box that put it there empties rather than
                              // showing the same number twice.
                              onSuccess: () =>
                                setScores((current) => {
                                  const next = { ...current };
                                  delete next[submission.id];
                                  return next;
                                }),
                            },
                          );
                        }}
                      >
                        {openBoard?.maxScore === null ? "Mark as seen" : "Save the mark"}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </SavingOverlay>
        )}
      </RecordDialog>
    </div>
  );
}
