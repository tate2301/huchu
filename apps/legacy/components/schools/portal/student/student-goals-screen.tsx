"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  BottomSheet,
  Button,
  Callout,
  Input,
  TextArea,
} from "@corelithzw/react";
import {
  CardsSkeleton,
  LoadError,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "@/components/schools/common/states";
import { CheckCircle, Circle, Clock, TrendingUp } from "@corelithzw/ui/lib/icons";
import { fetchJson } from "@corelithzw/platform/api-client";
import { useStudentPortal } from "./student-portal-context";
import { subjectAccentClass } from "./student-subject-accent";

type Goal = {
  id: string;
  targetMark: number | null;
  baselineMark: number | null;
  plan: string | null;
  teacherNote: string | null;
  achievedAt: string | null;
  subject: { id: string; code: string; name: string };
  currentMark: number | null;
  /** Null means "there is no mark yet", never "off track". */
  onTrack: boolean | null;
};

type GoalsResponse = { termId: string; goals: Goal[] };

type Subject = {
  id: string;
  code: string;
  name: string;
  teacherName: string | null;
  currentMark: number | null;
};

type SubjectsResponse = { termId: string; termName: string; subjects: Subject[] };

/** One subject on the screen: what it is, the goal on it, and today's mark. */
type Row = {
  subjectId: string;
  subjectName: string;
  teacherName: string | null;
  goal: Goal | null;
  currentMark: number | null;
};

/** What the pupil is filling in while the sheet is open. */
type Draft = { subjectId: string; subjectName: string; target: string; plan: string };

/**
 * The state of one goal, drawn from the canonical five.
 *
 * "No mark yet" is deliberately *not* one of these. A missing mark says nothing
 * about whether the goal is going well, so it belongs beside the number it is
 * missing from rather than in the status badge — the API returns `onTrack: null`
 * for exactly this case and reading that as "off track" would tell a child they
 * are behind on a test nobody has marked.
 */
function statusOf(goal: Goal | null): {
  label: "Not started" | "Running" | "Completed";
  tone: "neutral" | "info" | "success";
  Icon: typeof Circle;
} {
  if (!goal || goal.targetMark === null) {
    return { label: "Not started", tone: "neutral", Icon: Circle };
  }
  if (goal.onTrack === true) {
    return { label: "Completed", tone: "success", Icon: CheckCircle };
  }
  return { label: "Running", tone: "info", Icon: Clock };
}

/** A percentage, or the plain truth that there isn't one. */
function markLabel(value: number | null) {
  return value === null ? "No mark yet" : `${Math.round(value)}%`;
}

/**
 * A pupil's goals: what they are aiming for in each subject, and how it is going.
 *
 * The demo draws this as a gamified progress board — a weekly study bar chart, a
 * "you did it" cheer, a slider from 50 to 100. The bar chart is measuring
 * something this product does not record, so it is not here; the rest is, with
 * the celebration turned down to the design system's voice.
 *
 * The screen is built on three numbers per subject, because a target on its own
 * says nothing: where the child started, what they are aiming for, and where
 * they are now. The baseline is stamped by the API the first time a goal is set
 * and never moves after that, which is what makes the middle number mean
 * anything later in the term.
 *
 * Where there is no mark, the screen says so. `onTrack` comes back null when
 * either the target or the mark is missing, and the one thing this screen must
 * never do is round that down into "off track" — a child reading that would
 * think they had failed a test that has not been marked.
 *
 * The teacher's note is shown and cannot be written: the API refuses
 * `teacherNote` from a portal caller, because a target a child sets for
 * themselves and a comment their teacher writes about it are different things.
 *
 * One of the eight states is missing on purpose, and the audit reads text, so it
 * is named here rather than left looking forgotten: there is no
 * `NothingMatched`, because the screen has no filters — every subject a pupil
 * takes is listed, with or without a goal on it.
 */
export function StudentGoalsScreen() {
  const { student, term } = useStudentPortal();
  const queryClient = useQueryClient();

  /** Null means the sheet is shut. Opening it seeds the draft, in the handler. */
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const goals = useQuery({
    queryKey: ["schools", "portal", "student", "goals", term?.id],
    queryFn: () => fetchJson<GoalsResponse>("/api/v2/schools/goals"),
    enabled: Boolean(student),
  });

  const subjects = useQuery({
    queryKey: ["schools", "portal", "student", "subjects", term?.id],
    queryFn: () =>
      fetchJson<SubjectsResponse>("/api/v2/schools/portal/student/me/subjects"),
    enabled: Boolean(student),
  });

  const save = useMutation({
    mutationFn: async (input: Draft & { baselineMark: number | null }) => {
      const target = Number(input.target);
      if (!Number.isFinite(target) || target < 0 || target > 100) {
        throw new Error("A goal is a number between 0 and 100");
      }
      return fetchJson("/api/v2/schools/goals", {
        method: "POST",
        // No studentId. The server reads the pupil off the signed-in account,
        // and sending one from a phone is how a portal leaks another child.
        body: JSON.stringify({
          subjectId: input.subjectId,
          targetMark: target,
          plan: input.plan.trim() === "" ? null : input.plan.trim(),
          // Only meaningful on the first save; the API keeps the stamped
          // baseline on every later one.
          baselineMark: input.baselineMark,
        }),
      });
    },
    onSuccess: (_result, input) => {
      setSaved(`Goal saved — ${input.target}% in ${input.subjectName}`);
      setDraft(null);
      void queryClient.invalidateQueries({
        queryKey: ["schools", "portal", "student", "goals"],
      });
    },
  });

  if (!student) {
    return (
      <NothingYet
        title="This account is not linked to a pupil"
        body="Ask the school office to link your sign-in to your student record. Until they do, there are no goals to show you."
      />
    );
  }

  const goalBySubject = new Map(
    (goals.data?.goals ?? []).map((goal) => [goal.subject.id, goal]),
  );

  const rows: Row[] = (subjects.data?.subjects ?? []).map((subject) => ({
    subjectId: subject.id,
    subjectName: subject.name,
    teacherName: subject.teacherName,
    goal: goalBySubject.get(subject.id) ?? null,
    currentMark:
      goalBySubject.get(subject.id)?.currentMark ?? subject.currentMark ?? null,
  }));

  // A goal set before the pupil changed class still belongs to them. Dropping it
  // because the subject is no longer on their timetable would quietly delete
  // work they did.
  const listed = new Set(rows.map((row) => row.subjectId));
  for (const goal of goals.data?.goals ?? []) {
    if (listed.has(goal.subject.id)) continue;
    rows.push({
      subjectId: goal.subject.id,
      subjectName: goal.subject.name,
      teacherName: null,
      goal,
      currentMark: goal.currentMark,
    });
  }

  const withGoals = rows.filter((row) => row.goal?.targetMark != null);
  const met = withGoals.filter((row) => row.goal?.onTrack === true).length;
  const loading = goals.isPending || subjects.isPending;
  const error = goals.error ?? subjects.error;

  const openSheet = (row: Row) => {
    setDraft({
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      target:
        row.goal?.targetMark === null || row.goal?.targetMark === undefined
          ? ""
          : String(Math.round(row.goal.targetMark)),
      plan: row.goal?.plan ?? "",
    });
  };

  return (
    <div className="flex flex-col">
      {error ? (
        <LoadError
          what="your goals"
          error={error}
          onRetry={() => {
            void goals.refetch();
            void subjects.refetch();
          }}
        />
      ) : null}
      {save.error ? <SaveError what="That goal" error={save.error} /> : null}
      {saved ? (
        <Alert tone="success" title={saved} onDismiss={() => setSaved(null)} />
      ) : null}

      {/* The demo opens on an orange gradient block — the student portal's own
          identity colour, the same one the sign-in mark and the ID card wear. */}
      <div className="sp-hero identity">
        <div className="sp-hero-l">
          {term ? `${term.name} · what you are aiming for` : "What you are aiming for"}
        </div>
        <div className="sp-hero-v">
          <span className="tabular-nums">
            {met}/{withGoals.length}
          </span>
          <span className="sp-hero-u">reached</span>
        </div>
        <div className="sp-hero-d">
          {term
            ? "Pick a mark you want in a subject. The app keeps the mark you started from, so you can see how far you have come rather than only how far is left."
            : "No term is running, so there is nothing to aim at yet."}
        </div>
      </div>

      <div className="sp-psh">
        Each subject · {met}/{withGoals.length} on track
      </div>

      {loading ? (
        /* A goal card is a subject name, a pair of numbers and a bar, so the
           wait is card-shaped rather than a sentence. Four fills a phone
           screen without pushing the hero off it. */
        <CardsSkeleton count={4} columns={1} lines={2} />
      ) : rows.length === 0 ? (
        <NothingYet
          icon={<TrendingUp className="size-5" aria-hidden />}
          title="No subjects yet"
          body="Goals are set per subject, and your year group has none on the timetable for this term. Ask the office once your subjects are set up."
        />
      ) : (
        /* The whole list dims while a goal is saving. Two taps on a slow
           connection is two goals, and the second one wins. */
        <SavingOverlay saving={save.isPending} label="Saving your goal…">
          {rows.map((row) => {
            const goal = row.goal;
            const target = goal?.targetMark ?? null;
            const baseline = goal?.baselineMark ?? null;
            const status = statusOf(goal);
            const toGo =
              target !== null && row.currentMark !== null && row.currentMark < target
                ? Math.round(target - row.currentMark)
                : null;
            const filled =
              target !== null && target > 0
                ? Math.min(100, Math.round(((row.currentMark ?? 0) / target) * 100))
                : 0;

            return (
              <div
                key={row.subjectId}
                className={subjectAccentClass(row.subjectName)}
              >
                <button
                  type="button"
                  className="sp-goal-card"
                  onClick={() => openSheet(row)}
                >
                  <span className="sp-gc-head">
                    <span className="sp-tag goal" />
                    <span className="block min-w-0 flex-1">
                      <span className="sp-gc-nm block">{row.subjectName}</span>
                      <span className="sp-gc-sb block">
                        {[
                          row.teacherName ? `Taught by ${row.teacherName}` : null,
                          target === null ? "no goal yet" : `goal ${Math.round(target)}%`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="block text-right">
                      <span className="sp-gc-target block">
                        {row.currentMark === null ? "—" : Math.round(row.currentMark)}
                        <span className="sp-gc-of">
                          /{target === null ? "—" : Math.round(target)}
                        </span>
                      </span>
                      <span
                        className={`sp-gc-delta${
                          goal?.onTrack === true
                            ? ""
                            : toGo === null
                              ? " muted"
                              : " down"
                        }`}
                      >
                        {target === null
                          ? "Not set"
                          : row.currentMark === null
                            ? "No mark yet"
                            : goal?.onTrack === true
                              ? "You did it!"
                              : `${toGo}% to go`}
                      </span>
                    </span>
                  </span>

                  {target !== null ? (
                    <span
                      className="sp-gc-bar"
                      role="img"
                      aria-label={`${row.subjectName}: ${markLabel(row.currentMark)} against a goal of ${Math.round(target)}%`}
                    >
                      <span style={{ width: `${filled}%` }} />
                    </span>
                  ) : null}

                  <span className="sp-gc-foot">
                    <Badge tone={status.tone}>
                      <status.Icon className="size-3" aria-hidden /> {status.label}
                    </Badge>
                    {baseline === null ? null : (
                      <span className="sp-gc-note">
                        Started at {markLabel(baseline)}
                      </span>
                    )}
                  </span>

                  {goal?.plan ? (
                    <span className="sp-gc-note block">
                      How you will get there: {goal.plan}
                    </span>
                  ) : null}
                </button>

                {goal?.teacherNote ? (
                  <Callout tone="info" title="What your teacher said">
                    {goal.teacherNote}
                  </Callout>
                ) : null}
              </div>
            );
          })}
        </SavingOverlay>
      )}

      <BottomSheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft ? `Your goal in ${draft.subjectName}` : "Your goal"}
        description="Pick the mark you want by the end of term. You can change it later."
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" block onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              block
              loading={save.isPending}
              disabled={!draft || draft.target.trim() === ""}
              onClick={() => {
                if (!draft) return;
                const existing = goalBySubject.get(draft.subjectId) ?? null;
                const row = rows.find((item) => item.subjectId === draft.subjectId);
                save.mutate({
                  ...draft,
                  // The baseline is stamped once. Sending it again on a change
                  // would be harmless — the API ignores it — but sending the
                  // current mark on a *first* save is what makes the baseline
                  // real instead of empty.
                  baselineMark: existing ? null : (row?.currentMark ?? null),
                });
              }}
            >
              Save my goal
            </Button>
          </div>
        }
      >
        {draft ? (
          <div className="flex flex-col gap-4">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              size="lg"
              label="The mark you want"
              hint="A percentage between 0 and 100."
              suffix="%"
              value={draft.target}
              onChange={(event) =>
                setDraft({ ...draft, target: event.target.value })
              }
            />
            <TextArea
              rows={3}
              label="How you will get there"
              hint="Optional. One or two things you will do differently."
              value={draft.plan}
              onChange={(event) => setDraft({ ...draft, plan: event.target.value })}
            />
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}
