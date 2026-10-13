import { z } from "zod";

import { DEFAULT_TIME_ZONE } from "@/lib/workspace/format";

/**
 * A report sent on a schedule (Send it, `ReportSchedule`): when it goes, in
 * words and as the next instant, and which schedules are due. Pure, so the
 * drawer, the API and the sender agree on every date.
 *
 * Times are the workspace's clock. A monthly schedule on the 29th, 30th or
 * 31st goes on the month's last day when the month is shorter.
 */

export const SCHEDULE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];
export const SCHEDULE_FORMATS = ["PDF", "CSV"] as const;
export type ScheduleFormat = (typeof SCHEDULE_FORMATS)[number];
export const SCHEDULE_CONTENTS = ["SUMMARY", "FULL"] as const;
export type ScheduleContent = (typeof SCHEDULE_CONTENTS)[number];

export type ScheduleWhen = {
  frequency: ScheduleFrequency;
  /** Weekly: 1 (Monday) to 7 (Sunday). Monthly: 1 to 31. Daily: null. */
  day: number | null;
  /** "HH:MM". */
  time: string;
};

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const HHMM = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

export const scheduleInputSchema = z
  .object({
    frequency: z.enum(SCHEDULE_FREQUENCIES),
    day: z.number().int().min(1).max(31).nullable(),
    time: z.string().regex(HHMM, "A time is HH:MM"),
    recipientIds: z.array(z.string().min(1).max(64)).min(1, "Choose who it goes to").max(50),
    format: z.enum(SCHEDULE_FORMATS),
    content: z.enum(SCHEDULE_CONTENTS),
    /** The report address's query, without the `?`. */
    query: z.string().max(4000).default(""),
  })
  .refine((input) => (input.frequency === "DAILY" ? input.day === null : input.day !== null), {
    message: "A weekly or monthly schedule needs its day",
    path: ["day"],
  })
  .refine((input) => input.frequency !== "WEEKLY" || (input.day ?? 0) <= 7, {
    message: "A week has seven days",
    path: ["day"],
  });
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

/* ──────────────────────────────────────────────────────────────────────────
   The workspace's clock
   ────────────────────────────────────────────────────────────────────────── */

/** Minutes the zone is ahead of UTC at that instant (+120 in Harare). */
function offsetMinutes(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ?? "");
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
}

/** The wall-clock day `at` falls on in the zone, as UTC fields. */
function wallDay(at: Date, timeZone: string): { year: number; month: number; date: number } {
  const wall = new Date(at.getTime() + offsetMinutes(at, timeZone) * 60_000);
  return { year: wall.getUTCFullYear(), month: wall.getUTCMonth(), date: wall.getUTCDate() };
}

/** The instant a wall-clock time in the zone names (re-checked once, for a zone that moves its clocks). */
function zonedInstant(year: number, month: number, date: number, hours: number, minutes: number, timeZone: string): Date {
  const wall = Date.UTC(year, month, date, hours, minutes);
  const guess = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  return new Date(wall - offsetMinutes(new Date(guess), timeZone) * 60_000);
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Whether a wall-clock day is one the schedule sends on. */
function sendsOn(when: ScheduleWhen, year: number, month: number, date: number): boolean {
  if (when.frequency === "DAILY") return true;
  if (when.frequency === "WEEKLY") {
    const iso = ((new Date(Date.UTC(year, month, date)).getUTCDay() + 6) % 7) + 1;
    return iso === when.day;
  }
  return date === Math.min(when.day ?? 1, daysIn(year, month));
}

/**
 * The first time the schedule sends strictly after `after`: the next run
 * once one has gone, or the first when it is set up.
 */
export function nextRunAt(when: ScheduleWhen, after: Date, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const time = HHMM.exec(when.time);
  if (!time) throw new Error(`"${when.time}" is not a 24-hour HH:MM time`);
  const start = wallDay(after, timeZone);
  // A month and a half covers every frequency, the shortest month included.
  for (let step = 0; step < 62; step += 1) {
    const day = new Date(Date.UTC(start.year, start.month, start.date + step));
    const [year, month, date] = [day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()];
    if (!sendsOn(when, year, month, date)) continue;
    const at = zonedInstant(year, month, date, Number(time[1]), Number(time[2]), timeZone);
    if (at > after) return at;
  }
  throw new Error("No send day found for this schedule");
}

/** The schedules the sender sends now: on, and their time has come. */
export function dueSchedules<T extends { active: boolean; nextRunAt: Date | null }>(schedules: readonly T[], now: Date): T[] {
  return schedules.filter((schedule) => schedule.active && schedule.nextRunAt !== null && schedule.nextRunAt <= now);
}

/* ──────────────────────────────────────────────────────────────────────────
   In words
   ────────────────────────────────────────────────────────────────────────── */

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10] ?? "th"}`;
}

/** "Every Monday at 07:00", "Every day at 18:00", "On the 1st of each month at 07:00". */
export function describeWhen(when: ScheduleWhen): string {
  if (when.frequency === "DAILY") return `Every day at ${when.time}`;
  if (when.frequency === "WEEKLY") return `Every ${WEEKDAYS[(when.day ?? 1) - 1]} at ${when.time}`;
  const day = when.day ?? 1;
  return `On the ${ordinal(day)} of each month${day > 28 ? " (or its last day)" : ""} at ${when.time}`;
}

export const FORMAT_LABEL: Record<`${ScheduleFormat}:${ScheduleContent}`, string> = {
  "PDF:SUMMARY": "PDF, Summary",
  "PDF:FULL": "PDF, Report",
  "CSV:SUMMARY": "CSV, every row",
  "CSV:FULL": "CSV, every row",
};

/** The PDF layout a schedule's content prints in (`lib/reports/export-layouts.ts`). */
export function layoutFor(content: ScheduleContent): "summary" | "layout" {
  return content === "SUMMARY" ? "summary" : "layout";
}

/**
 * What a schedule keeps of the report on screen: its choices and its view
 * (`v`), never its dates, so each send reads the report's own period ("the
 * year so far") rather than the days that were on screen.
 */
export function scheduleQuery(params: Record<string, string>, dateKeys: readonly string[], encodedView: string | null): string {
  const kept = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!dateKeys.includes(key) && value !== "") kept.set(key, value);
  }
  if (encodedView) kept.set("v", encodedView);
  return kept.toString();
}
