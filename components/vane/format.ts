/** How Vane's pages write times, days and money: on the shop clock, in British English. */

const ZONE = "Africa/Harare";

const dayKey = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/** "06:04". */
export function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** "06:04" today, "Mon 07:02" this week, "28 Sep" before that. */
export function when(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (dayKey(at) === dayKey(now)) return clock(iso);
  if (now.getTime() - at.getTime() < 6 * 24 * 60 * 60 * 1000) {
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "short" }).format(at);
    return `${day} ${clock(iso)}`;
  }
  return shortDate(iso);
}

/** "28 Sep". */
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, day: "numeric", month: "short" }).format(new Date(iso));
}

/** "25 October", from a "2026-10-25" date. */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(`${date}T00:00:00Z`));
}

/** "Due 25 Oct", from a "2026-10-25" date. */
export function dueLabel(date: string): string {
  return `Due ${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`))}`;
}

/** "Today", "Yesterday", "Mon 12 Oct", from a "2026-10-12" shop day. */
export function dayLabel(day: string, now: Date = new Date()): string {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T00:00:00Z`));
}

/** "Books", "Books and CRM", "Books, CRM and Tender". */
export function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "1 thing", "5 things". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}
