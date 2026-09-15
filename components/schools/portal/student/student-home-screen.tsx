"use client";

import Link from "next/link";
import {
  NothingLeftToDo,
  NothingYet,
} from "@/components/records/states";
import {
  AlertTriangle,
  Bell,
  ChevronRight,
  Clock,
  MapPin,
  MedusaBookOpenIcon,
} from "@/lib/icons";
import { formatSchoolMoney } from "@/lib/schools/format";
import { useStudentPortal } from "./student-portal-context";
import { subjectAccentClass } from "./student-subject-accent";

/**
 * "Due today", "2 days late" — the sentence a pupil reads before the title.
 *
 * The days are the server's count, as they are on the homework screen: a phone
 * with the wrong date would otherwise disagree with the teacher about whether
 * the work is late.
 */
function deadline(days: number | null) {
  if (days === null) return "No date to hand it in by";
  if (days < 0) {
    const late = Math.abs(days);
    return `${late} ${late === 1 ? "day" : "days"} late`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

function nowMinute() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * A pupil's home screen: what is due, what is next, and how it is going.
 *
 * What is due comes first. A child opens this between lessons to find out what
 * they owe somebody, not to be told what period it is — the period is on the
 * bell and on the wall, and the essay due at two o'clock is not. The next class
 * follows, then the numbers, then the two screens that are not tabs.
 *
 * Every tile carries a figure. The counts ride down with the pupil's own record
 * from `student-day-loader.ts`, so the whole screen paints at once rather than
 * filling in four tiles from four requests while the reader watches.
 */
export function StudentHomeScreen() {
  const { student, term, periods, homework, latestMark, library, unread } =
    useStudentPortal();

  if (!student) {
    return (
      <NothingYet
        title="This account is not linked to a pupil"
        body="Ask the school office to link your sign-in to your student record. Until they do, there is nothing here to show you."
      />
    );
  }

  const minute = nowMinute();
  const lessons = periods.filter((period) => period.lesson);
  const next = periods.find(
    (period) => period.startMinute > minute && period.lesson !== null,
  );
  const nextIndex = next ? periods.indexOf(next) + 1 : 0;

  return (
    <div className="flex flex-col">
      {/* The greeting itself is the app bar's, as in the prototype; this line is
          the school context under it. */}
      <div className="sp-greet">
        {[student.currentClass?.name, student.currentStream?.name, term?.name]
          .filter(Boolean)
          .join(" · ") || "No year group yet"}
      </div>

      <div className="sp-psh">
        {/* The rows below show three; the count says how many there are. */}
        Due soon · {homework.due}
        {homework.overdue > 0 ? ` · ${homework.overdue} late` : ""}
        <Link href="/portal/student/homework" className="sp-psh-link">
          All homework
        </Link>
      </div>
      {homework.soon.length === 0 ? (
        <NothingLeftToDo
          title="Nothing to hand in"
          body="Everything your teachers have set is in. New homework turns up here as soon as it is given out."
        />
      ) : (
        <div className="sp-list">
          {homework.soon.map((row) => (
            <Link
              key={row.id}
              href="/portal/student/homework"
              className="sp-list-row"
            >
              <span
                className={`sp-ic-tile ${subjectAccentClass(row.subjectName)}`}
              >
                {row.isOverdue ? (
                  <AlertTriangle className="size-4" aria-hidden />
                ) : (
                  <Clock className="size-4" aria-hidden />
                )}
              </span>
              <span className="block min-w-0">
                <span className="sp-lr-nm block truncate">{row.title}</span>
                <span className="sp-lr-sb block truncate">
                  {row.subjectName} · {deadline(row.dueInDays)}
                </span>
              </span>
              <span className="sp-lr-chev">
                <ChevronRight className="size-4" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="sp-psh">
        Your next class
        <Link href="/portal/student/timetable" className="sp-psh-link">
          See timetable
        </Link>
      </div>
      {next?.lesson ? (
        <Link href="/portal/student/timetable" className="sp-next-class">
          <span className="sp-nc-badge">
            <span className="sp-nc-col">
              <span className="sp-nc-t">{next.startsAt}</span>
              <span className="sp-nc-d">
                {nextIndex > 0 ? `Per ${nextIndex}` : next.code}
              </span>
            </span>
          </span>
          <span className="block min-w-0">
            <span className="sp-nc-nm block truncate">
              {next.lesson.subjectName}
            </span>
            <span className="sp-nc-sb block truncate">
              {next.lesson.teacherName ?? "Your teacher"} · {next.name}
            </span>
            <span className="sp-nc-meta">
              {next.lesson.roomName ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-[11px]" aria-hidden />
                  {next.lesson.roomName}
                </span>
              ) : null}
              <span>
                {next.startsAt} – {next.endsAt}
              </span>
            </span>
          </span>
          <span className="sp-nc-chev">
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </Link>
      ) : (
        <NothingLeftToDo
          title="Nothing left today"
          body={
            lessons.length > 0
              ? "Your last lesson has been and gone."
              : "There are no lessons on your timetable for today."
          }
        />
      )}

      <div className="sp-psh">
        How it is going
        <Link href="/portal/student/timetable" className="sp-psh-link">
          Whole week
        </Link>
      </div>
      <div className="sp-kpi-row">
        <Link href="/portal/student/timetable" className="sp-kpi">
          <span className="sp-kpi-l block">Lessons today</span>
          <span className="sp-kpi-v block">{lessons.length}</span>
          <span className="sp-kpi-sb block">
            {lessons.length === 0
              ? "Nothing timetabled"
              : `${periods.length} periods on your day`}
          </span>
        </Link>
        {latestMark ? (
          <Link href="/portal/student/marks" className="sp-kpi brand">
            <span className="sp-kpi-l block">Latest mark</span>
            <span className="sp-kpi-v block">
              {latestMark.score}
              {latestMark.delta === null ? null : (
                <span
                  className={`sp-kpi-delta${latestMark.delta < 0 ? " down" : ""}`}
                >
                  {latestMark.delta > 0 ? "+" : ""}
                  {latestMark.delta}
                </span>
              )}
            </span>
            <span className="sp-kpi-sb block truncate">
              {latestMark.subject}
            </span>
          </Link>
        ) : null}
        <Link href="/portal/student/library" className="sp-kpi">
          <span className="sp-kpi-l flex items-center gap-1.5">
            <MedusaBookOpenIcon className="size-3.5" aria-hidden />
            Books out
          </span>
          <span className="sp-kpi-v block">{library.out}</span>
          <span className="sp-kpi-sb block">
            {library.fines > 0
              ? `${formatSchoolMoney(library.fines)} to pay`
              : library.overdue > 0
                ? `${library.overdue} to bring back`
                : "Nothing to bring back"}
          </span>
        </Link>
        <Link href="/portal/student/notifications" className="sp-kpi">
          <span className="sp-kpi-l flex items-center gap-1.5">
            <Bell className="size-3.5" aria-hidden />
            New messages
          </span>
          <span className="sp-kpi-v block">{unread}</span>
          <span className="sp-kpi-sb block">
            {unread === 0
              ? "You are caught up"
              : "School news · marks · homework"}
          </span>
        </Link>
      </div>
    </div>
  );
}
