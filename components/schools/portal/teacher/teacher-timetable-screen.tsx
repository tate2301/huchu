"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  accentVar,
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
} from "@corelithzw/react";
import { ChevronLeftIcon, ChevronRight } from "@/lib/icons";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import { useTeacherPortal } from "./teacher-portal-context";
import { hueFor, subjectHues } from "./teacher-subject-hues";

type WeekDay = { dayOfWeek: number; date: string; isToday: boolean };

type WeekPeriod = {
  id: string;
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  startsAt: string;
  endsAt: string;
};

type WeekLesson = {
  slotId: string;
  dayOfWeek: number;
  periodId: string;
  classSubjectId: string;
  classId: string;
  classCode: string;
  className: string;
  streamName: string | null;
  subjectCode: string;
  subjectName: string;
  roomName: string | null;
};

type WeekCover = {
  coverId: string;
  lessonPlanId: string;
  date: string;
  dayOfWeek: number;
  periodId: string | null;
  topic: string;
  className: string;
  streamName: string | null;
  subjectName: string;
  roomName: string | null;
  forTeacherName: string | null;
  reason: string | null;
};

type Week = {
  term: { id: string; code: string; name: string } | null;
  weekStart: string;
  today: string;
  days: WeekDay[];
  periods: WeekPeriod[];
  lessons: WeekLesson[];
  cover: WeekCover[];
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

/** ISO date string shifted by whole days, in UTC so it cannot slide a day. */
function shiftDate(iso: string, days: number) {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function asDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
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

/**
 * A teacher's own week.
 *
 * Days across, periods down — the shape a timetable has on a staffroom wall,
 * and the shape the demo builds, because it is the only one that answers
 * "when am I free on Wednesday" at a glance. A list of lessons cannot: it
 * throws away the empty space, which is half the information.
 *
 * Free periods are drawn, not omitted. A week that hid them would read as a
 * shorter week than it is, and the gaps are where marking and preparation
 * actually go.
 *
 * Subject colour is categorical, not decorative, so it comes from
 * `hueFor(subject)` — the same subject is the same hue everywhere in the
 * portal, the class rail included, derived rather than chosen, and every hue
 * is a token. Cover keeps its own hue and
 * carries the word "Cover" as well, because a lesson somebody else's class is
 * waiting for must not be distinguishable by colour alone.
 */
export function TeacherTimetableScreen() {
  const { day, error, setClassSubjectId } = useTeacherPortal();
  const queryClient = useQueryClient();
  /**
   * Empty means "the week the school is in", which the server decides.
   *
   * The same reasoning as the register's date: a shared tablet's clock is not
   * the school's, and which Monday this is belongs to the school. Once a week
   * has arrived, stepping through them is arithmetic on the date the server
   * sent back.
   */
  const [weekStart, setWeekStart] = useState("");
  const [selected, setSelected] = useState<{ date: string; periodId: string } | null>(
    null,
  );
  /**
   * A free period is information — it is where marking goes — so the grid
   * draws them by default. But a teacher checking "what am I actually teaching
   * on Thursday" is reading past eight empty cells to find three, and this
   * takes them out of the way without pretending the week is shorter.
   */
  const [teachingOnly, setTeachingOnly] = useState(false);
  const [laidOut, setLaidOut] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["schools", "portal", "teacher", "timetable", weekStart],
    queryFn: () =>
      fetchJson<Week>(
        `/api/v2/schools/portal/teacher/me/timetable${weekStart ? `?weekStart=${weekStart}` : ""}`,
      ),
    enabled: Boolean(day.teacher && day.term),
  });

  const week = query.data ?? null;
  const days = week?.days ?? [];
  const periods = week?.periods ?? [];
  const lessons = week?.lessons ?? [];
  const cover = week?.cover ?? [];

  const lessonAt = (dayOfWeek: number, periodId: string) =>
    lessons.find((row) => row.dayOfWeek === dayOfWeek && row.periodId === periodId) ??
    null;
  const coverAt = (date: string, periodId: string) =>
    cover.find((row) => row.date === date && row.periodId === periodId) ?? null;

  const taught = days.length * periods.length;
  const teaching = days.reduce(
    (total, weekDay) =>
      total +
      periods.filter(
        (period) =>
          lessonAt(weekDay.dayOfWeek, period.id) || coverAt(weekDay.date, period.id),
      ).length,
    0,
  );
  const free = taught - teaching;

  const onThisWeek = week ? weekStart === "" || weekStart === week.weekStart : true;
  const isThisWeek = days.some((weekDay) => weekDay.isToday);

  // A plain filter over at most a dozen periods, deliberately not memoised:
  // its inputs are all `week?.x ?? []`, rebuilt every render, so a manual memo
  // would never hit and the React Compiler refuses to preserve it.
  const shownPeriods = teachingOnly
    ? periods.filter((period) =>
        days.some(
          (weekDay) =>
            lessons.some(
              (row) => row.dayOfWeek === weekDay.dayOfWeek && row.periodId === period.id,
            ) ||
            cover.some((row) => row.date === weekDay.date && row.periodId === period.id),
        ),
      )
    : periods;

  // The subjects on this week's grid, each with the hue its cells carry —
  // the same subject → hue mapping the class rail paints its bars with, so a
  // colour means one subject everywhere in the portal.
  const hues = subjectHues(day.classes);
  const legend = [...new Set(lessons.map((row) => row.subjectName))].sort();

  const openCell = selected
    ? {
        lesson:
          lessons.find(
            (row) =>
              row.periodId === selected.periodId &&
              days.find((weekDay) => weekDay.date === selected.date)?.dayOfWeek ===
                row.dayOfWeek,
          ) ?? null,
        cover: coverAt(selected.date, selected.periodId),
        period: periods.find((row) => row.id === selected.periodId) ?? null,
      }
    : null;

  /**
   * The verb the cell was missing. Opening a lesson used to offer two links
   * and nothing to do here, so a teacher who noticed an unplanned Thursday had
   * to walk to the planner to start it. This lays the week's drafts out from
   * the same endpoint the planner uses, against the class the cell names.
   */
  const layOut = useMutation({
    mutationFn: (input: { classSubjectId: string; weekStart: string }) =>
      fetchJson<{ created: number; message: string | null }>(
        "/api/v2/schools/portal/teacher/me/lessons",
        {
          method: "POST",
          body: JSON.stringify({
            action: "lay-out-week",
            classSubjectId: input.classSubjectId,
            weekStart: input.weekStart,
          }),
        },
      ),
    onSuccess: (result) => {
      setLaidOut(
        result.created === 0
          ? (result.message ?? "Every lesson this week already has a plan")
          : `${result.created} draft${result.created === 1 ? "" : "s"} laid out. Open the planner to name the topics.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "portal", "teacher"] });
    },
  });

  if (error) {
    return <LoadError what="your week" error={error} />;
  }

  if (!day.teacher) {
    return (
      <EmptyState
        title="You are not linked to a teacher profile"
        body="Ask the school office to link your account to your staff record. Until then there is no timetable to draw."
      />
    );
  }

  if (!day.term) {
    return (
      <EmptyState
        title="No term is running"
        body="The school has no active term, so there is no timetable to lay a week against."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {query.error ? (
        <LoadError
          what="your week"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {layOut.error ? <SaveError what="The week's drafts" error={layOut.error} /> : null}
      {laidOut ? (
        <Alert tone="success" title={laidOut} onDismiss={() => setLaidOut(null)} />
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
            {week ? weekLabel(days) : "Fetching your week…"}
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
        <Button
          variant={teachingOnly ? "primary" : "secondary"}
          disabled={!week || free === 0}
          onClick={() => setTeachingOnly((current) => !current)}
        >
          {teachingOnly ? "Showing lessons only" : "Hide free periods"}
        </Button>
        <span className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          {legend.map((subject) => (
            <Badge key={subject} accent={hueFor(hues, subject)} dot>
              {subject}
            </Badge>
          ))}
          {cover.length > 0 ? (
            <Badge accent="orange" dot>
              Cover lesson
            </Badge>
          ) : null}
        </div>
      </div>

      <Card
        title={day.term.name}
        subtitle={
          week
            ? `${teaching} lesson${teaching === 1 ? "" : "s"} · ${free} free period${free === 1 ? "" : "s"}${isThisWeek ? " · this week" : ""}`
            : undefined
        }
        flush
      >
        {query.isPending ? (
          /* The grid is cells, so the wait is cards — one grey rectangle
             reflows into a whole week the moment the data lands. */
          <div className="p-2">
            <CardsSkeleton count={6} columns={3} lines={2} />
          </div>
        ) : periods.length === 0 ? (
          <NothingYet
            title="The school day has no periods"
            body="Nobody has set up the periods a lesson can sit in, so there is no grid to lay your week against. The office builds these under Academics."
          />
        ) : lessons.length === 0 && cover.length === 0 ? (
          <NothingYet
            title="Nothing is timetabled for you this week"
            body="No lesson has been placed against your name in this term. The office builds the master timetable under Timetable."
          />
        ) : shownPeriods.length === 0 ? (
          <NothingMatched
            what="periods"
            filters={["lessons only"]}
            onClear={() => setTeachingOnly(false)}
          />
        ) : (
          /* Laying the week's drafts out writes against the class the open
             cell names, so the grid stops taking taps until it lands. */
          <SavingOverlay saving={layOut.isPending} label="Laying out the week…">
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
                        {period.startsAt} – {period.endsAt}
                      </span>
                    </div>

                    {days.map((weekDay) => {
                      const covering = coverAt(weekDay.date, period.id);
                      const lesson = covering
                        ? null
                        : lessonAt(weekDay.dayOfWeek, period.id);

                      if (!lesson && !covering) {
                        return (
                          <div
                            key={`${weekDay.date}-${period.id}`}
                            className={[
                              "flex min-h-[4.25rem] flex-col justify-center rounded-[var(--radius-sm)] border border-dashed px-3 py-2",
                              weekDay.isToday
                                ? "border-[color:var(--brand)]"
                                : "border-[color:var(--border-subtle)]",
                            ].join(" ")}
                          >
                            <span className="text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-muted)]">
                              Free
                            </span>
                            <span className="text-[length:var(--type-caption)] text-[color:var(--text-subtle)]">
                              Nothing timetabled
                            </span>
                          </div>
                        );
                      }

                      const hue = covering ? "orange" : hueFor(hues, lesson?.subjectName);
                      const title = covering
                        ? `${covering.className}${covering.streamName ? ` ${covering.streamName}` : ""}`
                        : `${lesson?.className}${lesson?.streamName ? ` ${lesson.streamName}` : ""}`;
                      const subject = covering
                        ? covering.subjectName
                        : (lesson?.subjectName ?? "");
                      const room = covering ? covering.roomName : (lesson?.roomName ?? null);

                      return (
                        <button
                          key={`${weekDay.date}-${period.id}`}
                          type="button"
                          onClick={() =>
                            setSelected({ date: weekDay.date, periodId: period.id })
                          }
                          style={{
                            backgroundColor: accentVar(hue, "bg"),
                            borderColor: weekDay.isToday
                              ? "var(--brand)"
                              : accentVar(hue, "bd"),
                          }}
                          className="flex min-h-[4.25rem] flex-col items-start gap-0.5 rounded-[var(--radius-sm)] border px-3 py-2 text-left"
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className="size-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: accentVar(hue, "solid") }}
                            />
                            <span className="text-[length:var(--type-body-sm)] font-semibold text-[color:var(--text-strong)]">
                              {title}
                            </span>
                          </span>
                          <span className="truncate text-[length:var(--type-caption)] text-[color:var(--text-body)]">
                            {subject}
                          </span>
                          <span className="mt-auto font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                            {covering ? "Cover" : (room ?? "No room set")}
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

      {cover.length > 0 ? (
        <Alert
          tone="info"
          title={`You are covering ${cover.length} lesson${cover.length === 1 ? "" : "s"} this week`}
        >
          A cover lesson is another teacher&apos;s class, taken by you for one day. It
          sits in your week in orange, and the plan they left for you is on the card.
        </Alert>
      ) : null}

      <Modal
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        size="md"
        title={
          openCell?.cover
            ? `Cover · ${openCell.cover.className}${openCell.cover.streamName ? ` ${openCell.cover.streamName}` : ""} · ${openCell.cover.subjectName}`
            : openCell?.lesson
              ? `${openCell.lesson.className}${openCell.lesson.streamName ? ` ${openCell.lesson.streamName}` : ""} · ${openCell.lesson.subjectName}`
              : "Lesson"
        }
        description={
          selected && openCell?.period
            ? `${FULL_DAY.format(asDate(selected.date))} · ${openCell.period.name} · ${openCell.period.startsAt} – ${openCell.period.endsAt}`
            : undefined
        }
        footer={
          openCell?.lesson ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                loading={layOut.isPending}
                onClick={() => {
                  if (!openCell.lesson || !week) return;
                  setLaidOut(null);
                  layOut.mutate({
                    classSubjectId: openCell.lesson.classSubjectId,
                    weekStart: week.weekStart,
                  });
                }}
              >
                Lay out this week
              </Button>
              <Button variant="secondary" asChild>
                <Link
                  href="/portal/teacher/lessons"
                  onClick={() => {
                    if (openCell.lesson) setClassSubjectId(openCell.lesson.classSubjectId);
                  }}
                >
                  Open lesson plans
                </Link>
              </Button>
              <Button variant="primary" asChild>
                <Link
                  href="/portal/teacher/attendance"
                  onClick={() => {
                    if (openCell.lesson) setClassSubjectId(openCell.lesson.classSubjectId);
                  }}
                >
                  Mark the register
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          )
        }
      >
        {openCell?.cover ? (
          <div className="flex flex-col gap-3">
            <Badge accent="orange" dot>
              Cover lesson
            </Badge>
            <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
              You are standing in for{" "}
              {openCell.cover.forTeacherName ?? "the usual teacher"}
              {openCell.cover.roomName ? ` in ${openCell.cover.roomName}` : ""}.
            </p>
            <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] px-4 py-3">
              <p className="text-[length:var(--type-caption)] uppercase text-[color:var(--text-muted)]">
                Lesson plan left for you
              </p>
              <p className="text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                {openCell.cover.topic}
              </p>
            </div>
            {openCell.cover.reason ? (
              <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                Reason given: {openCell.cover.reason}
              </p>
            ) : null}
          </div>
        ) : openCell?.lesson ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] px-4 py-3">
              <p className="text-[length:var(--type-caption)] uppercase text-[color:var(--text-muted)]">
                Room
              </p>
              <p className="text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                {openCell.lesson.roomName ?? "No room set"}
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] px-4 py-3">
              <p className="text-[length:var(--type-caption)] uppercase text-[color:var(--text-muted)]">
                On the roll
              </p>
              <p className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] font-medium tabular-nums text-[color:var(--text-strong)]">
                {day.classes.find(
                  (row) => row.classSubjectId === openCell.lesson?.classSubjectId,
                )?.size ?? 0}{" "}
                pupils
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
