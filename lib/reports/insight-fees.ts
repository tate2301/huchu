import type { ArrearsAgingRow, CollectionsByYearGroupRow, CollectionsReportRow } from "@/lib/schools/reports";
import { insightMoney } from "@/lib/reports/week-insights";

/**
 * Reports → Insights → Fees (PageSchoolFees): what a school's Collections
 * and Arrears showed, as one insight. What came in against what was billed
 * for the term chosen, who is behind, who has paid nothing, and how old the
 * debt is. Pure: the page reads the collections and arrears the school's
 * reports API answers.
 */

export type CollectionsResponse = {
  data: CollectionsReportRow[];
  summary: { totalInvoiced: number; totalCollected: number; totalReceipts: number; overallCollectionRate: number };
  byYearGroup: CollectionsByYearGroupRow[];
};

export type ArrearsResponse = {
  data: ArrearsAgingRow[];
  summary: {
    studentsWithArrears: number;
    totalOutstanding: number;
    aging: { current: number; days30: number; days60: number; days90: number; days120Plus: number };
  };
};

const money = insightMoney;
const pct = (share: number) => `${Math.round(share * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Billed, paid and what is left, over a set of class rows. */
export function feeTotals(rows: readonly CollectionsByYearGroupRow[]) {
  const billed = rows.reduce((total, row) => total + row.invoiced, 0);
  const paid = rows.reduce((total, row) => total + row.collected, 0);
  return {
    billed,
    paid,
    owed: Math.max(0, billed - paid),
    rate: billed > 0 ? paid / billed : null,
    pupils: rows.reduce((total, row) => total + row.pupils, 0),
    owing: rows.reduce((total, row) => total + row.owing, 0),
    paidNothing: rows.reduce((total, row) => total + row.paidNothing, 0),
    paidNothingOwed: rows.reduce((total, row) => total + row.paidNothingOwed, 0),
  };
}

/** The class furthest behind, when one is billed. */
export function behindClass(rows: readonly CollectionsByYearGroupRow[]): CollectionsByYearGroupRow | null {
  return [...rows].filter((row) => row.invoiced > 0).sort((a, b) => a.collectionRate - b.collectionRate)[0] ?? null;
}

/** "$290,186.00 of $348,400.00 is in: 83% of the term’s fees. Form 3 is behind at 74%, and 41 families have paid nothing." */
export function feesFinding(rows: readonly CollectionsByYearGroupRow[], whose: string): { fact: string; rest: string | null } | null {
  const totals = feeTotals(rows);
  if (totals.rate === null) return null;
  const fact = `${money(totals.paid)} of ${money(totals.billed)} is in: ${pct(totals.rate)} of ${whose} fees.`;
  const behind = behindClass(rows);
  const parts: string[] = [];
  if (behind && rows.length > 1 && behind.collectionRate / 100 < totals.rate) parts.push(`${behind.className} is behind at ${Math.round(behind.collectionRate)}%`);
  if (totals.paidNothing > 0) parts.push(`${plural(totals.paidNothing, "family", "families")} ${totals.paidNothing === 1 ? "has" : "have"} paid nothing`);
  if (parts.length === 0) return { fact, rest: null };
  const rest = parts.join(", and ");
  return { fact, rest: `${rest.charAt(0).toUpperCase()}${rest.slice(1)}.` };
}

export type FeeFigure = { label: string; value: string; note?: string | null };

/** `when`: "this term", "last term", "this year", "in these dates". */
export function feesFigures(rows: readonly CollectionsByYearGroupRow[], before: number | null, arrears: ArrearsResponse["summary"] | null, when: string): FeeFigure[] {
  const totals = feeTotals(rows);
  const old = arrears ? arrears.aging.days90 + arrears.aging.days120Plus : null;
  return [
    { label: "Collection rate", value: totals.rate === null ? "—" : pct(totals.rate), note: before === null ? null : `was ${pct(before)}` },
    { label: "Still owing", value: money(totals.owed), note: plural(totals.owing, "family", "families") },
    { label: `Paid nothing ${when}`, value: plural(totals.paidNothing, "family", "families"), note: `${money(totals.paidNothingOwed)} between them` },
    { label: "From earlier terms", value: old === null ? "—" : money(old), note: "90 days and over" },
  ];
}

/** The year's terms, each billed and split into collected and still owing. */
export function termColumns(rows: readonly CollectionsReportRow[]) {
  return rows.map((row) => ({
    label: row.termName,
    parts: [
      { value: row.collected, color: "var(--color-ink-2)", title: `${row.termName}: ${money(row.collected)} collected` },
      { value: Math.max(0, row.invoiced - row.collected), color: "var(--color-warning)", title: `${row.termName}: ${money(Math.max(0, row.invoiced - row.collected))} still owing` },
    ],
  }));
}

type Cell = { text: string; tone?: "success" | "danger" | "warning" | "muted" | null; href?: string | null };
export type FeesTable = {
  id: string;
  label: string;
  columns: Array<{ id: string; label: string; num?: boolean }>;
  rows: Array<{ id: string; cells: Record<string, Cell | null> }>;
  total?: { label: string; cells: Record<string, Cell | null> } | null;
  empty: string;
};

const rateCell = (rate: number | null, below: number | null): Cell =>
  rate === null ? { text: "—", tone: "muted" } : { text: pct(rate), tone: below !== null && rate < below ? "warning" : null };

/** By class: pupils, billed, paid, owed and the share collected; a class under the school's rate is flagged. */
export function classTable(rows: readonly CollectionsByYearGroupRow[], arrearsHref: (classId: string) => string): FeesTable {
  const totals = feeTotals(rows);
  return {
    id: "class",
    label: "By class",
    columns: [
      { id: "class", label: "Class" },
      { id: "pupils", label: "Pupils", num: true },
      { id: "billed", label: "Billed", num: true },
      { id: "paid", label: "Paid", num: true },
      { id: "owed", label: "Owed", num: true },
      { id: "rate", label: "Collected", num: true },
    ],
    rows: rows.map((row) => ({
      id: row.classId || "none",
      cells: {
        class: { text: row.className, href: row.classId ? arrearsHref(row.classId) : null },
        pupils: { text: row.pupils.toLocaleString("en-US") },
        billed: { text: money(row.invoiced) },
        paid: { text: money(row.collected) },
        owed: { text: money(Math.max(0, row.invoiced - row.collected)) },
        rate: rateCell(row.invoiced > 0 ? row.collected / row.invoiced : null, totals.rate),
      },
    })),
    total: {
      label: "Total",
      cells: {
        pupils: { text: totals.pupils.toLocaleString("en-US") },
        billed: { text: money(totals.billed) },
        paid: { text: money(totals.paid) },
        owed: { text: money(totals.owed) },
        rate: rateCell(totals.rate, null),
      },
    },
    empty: "Nothing was billed in these dates.",
  };
}

/** Arrears, by age: each pupil who owes, oldest debt last, as the arrears board had it. */
export function ageTable(rows: readonly ArrearsAgingRow[], pupilHref: (studentId: string) => string): FeesTable {
  const sum = (key: "totalOutstanding" | "current" | "days30" | "days60" | "days90" | "days120Plus") => rows.reduce((total, row) => total + row[key], 0);
  const cell = (value: number): Cell => (value > 0 ? { text: money(value) } : { text: "—", tone: "muted" });
  return {
    id: "age",
    label: "Arrears, by age",
    columns: [
      { id: "pupil", label: "Pupil" },
      { id: "class", label: "Class" },
      { id: "current", label: "Not yet due", num: true },
      { id: "days30", label: "30 days", num: true },
      { id: "days60", label: "60 days", num: true },
      { id: "days90", label: "90 days and over", num: true },
      { id: "owed", label: "Owed", num: true },
    ],
    rows: rows.map((row) => ({
      id: row.studentId,
      cells: {
        pupil: { text: row.studentName, href: pupilHref(row.studentId) },
        class: { text: row.className, tone: "muted" },
        current: cell(row.current),
        days30: cell(row.days30),
        days60: cell(row.days60),
        days90: { ...cell(row.days90 + row.days120Plus), ...(row.days90 + row.days120Plus > 0 ? { tone: "warning" as const } : {}) },
        owed: { text: money(row.totalOutstanding) },
      },
    })),
    total: {
      label: "Total",
      cells: {
        current: cell(sum("current")),
        days30: cell(sum("days30")),
        days60: cell(sum("days60")),
        days90: cell(sum("days90") + sum("days120Plus")),
        owed: { text: money(sum("totalOutstanding")) },
      },
    },
    empty: "Nobody owes anything in this view.",
  };
}

/** By fee: each fee structure's bills in the dates. */
export function feeTable(rows: ReadonlyArray<{ id: string; name: string; billed: number; paid: number }>): FeesTable {
  const billed = rows.reduce((total, row) => total + row.billed, 0);
  const paid = rows.reduce((total, row) => total + row.paid, 0);
  const rate = billed > 0 ? paid / billed : null;
  return {
    id: "fee",
    label: "By fee",
    columns: [
      { id: "fee", label: "Fee" },
      { id: "billed", label: "Billed", num: true },
      { id: "paid", label: "Paid", num: true },
      { id: "owed", label: "Owed", num: true },
      { id: "rate", label: "Collected", num: true },
    ],
    rows: rows
      .filter((row) => row.billed > 0)
      .map((row) => ({
        id: row.id,
        cells: {
          fee: { text: row.name },
          billed: { text: money(row.billed) },
          paid: { text: money(row.paid) },
          owed: { text: money(Math.max(0, row.billed - row.paid)) },
          rate: rateCell(row.billed > 0 ? row.paid / row.billed : null, rate),
        },
      })),
    total: { label: "Total", cells: { billed: { text: money(billed) }, paid: { text: money(paid) }, owed: { text: money(Math.max(0, billed - paid)) }, rate: rateCell(rate, null) } },
    empty: "No fee was billed in these dates.",
  };
}

/** By term: what Collections showed, with the receipts written and the average one. */
export function termTable(rows: readonly CollectionsReportRow[]): FeesTable {
  return {
    id: "term",
    label: "By term",
    columns: [
      { id: "term", label: "Term" },
      { id: "billed", label: "Billed", num: true },
      { id: "paid", label: "Collected", num: true },
      { id: "rate", label: "Rate", num: true },
      { id: "receipts", label: "Receipts", num: true },
      { id: "average", label: "Average receipt", num: true },
    ],
    rows: rows.map((row) => ({
      id: row.termId,
      cells: {
        term: { text: row.termName },
        billed: { text: money(row.invoiced) },
        paid: { text: money(row.collected) },
        rate: rateCell(row.invoiced > 0 ? row.collected / row.invoiced : null, null),
        receipts: { text: row.receiptsCount.toLocaleString("en-US") },
        average: { text: row.receiptsCount > 0 ? money(row.collected / row.receiptsCount) : "—" },
      },
    })),
    total: null,
    empty: "Nothing was billed in these dates.",
  };
}
