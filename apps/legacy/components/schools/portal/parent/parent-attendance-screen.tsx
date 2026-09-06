"use client";

import { useQuery } from "@tanstack/react-query";

import {
  CardsSkeleton,
  LoadError,
  NothingYet,
} from "@/components/schools/common/states";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { fetchJson } from "@corelithzw/platform/api-client";
import { formatSchoolDate } from "@/lib/schools/format";
import { CalendarCheck } from "@corelithzw/ui/lib/icons";

import { useParentPortal } from "./parent-portal-context";

/**
 * S-6.4 — attendance, and any single day.
 *
 * The summary is above the days rather than instead of them: "94%" is what a
 * parent glances at and "you marked her away on the 14th" is what they came to
 * ask about, so both are here and the days are the list.
 *
 * A day whose register is still DRAFT is labelled as not yet submitted. Telling a
 * parent their child was absent off a register a teacher has not finished is how
 * an argument starts over a tick somebody was about to correct.
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

export function ParentAttendanceScreen() {
  const { child, term } = useParentPortal();

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
      </div>

      <div className="section-h">
        Day by day
        {days.length > 0 ? (
          <span className="mono-note">
            {days.length} {days.length === 1 ? "day" : "days"}
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
      ) : (
        <div className="card-block boxed">
          {days.map((day) => (
            <div key={day.id} className="pl-row">
              <div className="min-w-0 flex-1">
                <div className="nm">{formatSchoolDate(day.date)}</div>
                <div className="sb">
                  {[day.className, day.remarks].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-[13px] font-medium ${TONE[day.status] ?? ""}`}>
                  {LABEL[day.status] ?? day.status.toLowerCase()}
                </div>
                {day.register !== "SUBMITTED" && day.register !== "LOCKED" ? (
                  <div className="text-[11.5px] text-[var(--text-subtle)]">
                    not yet submitted
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* A register a teacher has not sent in yet is still on the list above,
          labelled as such. This says why once, at the bottom, rather than on
          every row that carries the label. */}
      {days.some((day) => day.register !== "SUBMITTED" && day.register !== "LOCKED") ? (
        <div className="px-4 pt-3">
          <Alert>
            <AlertTitle>Some days are not final</AlertTitle>
            <AlertDescription>
              A day marked “not yet submitted” is a register the teacher is still
              working on. It can still change before the school signs it off.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
