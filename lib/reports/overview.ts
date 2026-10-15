import type { ReportValue } from "@/lib/reports/types";
import { formatRelativeDay } from "@/lib/workspace/format";

/**
 * A vertical's Reports overview (PageRetailReports, PageSchoolReports,
 * PageMineReports, PagePayReports, PageShopReports): one finding, a tile per
 * insight, the reports opened most, and how each module is doing. Every
 * vertical draws the same page from its own figures; this is the shape and
 * the arithmetic they share. Pure.
 */

export type Tone = "success" | "warning" | "danger" | "muted";

export type OverviewKpi = {
  label: string;
  value: string;
  /** The coloured part of the note ("+4 pts"), then the rest ("on last term"). */
  change: { text: string; tone: Tone } | null;
  note: string | null;
  href: string;
  /** Oldest first; the last is now. Empty draws no bars. */
  bars: number[];
};

export type OpenedRow = {
  id: string;
  title: string;
  href: string;
  area: string | null;
  /** Null is Corelith's. */
  madeBy: string | null;
  seenBy: "Everyone" | "Managers" | "Just you";
  /** "Tendai, today"; null when nobody has opened it. */
  lastOpened: string | null;
  opens: number;
};

export type HealthRow = {
  module: string;
  icon: "money" | "book" | "people" | "stock" | "floor" | "gold" | "safety" | "wrench" | "fees";
  state: "Healthy" | "Watch";
  line: string;
};

export type ReportsOverview = {
  finding: { fact: string; rest: string | null } | null;
  kpis: OverviewKpi[];
  opened: OpenedRow[];
  /** Whether opens are counted in this workspace (the shop's templates are; nothing else is yet). */
  opensCounted: boolean;
  health: HealthRow[];
};

/* ── Arithmetic ──────────────────────────────────────────────────────────── */

export const num = (value: ReportValue | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
export const sum = (rows: ReadonlyArray<Record<string, ReportValue>>, key: string): number => rows.reduce((total, row) => total + num(row[key]), 0);

/** The rows whose `key` day falls from `from` to `to`, both `YYYY-MM-DD`. */
export function between<T extends Record<string, ReportValue>>(rows: readonly T[], key: string, from: string, to: string): T[] {
  return rows.filter((row) => {
    const day = typeof row[key] === "string" ? (row[key] as string).slice(0, 10) : null;
    return day !== null && day >= from && day <= to;
  });
}

/**
 * `count` equal spans of `days` days ending on `to`, oldest first: the bars
 * under a tile.
 */
export function spans(to: string, days: number, count: number, addDays: (day: string, n: number) => string): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const end = addDays(to, -index * days);
    out.push({ from: addDays(end, -(days - 1)), to: end });
  }
  return out;
}

/** A relative change in whole percent: "+6%", "−12%"; null with nothing before to compare. */
export function percentChange(now: number, before: number): { text: string; value: number } | null {
  if (before <= 0) return null;
  const value = Math.round(((now - before) / before) * 100);
  return { text: value > 0 ? `+${value}%` : value < 0 ? `−${Math.abs(value)}%` : "0%", value };
}

/** A signed difference with its own words: "+9.5 h", "−1 pt". */
export function signed(value: number, format: (abs: number) => string): string {
  if (value === 0) return format(0);
  return `${value > 0 ? "+" : "−"}${format(Math.abs(value))}`;
}

/** Up is good unless `upIsBad`; no change is muted. */
export function toneOf(value: number, upIsBad = false): Tone {
  if (value === 0) return "muted";
  return value > 0 !== upIsBad ? "success" : "warning";
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/* ── Opened most ─────────────────────────────────────────────────────────── */

export type OpenedSource = Omit<OpenedRow, "lastOpened"> & {
  lastOpenedAt: Date | null;
  lastOpenedBy: string | null;
};

/** "Tendai, today", "Mr Gora, 6 Oct": who opened it last, and when. */
export function lastOpenedWords(by: string | null, at: Date | null, now: Date): string | null {
  if (!at) return null;
  const when = formatRelativeDay(at, now);
  const day = when === "Today" || when === "Yesterday" ? when.toLowerCase() : when.replace(/ \d{4}$/, "");
  const first = by?.trim().split(/\s+/)[0] ?? null;
  return first ? `${first}, ${day}` : day.charAt(0).toUpperCase() + day.slice(1);
}

/**
 * The six reports opened most: by opens, then the latest opened; otherwise in
 * the order they came. Where nothing is counted they are the vertical's own
 * reports, in its order.
 */
export function openedMost(sources: readonly OpenedSource[], now: Date, limit = 6): OpenedRow[] {
  return [...sources]
    .sort((a, b) => b.opens - a.opens || (b.lastOpenedAt?.getTime() ?? 0) - (a.lastOpenedAt?.getTime() ?? 0))
    .slice(0, limit)
    .map(({ lastOpenedAt, lastOpenedBy, ...row }) => ({ ...row, lastOpened: lastOpenedWords(lastOpenedBy, lastOpenedAt, now) }));
}

/** A finding from its sentences: the first is the fact, the rest follow it in grey. Empty ones are left out. */
export function finding(parts: Array<string | null | undefined>): ReportsOverview["finding"] {
  const [fact, ...rest] = parts.filter((part): part is string => Boolean(part));
  if (!fact) return null;
  return { fact, rest: rest.length ? rest.join(" ") : null };
}
