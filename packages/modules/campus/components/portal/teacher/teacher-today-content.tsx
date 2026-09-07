"use client";

import Link from "next/link";
import { Alert, Badge, Button, Card, EmptyState } from "@corelithzw/react";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { useTeacherPortal, type TeacherPeriod } from "./teacher-portal-context";

/** Minutes since midnight, in the browser's own clock. */
function nowMinute() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function greeting(minute: number) {
  if (minute < 12 * 60) return "Good morning";
  if (minute < 17 * 60) return "Good afternoon";
  return "Good evening";
}

/** The lesson a teacher is standing in, or the next one they walk into. */
function currentPeriod(periods: TeacherPeriod[], minute: number) {
  const inProgress = periods.find(
    (period) => minute >= period.startMinute && minute < period.endMinute,
  );
  if (inProgress) return { period: inProgress, live: true as const };
  const next = periods.find((period) => period.startMinute > minute);
  return next ? { period: next, live: false as const } : null;
}

/**
 * The teacher's day, opened on the period they are in.
 *
 * The whole screen is built outward from the timetable: every period of the
 * day is a cell, free ones included, and the register a teacher has not taken
 * is a lit cell rather than a missing one. A screen that only listed what had
 * been done would be silent about exactly the thing a teacher is behind on.
 */
export function TeacherTodayContent() {
  const { day, error, setClassSubjectId } = useTeacherPortal();

  const minute = nowMinute();
  const periods = day?.periods ?? [];
  const classes = day?.classes ?? [];
  const marking = day?.workload?.marking ?? [];
  const current = currentPeriod(periods, minute);
  const surname = (day?.teacher?.user.name ?? "").split(" ").filter(Boolean).slice(-1)[0];
  const taught = periods.filter((period) => period.lesson).length;
  const free = periods.length - taught;
  const unmarked = periods.filter((period) => period.lesson && !period.register).length;

  if (error) {
    return (
      <Alert tone="danger" title="Your day would not load">
        {getApiErrorMessage(error)}
      </Alert>
    );
  }

  if (!day?.teacher) {
    return (
      <EmptyState
        title="You are not linked to a teacher profile"
        body="Ask the school office to link your account to your staff record. Until then the portal has no classes to show you."
      />
    );
  }

  if (!day?.term) {
    return (
      <EmptyState
        title="No term is running"
        body="The school has no active term, so there is no timetable to build a day from."
      />
    );
  }

  const upNext = current?.period.lesson ? current : null;
  const upNextSize = upNext
    ? (classes.find((row) => row.classSubjectId === upNext.period.lesson?.classSubjectId)
        ?.size ?? 0)
    : 0;
  const minutesAway = upNext ? Math.max(0, upNext.period.startMinute - minute) : 0;

  return (
    <>
      <div className="te-greet">
        <div className="left">
          <h2>
            {greeting(minute)}
            {surname ? `, ${surname}` : ""}
          </h2>
          <div className="sb">
            {classes.length} class{classes.length === 1 ? "" : "es"}
            {day?.term ? ` · ${day.term.name}` : ""} · {taught} lesson
            {taught === 1 ? "" : "s"} today
            {free > 0 ? ` · ${free} free` : ""}
          </div>
        </div>
        <Button variant="secondary" asChild>
          <Link href="/portal/teacher/homework">Set new homework</Link>
        </Button>
      </div>

      <Card
        title={
          <span className="te-sched-h">
            <span>Today&apos;s lessons</span>
            <span className="ds">
              {periods.length} period{periods.length === 1 ? "" : "s"}
              {free > 0 ? ` · ${free} free` : ""}
            </span>
          </span>
        }
        actions={
          current ? (
            <span className={current.live ? "te-now" : "te-now next"}>
              {current.live
                ? `Right now · ${current.period.name}`
                : `Next · ${current.period.name} at ${current.period.startsAt}`}
            </span>
          ) : null
        }
      >
        {periods.length === 0 ? (
          <EmptyState
            title="No periods are set up"
            body="The school day has no periods on it yet, so there is nothing to lay a timetable against."
          />
        ) : (
          <div className="te-sched-rail">
            {periods.map((period) => {
              const live = current?.live && current.period.periodId === period.periodId;
              const className = [
                "te-cell",
                live ? "current" : "",
                period.lesson ? "" : "free",
              ]
                .filter(Boolean)
                .join(" ");
              const body = (
                <>
                  <span className="pd">
                    {period.code} · {period.startsAt}
                  </span>
                  <span className="cls">
                    {period.lesson
                      ? `${period.lesson.className}${period.lesson.streamName ? ` ${period.lesson.streamName}` : ""}`
                      : "Free"}
                  </span>
                  <span className="rm">
                    {period.lesson
                      ? `${period.lesson.subjectName}${period.lesson.roomName ? ` · ${period.lesson.roomName}` : ""}`
                      : "Staff room"}
                  </span>
                  {period.lesson ? (
                    <span className="tag">
                      {period.register ? (
                        <Badge tone="success" dot>
                          Register taken
                        </Badge>
                      ) : (
                        <Badge tone="warn" dot>
                          Not marked
                        </Badge>
                      )}
                    </span>
                  ) : null}
                </>
              );

              // A period with a lesson in it opens that lesson's register:
              // the cell is the thing a teacher taps between rooms.
              return period.lesson ? (
                <Link
                  key={period.periodId}
                  href="/portal/teacher/attendance"
                  className={className}
                  onClick={() => {
                    const lesson = period.lesson;
                    if (lesson) setClassSubjectId(lesson.classSubjectId);
                  }}
                >
                  {body}
                </Link>
              ) : (
                <div key={period.periodId} className={className}>
                  {body}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {upNext?.period.lesson ? (
        <div className="te-att-card">
          <div className="left">
            <div className="lbl">
              {upNext.live
                ? `Right now · ${upNext.period.name}`
                : `Up next · ${upNext.period.name}${minutesAway > 0 ? ` in ${minutesAway} minute${minutesAway === 1 ? "" : "s"}` : ""}`}
            </div>
            <h3>
              Mark attendance — {upNext.period.lesson.className}
              {upNext.period.lesson.streamName ? ` ${upNext.period.lesson.streamName}` : ""} ·{" "}
              {upNext.period.lesson.subjectName}
            </h3>
            <div className="ds">
              {upNext.period.register
                ? `Already taken — ${upNext.period.register.marked} pupils recorded. Opening it again edits what is there.`
                : `${upNextSize} pupil${upNextSize === 1 ? "" : "s"} on the class list · nobody has been marked yet`}
            </div>
          </div>
          <Link
            href="/portal/teacher/attendance"
            className="go"
            onClick={() => {
              const lesson = upNext.period.lesson;
              if (lesson) setClassSubjectId(lesson.classSubjectId);
            }}
          >
            Mark attendance →
          </Link>
        </div>
      ) : null}

      <div className="te-grid-cards">
        <Card
          title="Papers to mark"
          actions={
            marking.length > 0 ? (
              <Badge tone="warn">{marking.length} waiting</Badge>
            ) : null
          }
        >
          {marking.length === 0 ? (
            <EmptyState
              title="Nothing waiting"
              body="Every open assessment has a mark against every pupil on the roll."
            />
          ) : (
            <div className="te-rows">
              {marking.slice(0, 4).map((row) => (
                <Link
                  key={row.assessmentId}
                  href={`/portal/teacher/marks?assessment=${row.assessmentId}`}
                  className="b-row-card"
                >
                  <div className="b-rc-top">
                    <div className="b-rc-info">
                      <div className="b-rc-nm">
                        {row.className} · {row.subjectName} · {row.title}
                      </div>
                      <div className="b-rc-sb">
                        {row.marked} of {row.expected} marked
                      </div>
                    </div>
                    <div>
                      <div className="b-rc-val">{row.outstanding}</div>
                      <div className="b-rc-delta dn">to go</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="This week"
          actions={day?.term ? <Badge tone="neutral">{day.term.name}</Badge> : null}
        >
          <div className="te-tiles">
            <div className="te-tile">
              <div className="lbl">Registers unmarked</div>
              <div className={unmarked > 0 ? "v warn" : "v"}>{unmarked}</div>
              <div className="ds">
                {taught} lesson{taught === 1 ? "" : "s"} on today
              </div>
            </div>
            <div className="te-tile">
              <div className="lbl">Papers to mark</div>
              <div className="v">{day?.workload?.papersToMark ?? 0}</div>
              <div className="ds">
                Across {marking.length} assessment{marking.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="te-tile">
              <div className="lbl">Homework open</div>
              <div className="v">{day?.workload?.homeworkOpen ?? 0}</div>
              <div className="ds">Set by you, still collecting</div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
