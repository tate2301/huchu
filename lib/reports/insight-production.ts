import type { ReportRow, ReportValue } from "@/lib/reports/types";
import { addDays, formatShortDay } from "@/lib/workspace/format";

/**
 * Reports → Insights → Production (PageMineProduction): what the gold
 * production dashboard showed, as an insight. Gold recovered and tonnes
 * processed over the period against the one before, where the gold comes
 * from, and by site, by shift and by day. Pure: the rows are the Plant
 * reports, Downtime and Shift reports reports'.
 */

const num = (value: ReportValue | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const sum = (rows: readonly ReportRow[], key: string) => rows.reduce((total, row) => total + num(row[key]), 0);

export const grams = (value: number) => `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} g`;
const tonnes = (value: number) => `${Math.round(value).toLocaleString("en-US")} t`;
const hours = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const perTonne = (gold: number, fed: number) => (fed > 0 ? (gold / fed).toFixed(2) : "—");

/** The site whose rows a key groups. */
function by(rows: readonly ReportRow[], key: string): Map<string, ReportRow[]> {
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const value = row[key];
    const name = typeof value === "string" && value ? value : "No site";
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  return groups;
}

export type ProductionFacts = {
  plant: ReportRow[];
  before: ReportRow[] | null;
  downtime: ReportRow[];
  shifts: ReportRow[];
};

export function productionFinding({ plant, before, downtime }: ProductionFacts): { fact: string; rest: string | null } {
  const gold = sum(plant, "gold");
  if (plant.length === 0) return { fact: "No plant report in these dates.", rest: "Gold, tonnes and hours show here once the plant reports them." };
  const was = before ? sum(before, "gold") : 0;
  const change = was > 0 ? Math.round(((gold - was) / was) * 100) : null;
  const fact =
    change === null
      ? `The mills recovered ${grams(gold)} of gold.`
      : `The mills recovered ${grams(gold)} of gold, ${Math.abs(change)}% ${change >= 0 ? "more" : "less"} than the days before.`;
  const sites = [...by(plant, "site")].map(([site, rows]) => ({ site, gold: sum(rows, "gold") })).sort((a, b) => b.gold - a.gold);
  const lost = sum(downtime, "hours");
  const downBySite = [...by(downtime, "site")].map(([site, rows]) => ({ site, hours: sum(rows, "hours") })).sort((a, b) => b.hours - a.hours);
  const top = sites[0];
  const worst = downBySite[0];
  if (!top || sites.length < 2) return { fact, rest: lost > 0 ? `${hours(lost)} hours were lost.` : null };
  const rest =
    worst && worst.site === top.site && lost > 0
      ? `${top.site} did most of it and lost most hours: ${hours(worst.hours)} of ${hours(lost)}.`
      : `${top.site} did most of it${lost > 0 && worst ? `; ${worst.site} lost most hours, ${hours(worst.hours)} of ${hours(lost)}` : ""}.`;
  return { fact, rest };
}

export function productionFigures({ plant, before }: ProductionFacts) {
  const gold = sum(plant, "gold");
  const fed = sum(plant, "tonnes");
  const wasGold = before ? sum(before, "gold") : null;
  const wasFed = before ? sum(before, "tonnes") : null;
  const diesel = sum(plant, "diesel");
  const runs = plant.filter((row) => num(row.runHours) > 0);
  const typical = runs.length ? sum(runs, "runHours") / runs.length : 0;
  const fedChange = wasFed && wasFed > 0 ? Math.round(((fed - wasFed) / wasFed) * 100) : null;
  return [
    { label: "Gold recovered", value: grams(gold), note: wasGold === null ? "plant reports" : `was ${grams(wasGold)}` },
    { label: "Tonnes processed", value: tonnes(fed), note: fedChange === null ? null : `${Math.abs(fedChange)}% ${fedChange >= 0 ? "more" : "less"}` },
    { label: "Run hours a day", value: `${hours(typical)} h`, note: "typical, per mill" },
    { label: "Diesel used", value: `${Math.round(diesel).toLocaleString("en-US")} L`, note: fed > 0 ? `${(diesel / fed).toFixed(1)} L a tonne` : null },
  ];
}

/** Gold by day, or by two days over a long period: oldest first, with the days it covers. */
export function goldColumns(plant: readonly ReportRow[], from: string, to: string): { title: string; columns: Array<{ label: string; value: number }> } {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < 400; day = addDays(day, 1)) days.push(day);
  const step = days.length > 21 ? 2 : 1;
  const columns: Array<{ label: string; value: number }> = [];
  for (let index = 0; index < days.length; index += step) {
    const span = days.slice(index, index + step);
    columns.push({ label: formatShortDay(span[0]!), value: sum(plant.filter((row) => span.includes(String(row.date))), "gold") });
  }
  return { title: step === 2 ? "Gold recovered, every other day" : "Gold recovered, by day", columns };
}

export function siteBars(plant: readonly ReportRow[]) {
  const sites = [...by(plant, "site")].map(([site, rows]) => ({ site, gold: sum(rows, "gold") })).sort((a, b) => b.gold - a.gold);
  const top = Math.max(1, ...sites.map((entry) => entry.gold));
  return sites.map((entry, index) => ({ id: entry.site, label: entry.site, share: entry.gold / top, text: grams(entry.gold), tone: index === 0 ? ("key" as const) : null }));
}

type Cell = { text: string; tone?: "success" | "danger" | "warning" | "muted" | null; href?: string | null };
type Table = {
  id: string;
  label: string;
  columns: Array<{ id: string; label: string; num?: boolean }>;
  rows: Array<{ id: string; cells: Record<string, Cell | null> }>;
  total?: { label: string; cells: Record<string, Cell | null> } | null;
  empty: string;
};

const PLANT_COLUMNS = [
  { id: "tonnes", label: "Tonnes processed", num: true },
  { id: "runHours", label: "Run hours", num: true },
  { id: "downtime", label: "Hours down", num: true },
  { id: "gold", label: "Gold recovered", num: true },
  { id: "grade", label: "Grams a tonne", num: true },
];

function plantCells(rows: readonly ReportRow[]): Record<string, Cell> {
  return {
    tonnes: { text: Math.round(sum(rows, "tonnes")).toLocaleString("en-US") },
    runHours: { text: Math.round(sum(rows, "runHours")).toLocaleString("en-US") },
    downtime: { text: hours(sum(rows, "downtime")) },
    gold: { text: grams(sum(rows, "gold")) },
    grade: { text: perTonne(sum(rows, "gold"), sum(rows, "tonnes")) },
  };
}

export function siteTable(plant: readonly ReportRow[], siteHref: (site: string) => string): Table {
  return {
    id: "site",
    label: "By site",
    columns: [{ id: "site", label: "Site" }, ...PLANT_COLUMNS],
    rows: [...by(plant, "site")].map(([site, rows]) => ({ id: site, cells: { site: { text: site, href: siteHref(site) }, ...plantCells(rows) } })),
    total: { label: "Total", cells: plantCells(plant) },
    empty: "No plant report in these dates.",
  };
}

export function dayTable(plant: readonly ReportRow[]): Table {
  const days = [...by(plant, "date")].sort(([a], [b]) => b.localeCompare(a));
  return {
    id: "day",
    label: "By day",
    columns: [{ id: "day", label: "Day" }, ...PLANT_COLUMNS],
    rows: days.map(([day, rows]) => ({ id: day, cells: { day: { text: formatShortDay(day) }, ...plantCells(rows) } })),
    total: { label: "Total", cells: plantCells(plant) },
    empty: "No plant report in these dates.",
  };
}

/** By shift: the shift reports' tonnes, crews and hours down, day shift and night. */
export function shiftTable(shifts: readonly ReportRow[], downtime: readonly ReportRow[]): Table {
  const groups = [...by(shifts, "shift")];
  const words = (code: string) => code.charAt(0) + code.slice(1).toLowerCase();
  return {
    id: "shift",
    label: "By shift",
    columns: [
      { id: "shift", label: "Shift" },
      { id: "reports", label: "Reports", num: true },
      { id: "crew", label: "Crew", num: true },
      { id: "tonnes", label: "Tonnes moved", num: true },
      { id: "down", label: "Hours down", num: true },
    ],
    rows: groups.map(([shift, rows]) => ({
      id: shift,
      cells: {
        shift: { text: words(shift) },
        reports: { text: rows.length.toLocaleString("en-US") },
        crew: { text: Math.round(sum(rows, "crew")).toLocaleString("en-US") },
        tonnes: { text: Math.round(sum(rows, "tonnes")).toLocaleString("en-US") },
        down: { text: hours(sum(downtime.filter((row) => String(row.from ?? "").toUpperCase().startsWith(shift)), "hours")) },
      },
    })),
    total: null,
    empty: "No shift report in these dates.",
  };
}

/** The site that lost most hours, and its commonest cause. */
export function worstSite(downtime: readonly ReportRow[]): { site: string; hours: number; cause: string | null; causeHours: number; stops: number } | null {
  const sites = [...by(downtime, "site")].map(([site, rows]) => ({ site, rows, hours: sum(rows, "hours") })).sort((a, b) => b.hours - a.hours);
  const worst = sites[0];
  if (!worst || worst.hours <= 0) return null;
  const causes = [...by(worst.rows, "cause")].map(([cause, rows]) => ({ cause, hours: sum(rows, "hours"), stops: rows.length })).sort((a, b) => b.hours - a.hours);
  return { site: worst.site, hours: worst.hours, cause: causes[0]?.cause ?? null, causeHours: causes[0]?.hours ?? 0, stops: causes[0]?.stops ?? 0 };
}

export { hours as hoursWords };
