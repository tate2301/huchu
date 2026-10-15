import type { ReportRow, ReportValue } from "@/lib/reports/types";
import { insightMoney } from "@/lib/reports/week-insights";

/**
 * Reports → Insights → Pay cost (PagePayCost): what the pay runs cost the
 * employer — the gross and the employer's own contributions on top — month by
 * month and where it goes, against the month before. Pure: the rows are the
 * Pay by employee, Statutory and Employees reports'.
 */

const num = (value: ReportValue | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const sum = (rows: readonly ReportRow[], key: string) => rows.reduce((total, row) => total + num(row[key]), 0);
const money = insightMoney;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-08" → "August". */
export function monthWords(period: string): string {
  return MONTHS[Number(period.slice(5, 7)) - 1] ?? period;
}

/** What a line costs the employer: its gross and the employer's contributions. */
export const costOf = (row: ReportRow) => num(row.gross) + num(row.employerCost);
const cost = (rows: readonly ReportRow[]) => rows.reduce((total, row) => total + costOf(row), 0);

/** The months the rows cover, oldest first. */
export function monthsOf(rows: readonly ReportRow[]): string[] {
  return [...new Set(rows.map((row) => String(row.period ?? "")).filter((period) => /^\d{4}-\d{2}/.test(period)))].sort();
}

export function inMonths(rows: readonly ReportRow[], months: readonly string[]): ReportRow[] {
  const keep = new Set(months);
  return rows.filter((row) => keep.has(String(row.period)));
}

function signedMoney(value: number): string {
  if (Math.abs(value) < 0.005) return money(0);
  return `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
}

export function payFinding(now: readonly ReportRow[], before: readonly ReportRow[] | null, label: string): { fact: string; rest: string | null } {
  if (now.length === 0) return { fact: `No pay run for ${label} yet.`, rest: "A run's cost shows here once it is worked out." };
  const total = cost(now);
  const was = before && before.length ? cost(before) : null;
  if (was === null) return { fact: `${label} costs ${money(total)}.`, rest: null };
  const difference = total - was;
  const fact = `${label} costs ${money(total)}, ${money(Math.abs(difference))} ${difference >= 0 ? "more" : "less"} than before.`;
  const moved = departments(now, before)
    .filter((row) => Math.abs(row.change ?? 0) >= 0.005)
    .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0));
  const top = moved[0];
  if (!top) return { fact, rest: "Nothing moved by department." };
  const others = moved.slice(1).every((row) => Math.abs(row.change ?? 0) <= 30);
  return {
    fact,
    rest: `${top.name} moved most, ${signedMoney(top.change ?? 0)}.${moved.length > 1 && others ? " Nothing else moved by more than $30.00." : ""}`,
  };
}

export type Grouped = { name: string; people: number; gross: number; cost: number; change: number | null };

function groupBy(now: readonly ReportRow[], before: readonly ReportRow[] | null, key: string, none: string): Grouped[] {
  const names = new Set([...now, ...(before ?? [])].map((row) => (typeof row[key] === "string" && row[key] ? String(row[key]) : none)));
  const of = (rows: readonly ReportRow[], name: string) => rows.filter((row) => (typeof row[key] === "string" && row[key] ? String(row[key]) : none) === name);
  return [...names]
    .map((name) => {
      const mine = of(now, name);
      return {
        name,
        people: new Set(mine.map((row) => row.employee)).size,
        gross: sum(mine, "gross"),
        cost: cost(mine),
        change: before && before.length ? cost(mine) - cost(of(before, name)) : null,
      };
    })
    .filter((row) => row.people > 0 || (row.change ?? 0) !== 0)
    .sort((a, b) => b.cost - a.cost);
}

export const departments = (now: readonly ReportRow[], before: readonly ReportRow[] | null) => groupBy(now, before, "department", "No department");
export const grades = (now: readonly ReportRow[], before: readonly ReportRow[] | null) => groupBy(now, before, "grade", "No grade");

export function payFigures(now: readonly ReportRow[], before: readonly ReportRow[] | null, statutory: readonly ReportRow[], dueWords: string) {
  const total = cost(now);
  const was = before && before.length ? cost(before) : null;
  const change = was && was > 0 ? ((total - was) / was) * 100 : null;
  const paye = statutory.filter((row) => row.item === "PAYE" || row.item === "AIDS levy");
  return [
    { label: "Employer cost", value: money(total), note: change === null ? null : `${Math.abs(change).toFixed(1)}% ${change >= 0 ? "more" : "less"}` },
    { label: "Gross", value: money(sum(now, "gross")), note: `${new Set(now.map((row) => row.employee)).size} people` },
    { label: "Net paid", value: money(sum(now, "net")), note: "after deductions" },
    { label: "PAYE and AIDS levy", value: money(sum(paye, "amount")), note: dueWords },
  ];
}

export function monthColumns(rows: readonly ReportRow[], months: readonly string[]) {
  return months.map((month) => {
    const value = cost(rows.filter((row) => row.period === month));
    return { label: monthWords(month).slice(0, 3), parts: [{ value, color: "var(--color-accent)", title: `${monthWords(month)}, $${(value / 1000).toFixed(1)} thousand` }] };
  });
}

export function departmentBars(rows: readonly Grouped[]) {
  const top = Math.max(1, ...rows.map((row) => row.cost));
  return rows.map((row, index) => ({ id: row.name, label: row.name, share: row.cost / top, text: money(row.cost), tone: index === 0 ? ("key" as const) : null }));
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

const changeCell = (value: number | null): Cell =>
  value === null ? { text: "—", tone: "muted" } : Math.abs(value) < 0.005 ? { text: money(0), tone: "muted" } : { text: signedMoney(value) };

function groupTable(id: string, label: string, head: string, rows: readonly Grouped[], against: string | null, href: (name: string) => string | null): Table {
  const total = (key: "people" | "gross" | "cost") => rows.reduce((sum, row) => sum + row[key], 0);
  const change = rows.some((row) => row.change !== null) ? rows.reduce((sum, row) => sum + (row.change ?? 0), 0) : null;
  return {
    id,
    label,
    columns: [
      { id: "name", label: head },
      { id: "people", label: "People", num: true },
      { id: "gross", label: "Gross", num: true },
      { id: "cost", label: "Employer cost", num: true },
      { id: "change", label: against ? `Against ${against}` : "Against the month before", num: true },
    ],
    rows: rows.map((row) => ({
      id: row.name,
      cells: {
        name: { text: row.name, href: href(row.name) },
        people: { text: row.people.toLocaleString("en-US") },
        gross: { text: money(row.gross) },
        cost: { text: money(row.cost) },
        change: changeCell(row.change),
      },
    })),
    total: { label: "Total", cells: { people: { text: total("people").toLocaleString("en-US") }, gross: { text: money(total("gross")) }, cost: { text: money(total("cost")) }, change: changeCell(change) } },
    empty: "No pay run in these dates.",
  };
}

export const departmentTable = (rows: readonly Grouped[], against: string | null, href: (name: string) => string | null) =>
  groupTable("department", "By department", "Department", rows, against, href);
export const gradeTable = (rows: readonly Grouped[], against: string | null) => groupTable("grade", "By job grade", "Job grade", rows, against, () => null);

/** By pay item: what each run withheld and owes the state, item by item. */
export function itemTable(statutory: readonly ReportRow[]): Table {
  const items = new Map<string, ReportRow[]>();
  for (const row of statutory) items.set(String(row.item), [...(items.get(String(row.item)) ?? []), row]);
  return {
    id: "item",
    label: "By pay item",
    columns: [
      { id: "item", label: "Pay item" },
      { id: "paidBy", label: "Paid by" },
      { id: "people", label: "People", num: true },
      { id: "amount", label: "Amount", num: true },
    ],
    rows: [...items].map(([item, rows]) => ({
      id: item,
      cells: {
        item: { text: item },
        paidBy: { text: String(rows[0]?.paidBy ?? ""), tone: "muted" },
        people: { text: new Set(rows.map((row) => row.employee)).size.toLocaleString("en-US") },
        amount: { text: money(sum(rows, "amount")) },
      },
    })),
    total: { label: "Total", cells: { amount: { text: money(sum(statutory, "amount")) } } },
    empty: "No statutory item in these dates.",
  };
}
