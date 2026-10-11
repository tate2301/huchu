import { startOfDayIn } from "@/lib/reports/list-query";
import { addDays, DEFAULT_TIME_ZONE, dayKey, formatTime } from "@/lib/workspace/format";

/**
 * A promotion's state is the clock's (PRD-09, 20-products 3.2): nothing runs
 * a job to move it. Ended once `endedAt` is set or `endsAt` has passed;
 * Paused while `pausedAt` is set; Scheduled before `startsAt`; Running
 * otherwise. Pure, on Harare's clock.
 */

export type PromotionState = "SCHEDULED" | "RUNNING" | "PAUSED" | "ENDED";
export type PromotionTone = "ok" | "warn" | "info" | "neutral";
export type PromotionBadge = { label: string; tone: PromotionTone };

export type PromotionClock = {
  startsAt: Date;
  endsAt: Date | null;
  pausedAt: Date | null;
  endedAt: Date | null;
};

const ZONE = DEFAULT_TIME_ZONE;

export function promotionState(row: PromotionClock, now: Date = new Date()): PromotionState {
  if (row.endedAt || (row.endsAt && row.endsAt.getTime() <= now.getTime())) return "ENDED";
  if (row.pausedAt) return "PAUSED";
  if (row.startsAt.getTime() > now.getTime()) return "SCHEDULED";
  return "RUNNING";
}

/** The instant a Harare day starts. */
export const harareDayStart = (day: string) => startOfDayIn(day, ZONE);

/** "Running" ok; "Ends today" / "Ends tomorrow" warn while running; "Scheduled" info; "Paused" warn; "Ended" neutral. */
export function promotionBadge(row: PromotionClock, now: Date = new Date()): PromotionBadge {
  const state = promotionState(row, now);
  switch (state) {
    case "ENDED":
      return { label: "Ended", tone: "neutral" };
    case "PAUSED":
      return { label: "Paused", tone: "warn" };
    case "SCHEDULED":
      return { label: "Scheduled", tone: "info" };
    case "RUNNING": {
      if (row.endsAt) {
        const today = dayKey(now, ZONE);
        if (row.endsAt.getTime() <= harareDayStart(addDays(today, 1)).getTime()) return { label: "Ends today", tone: "warn" };
        if (row.endsAt.getTime() <= harareDayStart(addDays(today, 2)).getTime()) return { label: "Ends tomorrow", tone: "warn" };
      }
      return { label: "Running", tone: "ok" };
    }
  }
}

/** The words of a state in a sentence: "running", "scheduled", "paused", "ended". */
export const STATE_WORD: Record<PromotionState, string> = {
  SCHEDULED: "scheduled",
  RUNNING: "running",
  PAUSED: "paused",
  ENDED: "ended",
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTHS_LONG = MONTHS.map((month) => month[0]!.toUpperCase() + month.slice(1));
const pad = (n: number) => String(n).padStart(2, "0");

export const STARTS_MESSAGE = "Write it as 25 October, 00:00.";
export const ENDS_MESSAGE = "Write it as 31 October, 23:59, or No end date.";
export const NO_END = "No end date";

/**
 * A moment on the shop's clock as the sheet sends it, to the instant: the
 * picker's "2026-10-25T00:00", or the words "25 October, 00:00" (the year the
 * next time that day comes round, today included). Null when it is neither.
 */
export function parsePromotionMoment(text: string, now: Date = new Date()): Date | null {
  const trimmed = text.trim();
  let day: string;
  let time: string;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(trimmed);
  if (iso) {
    day = `${iso[1]}-${iso[2]}-${iso[3]}`;
    time = iso[4] ? `${iso[4]}:${iso[5]}` : "00:00";
  } else {
    const words = /^(\d{1,2})\s+([A-Za-z]+)\.?(?:\s+(\d{4}))?,?\s*(?:(\d{1,2}):(\d{2}))?$/.exec(trimmed);
    if (!words) return null;
    const name = words[2]!.toLowerCase();
    const month = MONTHS.findIndex((long) => long === name || long.slice(0, 3) === name);
    if (month < 0) return null;
    const today = dayKey(now, ZONE);
    let year = words[3] ? Number(words[3]) : Number(today.slice(0, 4));
    day = `${year}-${pad(month + 1)}-${pad(Number(words[1]))}`;
    if (!words[3] && day < today) {
      year += 1;
      day = `${year}-${pad(month + 1)}-${pad(Number(words[1]))}`;
    }
    time = words[4] ? `${pad(Number(words[4]))}:${words[5]}` : "00:00";
  }
  const [year, month, date] = day.split("-").map(Number);
  const check = new Date(Date.UTC(year!, month! - 1, date!));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month! - 1 || check.getUTCDate() !== date) return null;
  const [hour, minute] = time.split(":").map(Number);
  if (hour! > 23 || minute! > 59) return null;
  return new Date(harareDayStart(day).getTime() + (hour! * 60 + minute!) * 60_000);
}

/** An instant as the picker holds it: "2026-10-25T00:00" on Harare's clock. */
export const pickerValue = (at: Date) => `${dayKey(at, ZONE)}T${formatTime(at, ZONE)}`;

/** "25 October, 00:00": a moment as the toast and the rail say it; with the year when asked. */
export function momentWords(at: Date, withYear = false): string {
  const day = dayKey(at, ZONE);
  const words = `${Number(day.slice(8))} ${MONTHS_LONG[Number(day.slice(5, 7)) - 1]}`;
  return `${withYear ? `${words} ${day.slice(0, 4)}` : words}, ${formatTime(at, ZONE)}`;
}

/** "25 October": the day a promotion starts, for its toast. */
export function dayWords(at: Date): string {
  const day = dayKey(at, ZONE);
  return `${Number(day.slice(8))} ${MONTHS_LONG[Number(day.slice(5, 7)) - 1]}`;
}

/** Tomorrow at 00:00 on the shop's clock: a new promotion's default start, a duplicate's start. */
export const tomorrowStart = (now: Date = new Date()) => harareDayStart(addDays(dayKey(now, ZONE), 1));
