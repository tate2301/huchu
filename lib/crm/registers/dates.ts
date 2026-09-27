/**
 * A date filter's answer as instants.
 *
 * Filters are kept in days ("2026-09-01..2026-09-30") and words ("this-month")
 * so that a saved view means the same thing whenever it is opened. A day only
 * becomes an instant once somebody asks for records, and then in the asker's
 * own time zone: "today" in Harare starts two hours before "today" in UTC,
 * and a deal closing at 01:00 local time belongs to the local day.
 *
 * Nothing here reads the clock. `now` is passed in, so the list endpoint and
 * an export job that runs a minute later agree on what "today" was.
 */
import type { DatePreset, FilterValue } from "./types";

export const DEFAULT_TIME_ZONE = "Africa/Harare";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The zone if the runtime knows it, else the platform's default. */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function zoneParts(instant: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** How far the zone's wall clock is ahead of UTC at an instant, in ms. */
function zoneOffset(instant: Date, tz: string): number {
  const p = zoneParts(instant, tz);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant a calendar day starts in a zone. */
export function startOfDay(day: string, tz: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const midnightUtc = Date.UTC(year, month - 1, date);
  const first = midnightUtc - zoneOffset(new Date(midnightUtc), tz);
  // Once more at the answer: a zone whose offset changes that night (a
  // daylight-saving boundary) has a different offset at local midnight than
  // at UTC midnight.
  const second = midnightUtc - zoneOffset(new Date(first), tz);
  return new Date(second);
}

/** The calendar day an instant falls on in a zone, as `YYYY-MM-DD`. */
export function dayIn(instant: Date, tz: string): string {
  const p = zoneParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** An instant as the wall-clock minute it was in a zone, as `YYYY-MM-DD HH:mm`. */
export function minuteIn(instant: Date, tz: string): string {
  const p = zoneParts(instant, tz);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** A calendar day moved by whole days. */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date) + days * DAY_MS);
  return moved.toISOString().slice(0, 10);
}

/** Monday of the week a day is in — the working week the platform's users keep. */
function startOfWeek(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function startOfNextMonth(day: string): string {
  const [year, month] = day.split("-").map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/** A preset as a half-open day range: `from` inclusive, `until` exclusive. */
export function presetDays(preset: DatePreset, today: string): { from?: string; until?: string } {
  switch (preset) {
    case "today":
      return { from: today, until: addDays(today, 1) };
    case "this-week": {
      const monday = startOfWeek(today);
      return { from: monday, until: addDays(monday, 7) };
    }
    case "this-month":
      return { from: startOfMonth(today), until: startOfNextMonth(today) };
    case "last-7d":
      return { from: addDays(today, -6), until: addDays(today, 1) };
    case "last-30d":
      return { from: addDays(today, -29), until: addDays(today, 1) };
    case "next-7d":
      return { from: today, until: addDays(today, 7) };
    case "next-30d":
      return { from: today, until: addDays(today, 30) };
    case "overdue":
      return { until: today };
  }
}

export type InstantRange = { gte?: Date; lt?: Date };

/**
 * A date filter as a Prisma-shaped range, or undefined when it narrows
 * nothing. A typed range's `to` day is included: "1 to 30 September" means
 * up to the end of the 30th.
 */
export function dateFilterRange(
  value: FilterValue | undefined,
  context: { now: Date; tz: string },
): InstantRange | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const tz = safeTimeZone(context.tz);

  let days: { from?: string; until?: string };
  if ("preset" in value) {
    days = presetDays(value.preset, dayIn(context.now, tz));
  } else if ("from" in value || "to" in value) {
    const range = value as { from?: string; to?: string };
    days = {
      ...(range.from ? { from: range.from } : {}),
      ...(range.to ? { until: addDays(range.to, 1) } : {}),
    };
  } else {
    return undefined;
  }

  const out: InstantRange = {
    ...(days.from ? { gte: startOfDay(days.from, tz) } : {}),
    ...(days.until ? { lt: startOfDay(days.until, tz) } : {}),
  };
  return out.gte || out.lt ? out : undefined;
}
