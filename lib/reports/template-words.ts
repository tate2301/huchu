import type { TemplateAudience } from "@/lib/reports/template-access";
import { DEFAULT_TIME_ZONE, addDays, dayKey, formatDay, formatTime } from "@/lib/workspace/format";

/**
 * Reports templates in words (70-insights-reports 3.6, 5.10, 5.12): when one
 * was last opened, who sees it, and the period a run reads. Pure, so the
 * catalogue, the run page and the tests read the same.
 */

/** "Today, 08:12", "Yesterday, 17:40", else "28 September 2026". */
export function lastOpenedLabel(at: Date, now: Date = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  const day = dayKey(at, timeZone);
  const today = dayKey(now, timeZone);
  if (day === today) return `Today, ${formatTime(at, timeZone)}`;
  if (day === addDays(today, -1)) return `Yesterday, ${formatTime(at, timeZone)}`;
  return formatDay(at, timeZone);
}

/** The catalogue's Seen by: "Everyone", "Managers", "Just you". */
export const SEEN_BY_WORDS: Record<TemplateAudience, string> = {
  EVERYONE: "Everyone",
  MANAGERS: "Managers",
  JUST_ME: "Just you",
};

/** A saved template's run sub: "managers see it". */
export const AUDIENCE_SEES_WORDS: Record<TemplateAudience, string> = {
  EVERYONE: "everyone sees it",
  MANAGERS: "managers see it",
  JUST_ME: "only you see it",
};

/**
 * A period's calendar days with the year once, at the end: "3 October 2026",
 * "1 to 3 October 2026", "28 September to 3 October 2026", "28 December 2025
 * to 3 January 2026"; no range at all is "any time".
 */
export function reportPeriodWords(range: { from: string | null; to: string | null } | null): string {
  if (!range || (!range.from && !range.to)) return "any time";
  const { from, to } = range;
  if (!from) return `up to ${formatDay(to!)}`;
  if (!to) return `from ${formatDay(from)}`;
  if (from === to) return formatDay(to);
  const [fromDay, fromMonth] = formatDay(from).split(" ");
  if (from.slice(0, 7) === to.slice(0, 7)) return `${fromDay} to ${formatDay(to)}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `${fromDay} ${fromMonth} to ${formatDay(to)}`;
  return `${formatDay(from)} to ${formatDay(to)}`;
}
