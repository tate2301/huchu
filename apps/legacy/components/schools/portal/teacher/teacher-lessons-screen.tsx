"use client";

import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  accentVar,
  Alert,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Input,
  Modal,
  TextArea,
} from "@corelithzw/react";
import { ChevronLeftIcon, ChevronRight } from "@corelithzw/ui/lib/icons";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "@/components/schools/common/states";
import { fetchJson } from "@corelithzw/platform/api-client";
import { useTeacherPortal } from "./teacher-portal-context";
import { hueFor, subjectHues } from "./teacher-subject-hues";

type WeekDay = { dayOfWeek: number; date: string; isToday: boolean };

type WeekPeriod = {
  id: string;
  code: string;
  name: string;
  startsAt: string;
  endsAt: string;
};

type Plan = {
  id: string;
  topic: string;
  objectives: string | null;
  resourcesNote: string | null;
  homeworkNote: string | null;
};

type LessonCell = {
  key: string;
  slotId: string;
  periodId: string;
  dayOfWeek: number;
  date: string;
  roomName: string | null;
  plan: Plan | null;
  cover: { teacherName: string | null; reason: string | null } | null;
};

type LessonWeek = {
  classSubject: {
    id: string;
    termId: string;
    termName: string;
    className: string;
    classCode: string;
    streamName: string | null;
    subjectName: string;
    subjectCode: string;
  };
  weekStart: string;
  lastWeekStart: string;
  lastWeekPlans: number;
  today: string;
  days: WeekDay[];
  periods: WeekPeriod[];
  lessons: LessonCell[];
};

type Draft = {
  topic: string;
  objectives: string;
  resourcesNote: string;
  homeworkNote: string;
};

const DAY_NAME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "UTC",
});
const DAY_NUMBER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  timeZone: "UTC",
});
const FULL_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function asDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

/** ISO date string shifted by whole days, in UTC so it cannot slide a day. */
function shiftDate(iso: string, days: number) {
  return new Date(asDate(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** "1 – 5 June 2026", or "29 June – 3 July 2026" when the week straddles two. */
function weekLabel(days: WeekDay[]) {
  if (days.length === 0) return "";
  const first = asDate(days[0].date);
  const last = asDate(days[days.length - 1].date);
  if (MONTH_YEAR.format(first) === MONTH_YEAR.format(last)) {
    return `${DAY_NUMBER.format(first)} – ${DAY_NUMBER.format(last)} ${MONTH_YEAR.format(last)}`;
  }
  return `${DAY_MONTH.format(first)} – ${DAY_MONTH.format(last)} ${MONTH_YEAR.format(last).split(" ").pop()}`;
}

const EMPTY_DRAFT: Draft = {
  topic: "",
  objectives: "",
  resourcesNote: "",
  homeworkNote: "",
};

function draftFrom(plan: Plan | null): Draft {
  return {
    topic: plan?.topic ?? "",
    objectives: plan?.objectives ?? "",
    resourcesNote: plan?.resourcesNote ?? "",
    homeworkNote: plan?.homeworkNote ?? "",
  };
}

/**
 * The week's lesson plans for the class the rail has selected.
 *
 * Laid out over the timetable rather than over the plans that exist, because
 * the question a teacher opens this with is "what have I not written yet".
 * A grid of only the plans that had been written would be silent about exactly
 * the Thursday they came to find, so every timetabled lesson is a cell and an
 * unplanned one says so.
 *
 * The plan itself is a drawer rather than a page: writing Tuesday's objectives
 * while looking at Monday's is how a scheme of work stays coherent, and losing
 * the grid to an editor breaks that. The demo makes the same call.
 *
 * "Copy last week forward" is the action that makes planning survivable — most
 * of a week is last week's shape with different topics. It names its size
 * before it runs and it never overwrites: a lesson already planned is left
 * alone and counted, because a teacher who has started next week must not lose
 * that work to a copy.
 */
export function TeacherLessonsScreen() {
  const queryClient = useQueryClient();
  const { day, error, selectedClass } = useTeacherPortal();

  /** Empty means "the week the school is in", which the server decides. */
  const [weekStart, setWeekStart] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  /**
   * "Which ones have I not written" is the question this screen is opened
   * with, so it is a switch rather than a hunt through the grid for the grey
   * cells. It narrows which PERIOD ROWS are drawn; the week itself is
   * untouched, and none of the verbs above act on what is visible.
   */
  const [unwrittenOnly, setUnwrittenOnly] = useState(false);

  const classSubjectId = selectedClass?.classSubjectId ?? null;

  const query = useQuery({
    queryKey: ["schools", "portal", "teacher", "lessons", classSubjectId, weekStart],
    queryFn: () =>
      fetchJson<LessonWeek>(
        `/api/v2/schools/portal/teacher/me/lessons?classSubjectId=${classSubjectId}${
          weekStart ? `&weekStart=${weekStart}` : ""
        }`,
      ),
    enabled: Boolean(classSubjectId),
  });

  const week = query.data ?? null;
  const days = week?.days ?? [];
  const periods = week?.periods ?? [];
  const lessons = week?.lessons ?? [];

  const lessonAt = (date: string, periodId: string) =>
    lessons.find((row) => row.date === date && row.periodId === periodId) ?? null;

  const open = openKey ? (lessons.find((row) => row.key === openKey) ?? null) : null;
  const openPeriod = open
    ? (periods.find((row) => row.id === open.periodId) ?? null)
    : null;

  const planned = lessons.filter((row) => row.plan).length;
  const unplanned = lessons.length - planned;

  // A plain filter over at most a dozen periods. Memoising it would need
  // `week?.periods ?? []` memoised first, and the React Compiler refuses a
  // manual memo whose dependency is rebuilt every render anyway.
  const shownPeriods = unwrittenOnly
    ? periods.filter((period) =>
        lessons.some((row) => row.periodId === period.id && !row.plan),
      )
    : periods;

  const onThisWeek = week ? weekStart === "" || weekStart === week.weekStart : true;
  // Same subject → hue mapping as the class rail and the timetable grid.
  const hue = hueFor(
    subjectHues(day.classes),
    week?.classSubject.subjectName ?? selectedClass?.subjectName,
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!open || !week) throw new Error("No lesson is open");
      if (!draft.topic.trim()) throw new Error("Give the lesson a topic before saving");
      return fetchJson("/api/v2/schools/portal/teacher/me/lessons", {
        method: "POST",
        body: JSON.stringify({
          action: "save",
          ...(open.plan ? { id: open.plan.id } : {}),
          classSubjectId: week.classSubject.id,
          slotId: open.slotId,
          lessonDate: open.date,
          topic: draft.topic.trim(),
          objectives: draft.objectives.trim() || null,
          resourcesNote: draft.resourcesNote.trim() || null,
          homeworkNote: draft.homeworkNote.trim() || null,
        }),
      });
    },
    onSuccess: () => {
      setSaved(
        `Lesson plan saved — ${draft.topic.trim()}, ${FULL_DAY.format(asDate(open?.date ?? week?.weekStart ?? ""))}`,
      );
      setOpenKey(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "portal", "teacher"] });
    },
  });

  const layOut = useMutation({
    mutationFn: async () => {
      if (!week) throw new Error("No week is loaded");
      return fetchJson<{
        created: number;
        skipped: number;
        seededFrom: string | null;
        fromScheme: boolean;
        message: string | null;
      }>("/api/v2/schools/portal/teacher/me/lessons", {
        method: "POST",
        body: JSON.stringify({
          action: "lay-out-week",
          classSubjectId: week.classSubject.id,
          weekStart: week.weekStart,
        }),
      });
    },
    onSuccess: (result) => {
      setSaved(
        result.created === 0
          ? (result.message ?? "Every lesson this week is already planned")
          : result.fromScheme
            ? `Laid out ${result.created} lesson${result.created === 1 ? "" : "s"} from the scheme of work — “${result.seededFrom}”`
            : `Laid out ${result.created} lesson${result.created === 1 ? "" : "s"} from the timetable${
                result.seededFrom ? `, picking up from “${result.seededFrom}”` : ""
              } — open each one to name its topic`,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "portal", "teacher"] });
    },
  });

  const copyWeek = useMutation({
    mutationFn: async () => {
      if (!week) throw new Error("No week is loaded");
      return fetchJson<{ copied: number; skipped: number; message: string | null }>(
        "/api/v2/schools/portal/teacher/me/lessons",
        {
          method: "POST",
          body: JSON.stringify({
            action: "copy-week",
            classSubjectId: week.classSubject.id,
            fromWeekStart: week.lastWeekStart,
            toWeekStart: week.weekStart,
          }),
        },
      );
    },
    onSuccess: (result) => {
      setConfirmCopy(false);
      setSaved(
        result.copied === 0
          ? "Nothing was copied — every lesson this week already has a plan"
          : `Copied ${result.copied} plan${result.copied === 1 ? "" : "s"} from last week${
              result.skipped > 0
                ? `, and left ${result.skipped} that were already written`
                : ""
            }`,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "portal", "teacher"] });
    },
  });

  if (error) {
    return <LoadError what="your classes" error={error} />;
  }

  if (!classSubjectId) {
    return (
      <EmptyState
        title="Pick a class first"
        body="Choose one of your classes in the rail on the left and its week of lessons opens here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {query.error ? (
        <LoadError
          what="this week"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {save.error ? <SaveError what="The lesson plan" error={save.error} /> : null}
      {copyWeek.error ? <SaveError what="Last week's plans" error={copyWeek.error} /> : null}
      {layOut.error ? <SaveError what="The week" error={layOut.error} /> : null}
      {saved ? (
        <Alert tone="success" title={saved} onDismiss={() => setSaved(null)} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            iconOnly
            aria-label="Previous week"
            disabled={!week}
            onClick={() => week && setWeekStart(shiftDate(week.weekStart, -7))}
          >
            <ChevronLeftIcon className="size-4" aria-hidden />
          </Button>
          <span className="min-w-[11rem] text-center text-[length:var(--type-body-sm)] font-semibold tabular-nums text-[color:var(--text-strong)]">
            {week ? weekLabel(days) : "Fetching this week…"}
          </span>
          <Button
            variant="ghost"
            iconOnly
            aria-label="Next week"
            disabled={!week}
            onClick={() => week && setWeekStart(shiftDate(week.weekStart, 7))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
        <Button
          variant="secondary"
          disabled={onThisWeek}
          onClick={() => setWeekStart("")}
        >
          This week
        </Button>
        <span className="flex-1" />
        {/* The two assists, in the order a term uses them: week one has no
            last week to copy, so the timetable lays the drafts out; from week
            two onwards copying forward carries the shape of the week. */}
        <Button
          variant="secondary"
          disabled={!week || unplanned === 0}
          loading={layOut.isPending}
          onClick={() => layOut.mutate()}
        >
          {week && unplanned > 0
            ? `Lay out this week (${unplanned})`
            : "Lay out this week"}
        </Button>
        <Button
          variant="secondary"
          disabled={!week || week.lastWeekPlans === 0}
          loading={copyWeek.isPending}
          onClick={() => setConfirmCopy(true)}
        >
          {week && week.lastWeekPlans > 0
            ? `Copy last week forward (${week.lastWeekPlans})`
            : "Copy last week forward"}
        </Button>
        <Button
          variant={unwrittenOnly ? "primary" : "secondary"}
          disabled={!week || unplanned === 0}
          onClick={() => setUnwrittenOnly((current) => !current)}
        >
          {unwrittenOnly ? "Showing what is missing" : "Show only what is missing"}
        </Button>
      </div>

      <Card
        title={
          week
            ? `${week.classSubject.className}${week.classSubject.streamName ? ` ${week.classSubject.streamName}` : ""} · ${week.classSubject.subjectName}`
            : `${selectedClass?.className ?? ""} · ${selectedClass?.subjectName ?? ""}`
        }
        subtitle={
          week
            ? `${week.classSubject.termName} · ${planned} of ${lessons.length} lesson${lessons.length === 1 ? "" : "s"} planned`
            : undefined
        }
        actions={
          week && unplanned > 0 ? (
            <Badge tone="warn">
              {unplanned} not written
            </Badge>
          ) : week ? (
            <Badge tone="success" dot>
              Every lesson planned
            </Badge>
          ) : null
        }
        flush
      >
        {query.isPending ? (
          /* The grid is cells, so the wait is cards rather than one grey
             rectangle that reflows into a week the moment it lands. */
          <div className="p-2">
            <CardsSkeleton count={6} columns={3} lines={2} />
          </div>
        ) : periods.length === 0 ? (
          <NothingYet
            title="The school day has no periods"
            body="Nobody has set up the periods a lesson can sit in, so there is no week to plan against. The office builds these under Academics."
          />
        ) : lessons.length === 0 ? (
          <NothingYet
            title="This class is not on the timetable"
            body="No lesson is scheduled for this class in this term, so there is nothing to plan. The office places lessons on the master timetable."
          />
        ) : shownPeriods.length === 0 ? (
          <NothingMatched
            what="lessons"
            filters={["still to be written"]}
            onClear={() => setUnwrittenOnly(false)}
          />
        ) : (
          /*
            Laying out and copying forward both write across the whole week, so
            the grid stops taking taps while either is in flight. A cell opened
            mid-copy would edit a plan the copy is about to replace.
          */
          <SavingOverlay
            saving={layOut.isPending || copyWeek.isPending}
            label={layOut.isPending ? "Laying out the week…" : "Copying last week…"}
          >
            <div className="overflow-x-auto p-2">
              <div
                className="grid min-w-[46rem] gap-1"
                style={{
                  gridTemplateColumns: `5.5rem repeat(${days.length}, minmax(8rem, 1fr))`,
                }}
              >
                <div aria-hidden />
                {days.map((weekDay) => (
                  <div
                    key={weekDay.date}
                    {...(weekDay.isToday ? { "aria-current": "date" as const } : {})}
                    className={[
                      "flex items-baseline justify-between rounded-[var(--radius-sm)] px-3 py-2",
                      weekDay.isToday
                        ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-strong)]"
                        : "text-[color:var(--text-muted)]",
                    ].join(" ")}
                  >
                    <span className="text-[length:var(--type-body-sm)] font-semibold">
                      {DAY_NAME.format(asDate(weekDay.date))}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums">
                      {weekDay.isToday ? "Today" : DAY_NUMBER.format(asDate(weekDay.date))}
                    </span>
                  </div>
                ))}

                {shownPeriods.map((period) => (
                  <Fragment key={period.id}>
                    <div className="flex flex-col justify-center px-2 py-1">
                      <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] font-semibold uppercase text-[color:var(--text-strong)]">
                        {period.code}
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                        {period.startsAt}
                      </span>
                    </div>

                    {days.map((weekDay) => {
                      const lesson = lessonAt(weekDay.date, period.id);

                      if (!lesson) {
                        return (
                          <div
                            key={`${weekDay.date}-${period.id}`}
                            className="min-h-[4.5rem] rounded-[var(--radius-sm)] border border-dashed border-[color:var(--border-subtle)]"
                          />
                        );
                      }

                      const isOpen = openKey === lesson.key;
                      return (
                        <button
                          key={lesson.key}
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => {
                            setSaved(null);
                            setOpenKey(lesson.key);
                            setDraft(draftFrom(lesson.plan));
                          }}
                          style={{
                            backgroundColor: lesson.plan
                              ? accentVar(hue, "bg")
                              : "var(--surface-muted)",
                            borderColor: isOpen
                              ? "var(--brand)"
                              : lesson.plan
                                ? accentVar(hue, "bd")
                                : "var(--border-subtle)",
                          }}
                          className="flex min-h-[4.5rem] flex-col items-start gap-1 rounded-[var(--radius-sm)] border px-3 py-2 text-left"
                        >
                          {lesson.cover ? (
                            <Badge accent="orange" size="sm" dot>
                              Cover
                            </Badge>
                          ) : null}
                          <span className="line-clamp-2 text-[length:var(--type-body-sm)] font-semibold text-[color:var(--text-strong)]">
                            {lesson.plan ? lesson.plan.topic : "Not written yet"}
                          </span>
                          <span className="mt-auto font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                            {period.startsAt} – {period.endsAt}
                            {lesson.roomName ? ` · ${lesson.roomName}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </SavingOverlay>
        )}
      </Card>

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpenKey(null)}
        position="right"
        title={open?.plan ? open.plan.topic : "New lesson plan"}
        description={
          open && openPeriod
            ? `${FULL_DAY.format(asDate(open.date))} · ${openPeriod.name} · ${openPeriod.startsAt} – ${openPeriod.endsAt}${open.roomName ? ` · ${open.roomName}` : ""}`
            : undefined
        }
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              {open?.plan ? "Saving replaces this plan" : "Saving writes a new plan"}
            </span>
            <Button variant="secondary" onClick={() => setOpenKey(null)}>
              Close
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!draft.topic.trim()}
              onClick={() => save.mutate()}
            >
              Save plan
            </Button>
          </div>
        }
      >
        {/* The four boxes stop taking words while the plan goes up. An
            objective typed mid-save is an objective the POST already left
            behind. */}
        <SavingOverlay saving={save.isPending} label="Saving the plan…">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge accent={hue} dot>
                {week?.classSubject.subjectName ?? selectedClass?.subjectName}
              </Badge>
              <Badge tone="outline">
                {week?.classSubject.className ?? selectedClass?.className}
                {week?.classSubject.streamName ? ` ${week.classSubject.streamName}` : ""}
              </Badge>
              <Badge tone={open?.plan ? "success" : "neutral"} dot>
                {open?.plan ? "Written" : "Not started"}
              </Badge>
            </div>

            {open?.cover ? (
              <Alert tone="warn" title="Somebody else is taking this lesson">
                <span className="flex items-center gap-2">
                  <PersonAvatar name={open.cover.teacherName ?? "Cover teacher"} size="sm" />
                  <span>
                    {open.cover.teacherName ?? "A colleague"} is covering
                    {open.cover.reason ? ` — ${open.cover.reason}` : ""}. Write the plan
                    they will teach from.
                  </span>
                </span>
              </Alert>
            ) : null}

            <Input
              label="Topic"
              value={draft.topic}
              placeholder="e.g. Linear equations — word problems"
              onChange={(event) =>
                setDraft((current) => ({ ...current, topic: event.target.value }))
              }
            />
            <TextArea
              label="What pupils should learn"
              hint="One objective a line. These are what the lesson is judged against."
              rows={5}
              value={draft.objectives}
              onChange={(event) =>
                setDraft((current) => ({ ...current, objectives: event.target.value }))
              }
            />
            <TextArea
              label="Materials and files"
              hint="Worksheets, slides, apparatus — whatever has to be in the room."
              rows={4}
              value={draft.resourcesNote}
              onChange={(event) =>
                setDraft((current) => ({ ...current, resourcesNote: event.target.value }))
              }
            />
            <TextArea
              label="Homework"
              hint="What is set, and when it is due back."
              rows={3}
              value={draft.homeworkNote}
              onChange={(event) =>
                setDraft((current) => ({ ...current, homeworkNote: event.target.value }))
              }
            />
          </div>
        </SavingOverlay>
      </Drawer>

      <Modal
        open={confirmCopy}
        onOpenChange={(next) => setConfirmCopy(next)}
        size="sm"
        title="Copy last week forward"
        description={
          week
            ? `Brings ${week.lastWeekPlans} plan${week.lastWeekPlans === 1 ? "" : "s"} from ${weekLabel(
                days.map((weekDay) => ({
                  ...weekDay,
                  date: shiftDate(weekDay.date, -7),
                })),
              )} into this week.`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmCopy(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={copyWeek.isPending}
              onClick={() => copyWeek.mutate()}
            >
              Copy {week?.lastWeekPlans ?? 0} plan
              {week?.lastWeekPlans === 1 ? "" : "s"}
            </Button>
          </div>
        }
      >
        <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
          A lesson that already has a plan is left exactly as it is; only the empty ones
          are filled in. Last week&apos;s reflections are not carried over, because they
          are notes about lessons that have already been taught.
        </p>
      </Modal>

      {day.term ? null : (
        <Alert tone="info" title="No term is running">
          The school has no active term, so this week is not anchored to one.
        </Alert>
      )}
    </div>
  );
}
