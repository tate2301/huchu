/**
 * How long a record is allowed to sit in a stage, measured in working hours.
 *
 * "Contact a new lead within 30 minutes" only means anything against a working
 * day. A lead that arrives at 16:55 on Friday has not been neglected by 08:10
 * on Monday — it has been open for fifteen working minutes, five on Friday and
 * ten on Monday — while a clock counting wall time calls it two days old and
 * screaming. That kind of clock trains people to ignore it. Every target here
 * is elapsed *working* time.
 *
 * Deliberately pure and dependency-free so it can be unit-tested against
 * awkward cases: a target that starts outside hours, one that spans a weekend,
 * one longer than a working day.
 */
import type { CrmLeadStage } from "@corelithzw/db";

/** Minutes from midnight. 8am–5pm, Monday to Friday, is the shop default. */
export type WorkingHours = {
  /** 0 = Sunday. Days not listed are not worked. */
  days: number[];
  startMinute: number;
  endMinute: number;
};

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  days: [1, 2, 3, 4, 5],
  startMinute: 8 * 60,
  endMinute: 17 * 60,
};

/**
 * How long each stage gets before it is late, in working minutes.
 *
 * The two the business named out loud are the first two: a new lead is
 * contacted within thirty minutes, and a follow-up is owed within three days.
 * The rest step up from there — the further along a deal is, the more it has
 * already cost to get there and the more expensive silence becomes.
 *
 * `null` means no clock: a won or lost deal is not waiting on anybody.
 */
export const STAGE_TARGET_MINUTES: Record<CrmLeadStage, number | null> = {
  NEW: 30,
  CONTACTED: 3 * 9 * 60,
  QUALIFIED: 5 * 9 * 60,
  SITE_VISIT: 3 * 9 * 60,
  QUOTED: 3 * 9 * 60,
  INVOICED: 7 * 9 * 60,
  WON: null,
  LOST: null,
};

export const STAGE_TARGET_LABELS: Record<CrmLeadStage, string | null> = {
  NEW: "30 minutes to first contact",
  CONTACTED: "3 working days to qualify",
  QUALIFIED: "5 working days to book a visit",
  SITE_VISIT: "3 working days to quote",
  QUOTED: "3 working days to chase the quote",
  INVOICED: "7 working days to collect",
  WON: null,
  LOST: null,
};

const MS_PER_MINUTE = 60_000;

function isWorkingDay(date: Date, hours: WorkingHours): boolean {
  return hours.days.includes(date.getDay());
}

function atMinute(date: Date, minute: number): Date {
  const next = new Date(date);
  next.setHours(0, minute, 0, 0);
  return next;
}

function startOfNextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

/**
 * Working minutes between two instants. Time outside working hours, and whole
 * non-working days, count for nothing.
 */
export function workingMinutesBetween(
  from: Date,
  to: Date,
  hours: WorkingHours = DEFAULT_WORKING_HOURS,
): number {
  if (to <= from) return 0;

  let total = 0;
  let cursor = new Date(from);

  // Walk a day at a time. A record can legitimately sit in a stage for
  // months, so this is capped — past a year the exact number stops being
  // information and the answer is "far too long" either way.
  for (let guard = 0; guard < 400 && cursor < to; guard += 1) {
    if (isWorkingDay(cursor, hours)) {
      const dayStart = atMinute(cursor, hours.startMinute);
      const dayEnd = atMinute(cursor, hours.endMinute);
      const windowStart = cursor > dayStart ? cursor : dayStart;
      const windowEnd = to < dayEnd ? to : dayEnd;
      if (windowEnd > windowStart) {
        total += (windowEnd.getTime() - windowStart.getTime()) / MS_PER_MINUTE;
      }
    }
    cursor = startOfNextDay(cursor);
  }

  return Math.round(total);
}

/**
 * The instant `minutes` of working time after `from`.
 *
 * Used to say when something falls due rather than how late it already is —
 * "by 09:30 Monday" is actionable in a way "in 30 working minutes" is not.
 */
export function addWorkingMinutes(
  from: Date,
  minutes: number,
  hours: WorkingHours = DEFAULT_WORKING_HOURS,
): Date {
  let remaining = minutes;
  let cursor = new Date(from);

  for (let guard = 0; guard < 400; guard += 1) {
    if (isWorkingDay(cursor, hours)) {
      const dayStart = atMinute(cursor, hours.startMinute);
      const dayEnd = atMinute(cursor, hours.endMinute);
      const windowStart = cursor > dayStart ? cursor : dayStart;

      if (dayEnd > windowStart) {
        const available = (dayEnd.getTime() - windowStart.getTime()) / MS_PER_MINUTE;
        if (remaining <= available) {
          return new Date(windowStart.getTime() + remaining * MS_PER_MINUTE);
        }
        remaining -= available;
      }
    }
    cursor = startOfNextDay(cursor);
  }

  // Should be unreachable for any sane target; returning the cursor is more
  // useful than throwing inside a list render.
  return cursor;
}

export type SlaState = {
  /** No clock runs on this stage. */
  exempt: boolean;
  /** Working minutes the record has spent in this stage. */
  elapsedMinutes: number;
  targetMinutes: number | null;
  dueAt: Date | null;
  breached: boolean;
  /** Past 75% of the target with nothing done — worth showing before it is late. */
  atRisk: boolean;
  /** Signed: negative once breached. */
  remainingMinutes: number | null;
};

export function stageSla(
  stage: CrmLeadStage,
  stageEnteredAt: Date | string,
  now: Date = new Date(),
  hours: WorkingHours = DEFAULT_WORKING_HOURS,
): SlaState {
  const entered = typeof stageEnteredAt === "string" ? new Date(stageEnteredAt) : stageEnteredAt;
  const target = STAGE_TARGET_MINUTES[stage];

  if (target === null || Number.isNaN(entered.getTime())) {
    return {
      exempt: true,
      elapsedMinutes: 0,
      targetMinutes: null,
      dueAt: null,
      breached: false,
      atRisk: false,
      remainingMinutes: null,
    };
  }

  const elapsed = workingMinutesBetween(entered, now, hours);
  return {
    exempt: false,
    elapsedMinutes: elapsed,
    targetMinutes: target,
    dueAt: addWorkingMinutes(entered, target, hours),
    breached: elapsed > target,
    atRisk: elapsed > target * 0.75 && elapsed <= target,
    remainingMinutes: target - elapsed,
  };
}

/** "20m late", "in 2h", "in 3 days" — the shortest true thing to put on a card. */
export function formatSlaRemaining(state: SlaState): string | null {
  if (state.exempt || state.remainingMinutes === null) return null;

  const minutes = Math.abs(state.remainingMinutes);
  const said =
    minutes < 60
      ? `${Math.round(minutes)}m`
      : minutes < 9 * 60
        ? `${Math.round(minutes / 60)}h`
        : // Past a day, working days are the honest unit — "36h" reads as a
          // day and a half of wall time, which it is not.
          `${Math.round(minutes / (9 * 60))}d`;

  return state.breached ? `${said} late` : `${said} left`;
}
