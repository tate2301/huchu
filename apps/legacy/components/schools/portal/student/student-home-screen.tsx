"use client";

import Link from "next/link";
import { EmptyState } from "@corelithzw/react";
import {
  BarChart3,
  Bell,
  ChevronRight,
  MapPin,
  MedusaBookOpenIcon,
  ListBullets,
} from "@/lib/icons";
import { useStudentPortal } from "./student-portal-context";

/**
 * The demo's "Quick links" grid: where the rest of the app lives, since only
 * four things get a bottom tab.
 */
const QUICK_LINKS = [
  {
    href: "/portal/student/homework",
    label: "Homework",
    value: "See all",
    body: "What is set and what you handed in",
    icon: ListBullets,
  },
  {
    href: "/portal/student/library",
    label: "Library",
    value: "Books out",
    body: "Borrow a book, or see what you have",
    icon: MedusaBookOpenIcon,
  },
  {
    href: "/portal/student/goals",
    label: "My goals",
    value: "Your targets",
    body: "What you are aiming for each subject",
    icon: BarChart3,
  },
  {
    href: "/portal/student/notifications",
    label: "Messages",
    value: "From school",
    body: "School news · marks · homework",
    icon: Bell,
  },
];

function nowMinute() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * A pupil's home screen: what is happening now, and what is next.
 *
 * The order is the prototype's — greeting, next class, this week's numbers,
 * then the quick links — because the day is what a pupil opens the app to check
 * between lessons. Everything else on the phone is one tap from here, which is
 * why only four things earn a bottom tab: a row of eight is a row nobody reads.
 *
 * The demo also carries a week-at-a-glance strip and an eight-test sparkline.
 * Both need numbers this screen is not given — the layout hands down today's
 * periods and nothing else — so they are left out rather than invented.
 */
export function StudentHomeScreen() {
  const { student, term, periods } = useStudentPortal();

  if (!student) {
    return (
      <EmptyState
        title="This account is not linked to a pupil"
        body="Ask the school office to link your sign-in to your student record. Until they do, there is nothing here to show you."
      />
    );
  }

  const minute = nowMinute();
  const lessons = periods.filter((period) => period.lesson);
  const current =
    periods.find(
      (period) => minute >= period.startMinute && minute < period.endMinute,
    ) ?? null;
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
        <EmptyState
          title="Nothing left today"
          body={
            lessons.length > 0
              ? "Your last lesson has been and gone."
              : "There are no lessons on your timetable for today."
          }
        />
      )}

      <div className="sp-psh">
        This week
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
        <Link href="/portal/student/timetable" className="sp-kpi brand">
          <span className="sp-kpi-l block">Right now</span>
          <span
            className={`sp-kpi-v block truncate${current?.lesson ? " sm" : ""}`}
          >
            {current?.lesson?.subjectName ?? (current ? "Free" : "—")}
          </span>
          <span className="sp-kpi-sb block">
            {current
              ? `${current.startsAt} – ${current.endsAt}`
              : "No lesson at the moment"}
          </span>
        </Link>
      </div>

      <div className="sp-psh">Quick links</div>
      <div className="sp-kpi-row">
        {QUICK_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="sp-kpi">
            <span className="sp-kpi-l flex items-center gap-1.5">
              <item.icon className="size-3.5" aria-hidden />
              {item.label}
            </span>
            <span className="sp-kpi-v sm block">{item.value}</span>
            <span className="sp-kpi-sb block">{item.body}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
