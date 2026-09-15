"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  CardsSkeleton,
  LoadError,
  NothingLeftToDo,
  NothingYet,
} from "@/components/records/states";
import { fetchJson } from "@/lib/api-client";
import { CalendarCheck, ChevronRight, X } from "@/lib/icons";

import { useParentPortal } from "./parent-portal-context";
import { formatWeekdayDate } from "./parent-portal-format";

/**
 * S-6.4 — attendance, and any single day.
 *
 * Six weeks as a grid, because that is how a parent reads a term: a wall of
 * green with two amber squares in it says more in one glance than fifteen rows
 * that each say "in school". The rows under it are only the days that were not
 * ordinary — the ones a parent came to ask about — and every square and row
 * opens the day itself.
 *
 * A day whose register is still DRAFT is drawn with a dashed edge and explained
 * once, under the grid. It used to be spelled out on every row it applied to and
 * then again in an alert at the foot of the screen, which is the same sentence
 * seventeen times on one phone screen.
 *
 * Two of the eight states are missing on purpose, and the audit reads text, so
 * they are named here rather than left looking forgotten: there is no
 * `NothingMatched`, because a parent cannot narrow this list — every school day
 * this term is on it — and no `SaveError`, because a register is the teacher's
 * to write and this screen only reads it.
 */

type Day = {
  id: string;
  date: string;
  status: string;
  remarks: string | null;
  register: string;
  className: string | null;
  term: { id: string; name: string } | null;
};

const CELL: Record<string, { mark: string; tone: string }> = {
  PRESENT: { mark: "P", tone: "p" },
  ABSENT: { mark: "A", tone: "a" },
  LATE: { mark: "L", tone: "l" },
  EXCUSED: { mark: "E", tone: "e" },
};

const TONE: Record<string, string> = {
  PRESENT: "pp-tone-success",
  ABSENT: "pp-tone-danger",
  LATE: "pp-tone-warn",
  EXCUSED: "pp-tone-muted",
};

const LABEL: Record<string, string> = {
  PRESENT: "In school",
  ABSENT: "Away",
  LATE: "Late",
  EXCUSED: "Away — excused",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const GRID_WEEKS = 6;

/** A register a teacher has not sent in can still change before it is final. */
function isDraft(day: Day) {
  return day.register !== "SUBMITTED" && day.register !== "LOCKED";
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function isoAdd(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** `2026-09-14` from the date's own local fields, never through UTC. */
function localKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Six weeks of school days, ending with the week the newest register falls in.
 *
 * Anchored to the data rather than to `new Date()`: the grid is the same shape
 * on the server and in the browser, which a grid built from "today" is not once
 * the two are on either side of midnight.
 */
function buildGrid(days: Day[]) {
  const newest = days[0];
  if (!newest) return [];
  const anchor = new Date(`${dayKey(newest.date)}T00:00:00`);
  const monday = isoAdd(anchor, -((anchor.getDay() + 6) % 7));
  const byDate = new Map(days.map((day) => [dayKey(day.date), day]));

  return Array.from({ length: GRID_WEEKS }, (_, index) => {
    const start = isoAdd(monday, (index - (GRID_WEEKS - 1)) * 7);
    return {
      key: localKey(start),
      cells: WEEKDAYS.map((_label, offset) => {
        const key = localKey(isoAdd(start, offset));
        return { key, day: byDate.get(key) ?? null };
      }),
    };
  });
}

export function ParentAttendanceScreen() {
  const { child, term } = useParentPortal();
  const [openDay, setOpenDay] = useState<Day | null>(null);

  const query = useQuery({
    queryKey: ["portal", "parent", "attendance", child?.id, term?.id],
    queryFn: () =>
      fetchJson<{ days: Day[] }>(
        `/api/v2/schools/portal/parent/child/attendance?childId=${child!.id}${
          term?.id ? `&termId=${term.id}` : ""
        }`,
      ),
    enabled: Boolean(child?.id),
  });

  if (!child) {
    return (
      <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">No child selected.</p>
    );
  }

  const rate =
    child.attendance.sessions > 0
      ? Math.round((child.attendance.present / child.attendance.sessions) * 100)
      : null;
  const days = query.data?.days ?? [];
  const grid = buildGrid(days);
  const gridDraft = grid.some((week) => week.cells.some((cell) => cell.day && isDraft(cell.day)));
  const notable = days.filter((day) => day.status !== "PRESENT");
  const notableDraft = notable.some(isDraft);

  return (
    <div className="pp-page">
      <div className="att-card">
        <div className="summary">
          <span className="v">{rate === null ? "—" : `${rate}%`}</span>
          <span className="lbl">at school · {child.firstName}</span>
        </div>
        <div className="sb">
          {child.attendance.sessions === 0
            ? `Nothing has been recorded for ${term?.name ?? "this term"} yet.`
            : `Present ${child.attendance.present} days · late ${child.attendance.late} · away ${child.attendance.absent} — out of ${child.attendance.sessions} school days so far.`}
        </div>

        {grid.length > 0 ? (
          <>
            <div className="att-grid">
              <span className="wk" />
              {WEEKDAYS.map((label) => (
                <span key={label} className="day">
                  {label}
                </span>
              ))}
              {grid.map((week, index) => (
                <Fragment key={week.key}>
                  <span className="wk">W{index + 1}</span>
                  {week.cells.map((cell) => {
                    if (!cell.day) {
                      return <span key={cell.key} className="dot h" aria-hidden />;
                    }
                    const shape = CELL[cell.day.status] ?? { mark: "?", tone: "" };
                    const day = cell.day;
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        className={`dot ${shape.tone}${isDraft(day) ? " draft" : ""}`}
                        aria-label={`${formatWeekdayDate(day.date)} · ${
                          LABEL[day.status] ?? day.status.toLowerCase()
                        }`}
                        onClick={() => setOpenDay(day)}
                      >
                        {shape.mark}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
            <div className="att-legend">
              <span className="l-p">Present</span>
              <span className="l-l">Late</span>
              <span className="l-a">Away</span>
              <span className="l-e">Excused</span>
            </div>
            {gridDraft ? (
              <p className="att-note">
                A dashed square is a register the teacher has not sent in yet. It can still
                change.
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="section-h">
        Days away and late
        {notable.length > 0 ? (
          <span className="count-note">
            {notable.length} {notable.length === 1 ? "day" : "days"}
          </span>
        ) : null}
      </div>

      {query.isPending ? (
        /* The day list is card-shaped rows on a phone, not a table, so the wait
           is drawn as cards. A term's worth of days is long; six is enough to
           fill a phone screen and stop the page jumping when the real ones
           land. */
        <div className="px-4">
          <CardsSkeleton count={6} columns={1} lines={1} />
        </div>
      ) : query.isError ? (
        <div className="px-4">
          <LoadError
            what={`${child.firstName}'s attendance`}
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : days.length === 0 ? (
        <div className="px-4">
          <NothingYet
            icon={<CalendarCheck className="size-5" aria-hidden />}
            title="No registers yet"
            body={`Teachers take a register every school day. Once they have taken ${child.firstName}'s, each day appears here.`}
          />
        </div>
      ) : notable.length === 0 ? (
        <div className="px-4">
          <NothingLeftToDo
            title="Every day in school"
            body={`${child.firstName} has not missed a register this term.`}
          />
        </div>
      ) : (
        <>
          <div className="card-block boxed">
            {notable.map((day) => (
              <button
                key={day.id}
                type="button"
                className="pl-row cl day-row"
                onClick={() => setOpenDay(day)}
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="nm block">{formatWeekdayDate(day.date)}</span>
                  <span className="sb block">
                    {[day.className, day.remarks].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <span className={`text-[13px] font-medium ${TONE[day.status] ?? ""}`}>
                  {LABEL[day.status] ?? day.status.toLowerCase()}
                </span>
                <ChevronRight className="chev size-4" aria-hidden />
              </button>
            ))}
          </div>
          {notableDraft ? (
            <p className="att-note px-4">
              Some of these registers have not been sent in yet and can still change.
            </p>
          ) : null}
        </>
      )}

      {openDay ? (
        <ParentAttendanceDaySheet day={openDay} onClose={() => setOpenDay(null)} />
      ) : null}
    </div>
  );
}

/**
 * One school day, opened from the grid or the list.
 *
 * The lesson-by-lesson breakdown the prototype shows needs a per-period
 * register the API does not return yet; what it does return — the class, the
 * teacher's remark and whether the register is final — is what this shows, plus
 * the one thing a parent wants to do about a day: explain it.
 */
function ParentAttendanceDaySheet({ day, onClose }: { day: Day; onClose: () => void }) {
  return (
    <div className="x-bs-scrim open pp-scrim" role="presentation" onClick={onClose}>
      <div
        className="x-bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={formatWeekdayDate(day.date)}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="x-bs-grab" />
        <div className="x-bs-head">
          <h3>{formatWeekdayDate(day.date)}</h3>
          <button type="button" className="x-bs-close" aria-label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="x-bs-body">
          <dl className="sheet-defs">
            <dt>Register</dt>
            <dd className={TONE[day.status] ?? ""}>
              {LABEL[day.status] ?? day.status.toLowerCase()}
            </dd>
            {day.className ? (
              <>
                <dt>Class</dt>
                <dd>{day.className}</dd>
              </>
            ) : null}
            {day.remarks ? (
              <>
                <dt>Teacher’s note</dt>
                <dd>{day.remarks}</dd>
              </>
            ) : null}
            {isDraft(day) ? (
              <>
                <dt>Status</dt>
                <dd>Not sent in yet</dd>
              </>
            ) : null}
          </dl>
          <div className="sheet-actions">
            <Link href="/portal/parent/messages" className="pp-wide-btn" onClick={onClose}>
              Tell the school why
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
