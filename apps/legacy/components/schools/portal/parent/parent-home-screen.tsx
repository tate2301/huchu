"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  CardsSkeleton,
  LoadError,
  NothingYet,
} from "@/components/schools/common/states";
import { fetchJson } from "@corelithzw/platform/api-client";
import { formatSchoolDate, formatSchoolMoney } from "@/lib/schools/format";
import { ArrowRight, Bell, CalendarCheck, ChevronRight, Info, Receipt } from "@corelithzw/ui/lib/icons";

import { useParentPortal } from "./parent-portal-context";

/**
 * S-6.3 — what changed for this child.
 *
 * The order is the order a parent asks: who am I and where are we in the term,
 * what do I owe, what is my child doing today, how are they doing, and what has
 * the school said. Each block is a door to the screen that expands it, because a
 * home screen that answers everything is a screen nobody reads.
 *
 * A figure a parent may not see is not shown as zero. A guardian without
 * `canReceiveFinancials` gets no fee hero at all — the loader does not even fetch
 * the balance — because "0.00 owed" is a wrong answer where "not shown to you" is
 * a true one.
 *
 * Two of the eight states are missing on purpose, and the audit reads text, so
 * they are named here rather than left looking forgotten: there is no
 * `NothingMatched`, because a parent cannot narrow this screen — the school
 * decides what is on it — and no `SaveError`, because Home writes nothing back.
 */

type Notice = {
  id: string;
  title: string;
  summary: string | null;
  severity: string;
  type: string;
  sentAt: string;
  isRead: boolean;
};

/** The greeting caption. Real time of day on the phone holding it. */
function greeting(now: Date) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Minutes from midnight, to find the lesson a parent is asking about. */
function nowMinute(now: Date) {
  return now.getHours() * 60 + now.getMinutes();
}

const NOTICE_TONE: Record<string, string> = {
  CRITICAL: "danger",
  WARNING: "warn",
};

export function ParentHomeScreen() {
  const { guardian, child, term, schoolName, unreadNotices } = useParentPortal();

  /**
   * The first few notices, for the preview.
   *
   * The same query key as the News screen, so opening News after Home is a cache
   * hit rather than a second round trip, and marking one read there updates the
   * pips here.
   */
  const notices = useQuery({
    queryKey: ["portal", "parent", "notices"],
    queryFn: () =>
      fetchJson<{ notices: Notice[]; unread: number }>("/api/v2/schools/portal/parent/notices"),
  });

  if (!guardian) {
    return (
      <div className="space-y-2 px-4 py-8 text-center">
        <p className="font-medium">This account is not linked to a family yet.</p>
        <p className="text-sm text-[var(--text-muted)]">
          Ask the school office to send you a portal invite.
        </p>
      </div>
    );
  }

  if (!child) {
    return (
      <div className="space-y-2 px-4 py-8 text-center">
        <p className="font-medium">Hello, {guardian.firstName}.</p>
        <p className="text-sm text-[var(--text-muted)]">
          The school has not linked any children to your account yet.
        </p>
      </div>
    );
  }

  const now = new Date();
  const attendanceRate =
    child.attendance.sessions > 0
      ? Math.round((child.attendance.present / child.attendance.sessions) * 100)
      : null;

  const fees = child.fees;
  const outstanding = Number(fees?.outstanding ?? 0);
  const overdue = Number(fees?.overdue ?? 0);
  const billed = Number(fees?.billed ?? 0);
  const paid = Number(fees?.paid ?? 0);
  const paidPct = billed > 0 ? Math.max(0, Math.min(100, Math.round((paid / billed) * 100))) : 0;

  // The next lesson still to come. "UP NEXT" is only true of one row, and only
  // while the school day is running.
  const upNext = child.today.find((lesson) => lesson.startMinute > nowMinute(now));

  const previewNotices = (notices.data?.notices ?? []).slice(0, 3);
  const unread = notices.data?.unread ?? unreadNotices;

  return (
    <div className="pp-page">
      <div className="greet">
        <div className="hi">{greeting(now)}</div>
        {/* No salutation column on a guardian, so the parent's own name stands
            where the prototype's "Mrs" does — guessing a title from a name is
            guessing a person's gender. */}
        <h2>
          Hi, {guardian.firstName} {guardian.lastName}
        </h2>
        <div className="school">
          {[
            schoolName,
            term?.name,
            term?.weekNumber ? `Week ${term.weekNumber} of ${term.weekCount}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>

      {fees ? (
        <div className="b-stat-hero">
          <div className="b-sh-lead">
            <div className="b-sh-l">
              {outstanding > 0 ? "You still owe" : "Fees for the term"} · {child.firstName}
            </div>
            <div className="b-sh-v">{formatSchoolMoney(outstanding, fees.currency)}</div>
            <div className="b-sh-d">
              {outstanding === 0
                ? `${term?.name ?? "This term"} fees fully paid — thank you.`
                : overdue > 0
                  ? `${formatSchoolMoney(overdue, fees.currency)} of this is past its due date.`
                  : fees.nextDueDate
                    ? `${term?.name ?? "This term"} fees · pay by ${formatSchoolDate(fees.nextDueDate)}`
                    : `Across ${fees.invoices} ${fees.invoices === 1 ? "bill" : "bills"}.`}
            </div>
            {billed > 0 ? (
              <div className="fh-progress">
                <div className="bar">
                  <span style={{ width: `${paidPct}%` }} />
                </div>
                <div className="meta">
                  <span>Paid · {formatSchoolMoney(paid, fees.currency)}</span>
                  <span>Total · {formatSchoolMoney(billed, fees.currency)}</span>
                </div>
              </div>
            ) : null}
            <div className="fh-actions">
              <Link href="/portal/parent/fees" className="btn solid">
                See fee statement
                <ArrowRight className="size-[13px]" aria-hidden />
              </Link>
              <Link href="/portal/parent/notices" className="btn">
                From the school
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <div className="section-h">
        Today
        <Link href="/portal/parent/attendance">See full day</Link>
      </div>
      <div className="card-block boxed">
        {child.today.length === 0 ? (
          <p className="pp-empty-row">
            {child.currentClass
              ? `No lessons are timetabled for ${child.firstName} today.`
              : `${child.firstName} has not been put in a class yet.`}
          </p>
        ) : (
          child.today.slice(0, 5).map((lesson) => (
            <div key={lesson.periodId} className="tt-row">
              <div className="time">{lesson.startsAt}</div>
              <div>
                <div className="nm">{lesson.subjectName}</div>
                <div className="sb">
                  {[lesson.teacherName, lesson.roomName].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              {upNext?.periodId === lesson.periodId ? (
                <span className="now">UP NEXT</span>
              ) : (
                <span className="chev">
                  <ChevronRight className="size-[14px]" aria-hidden />
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="section-h">Quick look</div>
      <div className="stat-grid">
        <Link href="/portal/parent/attendance" className="stat-tile brand">
          <span className="l">How often at school</span>
          <span className="v">{attendanceRate === null ? "—" : `${attendanceRate}%`}</span>
          <span className="sb">
            {child.attendance.sessions === 0
              ? "No register taken yet"
              : `Present ${child.attendance.present} of ${child.attendance.sessions} days`}
          </span>
        </Link>
        {child.canSeeResults ? (
          <Link href="/portal/parent/marks" className="stat-tile">
            <span className="l">Marks</span>
            <span className="v">{child.hasPublishedMarks ? "Ready" : "Not yet"}</span>
            <span className="sb">
              {child.hasPublishedMarks
                ? `${term?.name ?? "This term"}'s marks are out`
                : "Released once they are checked"}
            </span>
          </Link>
        ) : (
          <Link href="/portal/parent/attendance" className="stat-tile">
            <span className="l">Days away</span>
            <span className="v">{child.attendance.absent}</span>
            <span className="sb">{child.attendance.late} late this term</span>
          </Link>
        )}
      </div>

      <div className="section-h">
        School news{unread > 0 ? ` · ${unread} new` : ""}
        <Link href="/portal/parent/notices">See all</Link>
      </div>
      {/* The preview is three cards' worth of news, so the wait is drawn as
          three cards. A parent opening this on mobile data at a school gate
          sees the shape of what is coming rather than a sentence apologising
          for it. */}
      {notices.isPending ? (
        <div className="px-4">
          <CardsSkeleton count={3} columns={1} lines={2} />
        </div>
      ) : notices.isError ? (
        <div className="px-4">
          <LoadError
            what="school news"
            error={notices.error}
            onRetry={() => void notices.refetch()}
          />
        </div>
      ) : previewNotices.length === 0 ? (
        <div className="px-4">
          <NothingYet
            icon={<Bell className="size-5" aria-hidden />}
            title="Nothing from the school yet"
            body="Anything the school sends you — fee reminders, term dates, a word about your child — appears here."
          />
        </div>
      ) : (
        <div className="card-block boxed">
          {previewNotices.map((notice) => {
            const tone = NOTICE_TONE[notice.severity] ?? "";
            const Icon =
              notice.severity === "CRITICAL"
                ? Info
                : notice.type.includes("FEE")
                  ? Receipt
                  : notice.type.includes("ATTENDANCE")
                    ? CalendarCheck
                    : Bell;
            return (
              <Link
                key={notice.id}
                href="/portal/parent/notices"
                className={notice.isRead ? "notice-row" : "notice-row unread"}
              >
                <span className={tone ? `ic ${tone}` : "ic"}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="nm block">{notice.title}</span>
                  {notice.summary ? <span className="sb block">{notice.summary}</span> : null}
                  <span className="meta block">{formatSchoolDate(notice.sentAt)}</span>
                </span>
                {notice.isRead ? (
                  <span className="chev">
                    <ChevronRight className="size-[14px]" aria-hidden />
                  </span>
                ) : (
                  <span className="pip" aria-hidden />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
