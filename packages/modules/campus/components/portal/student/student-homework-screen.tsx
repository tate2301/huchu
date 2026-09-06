"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, BottomSheet, Button } from "@corelithzw/react";
import {
  CardsSkeleton,
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "../../common/states";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { AlertTriangle, Check, Clock } from "@corelithzw/ui/lib/icons";
import { fetchJson } from "@corelithzw/platform/api-client";
import { useStudentPortal } from "./student-portal-context";
import { subjectAccentClass } from "./student-subject-accent";

type SubmissionStatus = "SUBMITTED" | "LATE" | "RETURNED" | "RESUBMIT";

/**
 * The service's own states, said to a child.
 *
 * `SUBMISSION_LABELS` in `lib/schools/assignments.ts` writes these for a
 * teacher's mark book — "In", "In late" — which is the right register there
 * and the wrong one here. The states are the same four; only the wording
 * changes, and it changes in one place.
 */
const STATUS_LABELS: Record<SubmissionStatus, string> = {
  SUBMITTED: "Handed in",
  LATE: "Handed in late",
  RETURNED: "Marked",
  RESUBMIT: "Do it again",
};

type Homework = {
  id: string;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  /** Whole days left, negative once the deadline has passed. Null: no deadline. */
  dueInDays: number | null;
  /** The school's clock, not the phone's. */
  isOverdue: boolean;
  maxScore: number | null;
  setOn: string | null;
  subjectCode: string;
  subjectName: string;
  teacherName: string | null;
  submission: {
    id: string;
    status: SubmissionStatus;
    submittedAt: string;
    content: string | null;
    attachmentUrl: string | null;
    score: number | null;
    feedback: string | null;
    markedAt: string | null;
  } | null;
};

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function dayOf(value: string | null) {
  return value ? DAY.format(new Date(value)) : null;
}

/** "Due tomorrow", "2 days late" — the sentence a child reads first. */
function deadline(row: Homework) {
  if (row.dueAt === null) return "No date to hand it in by";
  const days = row.dueInDays;
  if (days === null) return `Hand in by ${dayOf(row.dueAt)}`;
  if (days < 0) {
    const late = Math.abs(days);
    return `${late} ${late === 1 ? "day" : "days"} late`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

type Filter = "all" | "todo" | "overdue" | "in" | "marked";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "todo", label: "To do" },
  { value: "overdue", label: "Overdue" },
  { value: "in", label: "Handed in" },
  { value: "marked", label: "Marked" },
];

function matches(row: Homework, filter: Filter) {
  if (filter === "todo") return row.submission === null;
  if (filter === "overdue") return row.submission === null && row.isOverdue;
  if (filter === "in") return row.submission !== null;
  if (filter === "marked") return row.submission?.status === "RETURNED";
  return true;
}

/**
 * Which of the demo's four due-pill looks a row wears.
 *
 * The pill carries an icon and a sentence as well as a colour, because a red
 * pill and an amber pill are the same pill to a child who cannot tell them
 * apart.
 */
function pillOf(row: Homework) {
  const submission = row.submission;
  if (submission?.status === "RETURNED") {
    return { tone: "graded", Icon: Check, label: STATUS_LABELS.RETURNED };
  }
  if (submission) {
    return { tone: "submitted", Icon: Check, label: STATUS_LABELS[submission.status] };
  }
  if (row.isOverdue) return { tone: "overdue", Icon: AlertTriangle, label: deadline(row) };
  return { tone: "upcoming", Icon: Clock, label: deadline(row) };
}

/**
 * What is set, what is due, and what has been handed in.
 *
 * Handing in is the reason this screen exists, so it is a real action with a
 * state you can see afterwards, not a toast that disappears: once work is in,
 * the card says so, with the day it arrived, and it keeps saying so. A child
 * who is not sure whether their homework went through opens the app to check
 * exactly that, and a screen that looked identical before and after would send
 * them to their teacher anyway.
 *
 * Late work is offered, never refused. `submitAssignment` records lateness as
 * a fact about the work rather than a reason to lose it, and a school still
 * wants the essay. The button says "Hand in late" so nobody is surprised by
 * what the teacher sees.
 *
 * The filter is the demo's chip row, counts and all, because the counts are half
 * the answer: "Overdue 1" tells a pupil what to do next before they have tapped
 * anything. The row scrolls sideways rather than wrapping, so a fifth state
 * costs no vertical space.
 */
export function StudentHomeworkScreen() {
  const queryClient = useQueryClient();
  const { student } = useStudentPortal();

  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ content: "", link: "" });
  const [handedIn, setHandedIn] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["schools", "portal", "student", "homework"],
    queryFn: () =>
      fetchJson<{ assignments: Homework[] }>(
        "/api/v2/schools/portal/student/me/homework",
      ),
    enabled: student !== null,
  });

  const assignments = query.data?.assignments ?? [];
  const shown = assignments.filter((row) => matches(row, filter));
  const open = assignments.find((row) => row.id === openId) ?? null;
  const stillToDo = assignments.filter((row) => row.submission === null).length;

  const hand = useMutation({
    mutationFn: (row: Homework) =>
      fetchJson(`/api/v2/schools/assignments/${row.id}`, {
        method: "POST",
        // No `studentId`. The route resolves the pupil from the signed-in
        // account, which is the S-0.2 rule and the reason this call is safe
        // from a phone in a child's hand.
        body: JSON.stringify({
          action: "submit",
          content: draft.content.trim() || null,
          attachmentUrl: draft.link.trim() || null,
        }),
      }),
    onSuccess: (_result, row) => {
      setHandedIn(`"${row.title}" is with ${row.teacherName ?? "your teacher"}`);
      setOpenId(null);
      setDraft({ content: "", link: "" });
      void queryClient.invalidateQueries({
        queryKey: ["schools", "portal", "student", "homework"],
      });
    },
  });

  const show = (row: Homework) => {
    hand.reset();
    setHandedIn(null);
    setDraft({
      content: row.submission?.content ?? "",
      link: row.submission?.attachmentUrl ?? "",
    });
    setOpenId(row.id);
  };

  if (student === null) {
    return (
      <NothingYet
        title="We cannot find your school record"
        body="Your account is signed in but it is not linked to a pupil yet. Ask the school office to link it and your homework appears here."
      />
    );
  }

  if (query.error) {
    return (
      <LoadError
        what="your homework"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (query.isPending) {
    return (
      /* The chip row is a bar; the work under it is cards, one per piece.
         Drawing both means the page does not jump when the chips arrive. */
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <span className="sr-only">Fetching your homework…</span>
        <CardsSkeleton count={5} columns={1} lines={3} />
      </div>
    );
  }

  const countFor = (value: Filter) =>
    assignments.filter((row) => matches(row, value)).length;

  return (
    <div className="flex flex-col">
      {handedIn ? (
        <Alert
          tone="success"
          title="Handed in"
          onDismiss={() => setHandedIn(null)}
        >
          {handedIn}
        </Alert>
      ) : null}

      {assignments.length === 0 ? (
        <NothingYet
          title="No homework set"
          body="Work your teachers set this term shows up here, with the day it has to be in by."
        />
      ) : (
        <>
          <div className="sp-chips" role="group" aria-label="Show">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`sp-chip${filter === option.value ? " on" : ""}`}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
                <span className="sp-chip-ct">{countFor(option.value)}</span>
              </button>
            ))}
          </div>

          <div className="sp-psh">
            <span>
              <span className="tabular-nums">{stillToDo}</span>{" "}
              {stillToDo === 1 ? "piece" : "pieces"} still to hand in
            </span>
          </div>

          {shown.length === 0 ? (
            /* Two different sentences, because they are two different facts.
               An empty "To do" is a child who has handed everything in, and
               telling them to try another chip would bury the good news; any
               other empty chip really is just a narrowing that hid the rest. */
            filter === "todo" || filter === "overdue" ? (
              <NothingLeftToDo
                title="Nothing to hand in"
                body="Every piece your teachers have set is in. Well done."
              />
            ) : (
              <NothingMatched
                what="homework"
                filters={[FILTERS.find((row) => row.value === filter)?.label ?? filter]}
                onClear={() => setFilter("all")}
              />
            )
          ) : (
            /* The list dims while a hand-in is in flight. A child who taps
               twice on a slow connection should not send twice. */
            <SavingOverlay saving={hand.isPending} label="Handing it in…">
              <ul className="m-0 flex list-none flex-col p-0">
                {shown.map((row) => {
                  const submission = row.submission;
                  const pill = pillOf(row);
                  return (
                    <li key={row.id} className={subjectAccentClass(row.subjectName)}>
                      <button
                        type="button"
                        className="sp-row-card"
                        onClick={() => show(row)}
                      >
                        <span className="sp-rc-top">
                          <span className="sp-tag" />
                          <span className="sp-rc-info block">
                            <span className="sp-as-subj block">{row.subjectName}</span>
                            <span className="sp-rc-nm mt-1 block">{row.title}</span>
                            <span className="sp-rc-sb block">
                              {row.teacherName ?? "Your teacher"}
                              {row.dueAt ? ` · ${dayOf(row.dueAt)}` : ""}
                            </span>
                            <span className="sp-as-meta">
                              <span className={`sp-as-due ${pill.tone}`}>
                                <pill.Icon className="size-[11px]" aria-hidden />
                                {pill.label}
                              </span>
                              {submission?.score !== null &&
                              submission?.score !== undefined ? (
                                <span className="sp-as-grade">
                                  {submission.score}
                                  {row.maxScore ? `/${row.maxScore}` : ""}
                                </span>
                              ) : null}
                            </span>
                            {submission?.feedback ? (
                              <span className="sp-rc-note block">
                                {submission.feedback}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </SavingOverlay>
          )}
        </>
      )}

      <BottomSheet
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open?.title ?? "Homework"}
        description={
          open
            ? `${open.subjectName} · ${open.teacherName ?? "your teacher"} · ${deadline(open)}`
            : undefined
        }
        footer={
          open ? (
            <div className="flex w-full flex-col gap-2">
              <Button
                variant="primary"
                size="lg"
                block
                loading={hand.isPending}
                onClick={() => hand.mutate(open)}
              >
                {open.submission
                  ? "Change what you handed in"
                  : open.isOverdue
                    ? "Hand in late"
                    : "Hand it in"}
              </Button>
              <Button variant="ghost" size="lg" block onClick={() => setOpenId(null)}>
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        {open ? (
          <div className="flex flex-col gap-3">
            {hand.error ? <SaveError what="Your homework" error={hand.error} /> : null}

            {open.submission ? (
              <Alert tone="success" title={STATUS_LABELS[open.submission.status]}>
                Your teacher has had this since{" "}
                {dayOf(open.submission.submittedAt)}. You can change it until they
                mark it.
              </Alert>
            ) : open.isOverdue ? (
              <Alert tone="warn" title="This is past its date">
                Hand it in anyway. Your teacher would rather have it late than not
                at all, and they will see that it came in late.
              </Alert>
            ) : null}

            <div>
              <p className="text-[length:var(--type-label)] font-semibold text-[color:var(--text-strong)]">
                What to do
              </p>
              <p className="mt-1 text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
                {open.instructions ?? "Your teacher did not add any notes."}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="homework-answer">Your answer</Label>
              <Textarea
                id="homework-answer"
                rows={5}
                maxLength={8000}
                value={draft.content}
                placeholder="Type your work here, or say what you are handing to your teacher on paper."
                onChange={(event) =>
                  setDraft((current) => ({ ...current, content: event.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="homework-link">Link to your work</Label>
              <Input
                id="homework-link"
                type="url"
                inputMode="url"
                value={draft.link}
                placeholder="https://"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, link: event.target.value }))
                }
              />
              <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                Leave this empty unless your work is somewhere your teacher can open.
              </p>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}
