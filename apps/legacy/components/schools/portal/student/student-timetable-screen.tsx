"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SegmentedControl } from "@corelithzw/react";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import { MedusaBookOpenIcon } from "@corelithzw/ui/lib/icons";
import { DAY_NAMES } from "@/lib/schools/timetable-format";
import { useStudentPortal } from "./student-portal-context";
import { subjectAccentClass } from "./student-subject-accent";

type WeekSlot = {
  dayOfWeek: number;
  period: { id: string; code: string; name: string; startMinute: number };
  subjectName: string;
  roomName: string | null;
  teacherName: string | null;
};

type Week = { slots: WeekSlot[] };

/** Mon–Fri, which is the school week the prototype's grid draws. */
const DAYS = [1, 2, 3, 4, 5, 6] as const;
const GRID_DAYS = [1, 2, 3, 4, 5] as const;

function minuteLabel(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** "Room A12" reads as "A12" in a 60px-wide grid cell. */
function shortRoom(room: string | null) {
  if (!room) return "";
  return room.replace(/^(Room|Lab|Hall)\s+/i, (match) =>
    match.trim().toLowerCase() === "room" ? "" : match,
  );
}

/**
 * A pupil's timetable: the week as a grid, then one day in full.
 *
 * The prototype draws both, and both earn their place on a phone. The grid is
 * the shape of the week — where the gaps are, which afternoon is heavy — read at
 * a glance and never read closely. Underneath it, the picked day is a list with
 * room, teacher and time spelled out, because that is the part a pupil actually
 * reads before walking to a lesson. Today is where it opens, and today's column
 * is tinted.
 *
 * The whole week comes back in one request — the route returns every day when it
 * is not given a `dayOfWeek` — so switching days costs nothing and the grid is
 * never half-drawn. Today's lessons still come from the shell, which has already
 * loaded them, so the day it opens on paints without a fetch at all.
 *
 * There is no `SaveError` or `SavingOverlay` here, and that is deliberate rather
 * than forgotten: the office builds the timetable, so nothing on this screen
 * writes and there is no save that could fail.
 */
export function StudentTimetableScreen() {
  const { student, term, periods } = useStudentPortal();
  const todayIso = (() => {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
  })();
  const [day, setDay] = useState<string>(String(Math.min(todayIso, 6)));

  const week = useQuery({
    queryKey: ["schools", "portal", "student", "week", student?.currentClassId, term?.id],
    queryFn: () => fetchJson<Week>("/api/v2/schools/portal/student/me/timetable"),
    enabled: Boolean(student?.currentClassId && term),
  });

  if (!student) {
    return (
      <NothingYet
        title="This account is not linked to a pupil"
        body="Ask the school office to link your sign-in to your student record."
      />
    );
  }

  if (!student.currentClassId) {
    return (
      <NothingYet
        title="You are not in a year group yet"
        body="A timetable is your class's timetable, so there is nothing to show until the office puts you in one."
      />
    );
  }

  const slots = week.data?.slots ?? [];

  // One row per period the week actually uses, earliest first. A school with
  // eight periods gets eight rows without anything here being told how many.
  const periodRows = [
    ...new Map(slots.map((slot) => [slot.period.id, slot.period])).values(),
  ].sort((left, right) => left.startMinute - right.startMinute);

  const byCell = new Map<string, WeekSlot>();
  for (const slot of slots) byCell.set(`${slot.dayOfWeek}-${slot.period.id}`, slot);

  // Today comes from the shell, already loaded; other days come from the week.
  const isToday = Number(day) === todayIso;
  const rows = isToday
    ? periods.map((period) => ({
        key: period.periodId,
        name: period.name,
        time: `${period.startsAt} – ${period.endsAt}`,
        subject: period.lesson?.subjectName ?? null,
        room: period.lesson?.roomName ?? null,
        teacher: period.lesson?.teacherName ?? null,
      }))
    : slots
        .filter((slot) => slot.dayOfWeek === Number(day))
        .sort((a, b) => a.period.startMinute - b.period.startMinute)
        .map((slot) => ({
          key: `${slot.period.id}-${slot.dayOfWeek}`,
          name: slot.period.name,
          time: minuteLabel(slot.period.startMinute),
          subject: slot.subjectName,
          room: slot.roomName,
          teacher: slot.teacherName,
        }));

  return (
    <div className="flex flex-col">
      {week.error ? (
        <LoadError
          what="your week"
          error={week.error}
          onRetry={() => void week.refetch()}
        />
      ) : null}

      <div className="sp-tt-nav">
        {term?.name ?? "Your timetable"}
        <span className="sp-tt-nav-sb">
          {student.currentClass?.name ?? ""}
          {student.currentStream ? ` ${student.currentStream.name}` : ""}
        </span>
      </div>

      {week.isPending ? (
        /* The grid is a real table — five day columns against a time column —
           so the wait carries its headers and its column widths, and the real
           grid drops into the same shape rather than pushing the page down. */
        <TableRowsSkeleton
          headers={["", "Mon", "Tue", "Wed", "Thu", "Fri"]}
          columns={[
            { width: 36 },
            { badge: true },
            { badge: true },
            { badge: true },
            { badge: true },
            { badge: true },
          ]}
          rows={6}
        />
      ) : periodRows.length === 0 ? (
        <NothingYet
          title="No lessons on your class timetable"
          body="Nothing has been timetabled for your class this term. The office builds the timetable, so nobody can fix this from the app."
        />
      ) : (
        <div className="sp-tt">
          <div
            className="sp-tt-tbl"
            style={{ gridTemplateColumns: `36px repeat(${GRID_DAYS.length}, 1fr)` }}
          >
            <div className="sp-tt-hd" />
            {GRID_DAYS.map((value) => (
              <div
                key={`hd-${value}`}
                className={`sp-tt-hd${value === todayIso ? " today" : ""}`}
              >
                {(DAY_NAMES[value] ?? "").slice(0, 3)}
              </div>
            ))}
            {periodRows.map((period) => (
              <div key={period.id} className="contents">
                <div className="sp-tt-tm">{minuteLabel(period.startMinute)}</div>
                {GRID_DAYS.map((value) => {
                  const slot = byCell.get(`${value}-${period.id}`);
                  return (
                    <div
                      key={`${value}-${period.id}`}
                      className={`sp-tt-cell${value === todayIso ? " today" : ""}`}
                    >
                      {slot ? (
                        <div
                          className={`sp-pd ${subjectAccentClass(slot.subjectName)}`}
                          title={`${slot.subjectName}${slot.roomName ? ` · ${slot.roomName}` : ""}`}
                        >
                          <span className="sp-pd-nm">{slot.subjectName}</span>
                          <span className="sp-pd-rm">{shortRoom(slot.roomName)}</span>
                        </div>
                      ) : (
                        <div className="sp-pd free">
                          <span className="sp-pd-nm">Free</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sp-tt-days">
        <SegmentedControl
          aria-label="Day of the week"
          size="sm"
          value={day}
          onValueChange={setDay}
          options={DAYS.map((value) => ({
            value: String(value),
            label: (DAY_NAMES[value] ?? "").slice(0, 3),
          }))}
        />
      </div>

      <div className="sp-psh">
        {isToday
          ? `Today (${DAY_NAMES[Number(day)] ?? ""})`
          : (DAY_NAMES[Number(day)] ?? "That day")}
      </div>

      {!isToday && week.isPending ? (
        <CardsSkeleton count={5} columns={1} lines={1} />
      ) : rows.length === 0 ? (
        /* The day picker above is the filter, so this names the day it emptied
           and offers to go back to today rather than saying "no lessons" flat —
           a Saturday with nothing on it is not a broken timetable. */
        <NothingMatched
          what="lessons"
          filters={[DAY_NAMES[Number(day)] ?? "that day"]}
          onClear={() => setDay(String(Math.min(todayIso, 6)))}
        />
      ) : (
        <div className="sp-list">
          {rows.map((row) => (
            <div key={row.key} className="sp-list-row">
              <span className={`sp-ic-tile ${subjectAccentClass(row.subject)}`}>
                <MedusaBookOpenIcon className="size-4" aria-hidden />
              </span>
              <span className="block min-w-0">
                <span className="sp-lr-nm block truncate">
                  {row.subject ?? "Free"}
                </span>
                <span className="sp-lr-sb block truncate">
                  {row.subject
                    ? [row.time, row.teacher, row.room].filter(Boolean).join(" · ")
                    : `${row.time} · no lesson`}
                </span>
              </span>
              {/* No chevron: unlike Profile's rows, a lesson row here does not
                  go anywhere, and a chevron that opens nothing is a lie. */}
              <span />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
