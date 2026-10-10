/**
 * A price list's "Days and hours" and "Between dates" (PRD-05, 20-products
 * 4.4), read from the words the owner types and written back the same way.
 * Pure: the sheet, the service and the list all use it.
 */

export const HOURS_HINT = "Write it as Fridays, 17:00 to 19:00.";
export const BETWEEN_HINT = "Write it as 1 December to 26 December.";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "fridays", "friday", "fri" → 5 (ISO, Monday 1). */
function dayOf(word: string): number | null {
  const clean = word.trim().toLowerCase().replace(/s$/, "");
  if (clean.length < 3) return null;
  const index = DAY_NAMES.findIndex((name) => name.toLowerCase().startsWith(clean) || clean === name.toLowerCase());
  return index < 0 ? null : index + 1;
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function time(word: string): string | null {
  const match = TIME.exec(word.trim());
  return match ? `${match[1]!.padStart(2, "0")}:${match[2]}` : null;
}

export type Hours = { daysOfWeek: number[]; fromTime: string; toTime: string };

/**
 * "Fridays, 17:00 to 19:00", "Friday 17:00 to 19:00", "Fridays and Saturdays,
 * 17:00 to 19:00", "Monday to Friday, 08:00 to 12:00", "Every day, 17:00 to
 * 19:00". Null for anything else, or a start not before the end.
 */
export function parseHours(input: string): Hours | null {
  const match = /^(.*?)[,\s]+(\d{1,2}:\d{2})\s*(?:to|-|–)\s*(\d{1,2}:\d{2})\s*\.?$/i.exec(input.trim());
  if (!match) return null;
  const fromTime = time(match[2]!);
  const toTime = time(match[3]!);
  if (!fromTime || !toTime || fromTime >= toTime) return null;

  const daysText = match[1]!.trim().replace(/,$/, "").trim().toLowerCase();
  let days: number[] = [];
  if (daysText === "every day" || daysText === "daily" || daysText === "everyday") {
    days = [1, 2, 3, 4, 5, 6, 7];
  } else if (/\s(to|-|–)\s/.test(daysText)) {
    const [first, last] = daysText.split(/\s(?:to|-|–)\s/).map(dayOf);
    if (!first || !last) return null;
    for (let day = first; ; day = (day % 7) + 1) {
      days.push(day);
      if (day === last) break;
    }
  } else {
    const words = daysText.split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean);
    if (words.length === 0) return null;
    for (const word of words) {
      const day = dayOf(word);
      if (!day) return null;
      days.push(day);
    }
  }
  return { daysOfWeek: [...new Set(days)].sort((a, b) => a - b), fromTime, toTime };
}

/** [5] "Fridays"; [5, 6] "Fridays and Saturdays"; [1..5] "Monday to Friday"; all seven "Every day". */
export function daysWords(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  const run = sorted.length >= 3 && sorted.every((day, index) => index === 0 || day === sorted[index - 1]! + 1);
  if (run) return `${DAY_NAMES[sorted[0]! - 1]} to ${DAY_NAMES[sorted[sorted.length - 1]! - 1]}`;
  const plural = sorted.map((day) => `${DAY_NAMES[day - 1]}s`);
  return plural.length <= 1 ? (plural[0] ?? "") : `${plural.slice(0, -1).join(", ")} and ${plural[plural.length - 1]}`;
}

/** "Fridays 17:00 to 19:00", as the list and the toast say it. */
export function hoursWords(hours: Hours): string {
  return `${daysWords(hours.daysOfWeek)} ${hours.fromTime} to ${hours.toTime}`;
}

/** "Fridays, 17:00 to 19:00", as the field holds it. */
export function hoursField(hours: Hours): string {
  return `${daysWords(hours.daysOfWeek)}, ${hours.fromTime} to ${hours.toTime}`;
}

export type Between = { startsOn: string; endsOn: string };

const pad = (value: number) => String(value).padStart(2, "0");

function dateOf(text: string): { day: number; month: number; year: number | null } | null {
  const match = /^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/i.exec(text.trim());
  if (!match) return null;
  const word = match[2]!.toLowerCase();
  const month = MONTHS.findIndex((name) => name.toLowerCase() === word || (word.length >= 3 && name.toLowerCase().startsWith(word)));
  if (month < 0) return null;
  const day = Number(match[1]);
  if (day < 1 || day > 31) return null;
  return { day, month: month + 1, year: match[3] ? Number(match[3]) : null };
}

function valid(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * "1 December to 26 December" (this year, or next when its end is already
 * past), "1 December 2026 to 26 December 2026", "20 December to 5 January"
 * (the end in the year after). `today` is `YYYY-MM-DD` in Harare.
 */
export function parseBetween(input: string, today: string): Between | null {
  const parts = input.trim().replace(/\.$/, "").split(/\s+(?:to|-|–)\s+/i);
  if (parts.length !== 2) return null;
  const start = dateOf(parts[0]!);
  const end = dateOf(parts[1]!);
  if (!start || !end) return null;
  const thisYear = Number(today.slice(0, 4));
  let startYear = start.year ?? end.year ?? thisYear;
  let endYear = end.year ?? startYear;
  const key = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
  if (end.year === null && key(endYear, end.month, end.day) < key(startYear, start.month, start.day)) endYear += 1;
  if (start.year === null && end.year === null && key(endYear, end.month, end.day) < today) {
    startYear += 1;
    endYear += 1;
  }
  if (!valid(startYear, start.month, start.day) || !valid(endYear, end.month, end.day)) return null;
  const startsOn = key(startYear, start.month, start.day);
  const endsOn = key(endYear, end.month, end.day);
  if (endsOn < startsOn) return null;
  return { startsOn, endsOn };
}

/** "1 December to 26 December"; a year only when it is not this one. */
export function betweenWords(between: Between, today: string): string {
  const thisYear = today.slice(0, 4);
  const words = (iso: string) => {
    const [year, month, day] = iso.split("-");
    return `${Number(day)} ${MONTHS[Number(month) - 1]}${year === thisYear ? "" : ` ${year}`}`;
  };
  return `${words(between.startsOn)} to ${words(between.endsOn)}`;
}
