import type { BlockKind } from "@/components/builder/grid";
import type { IconName } from "@/components/core";
import {
  controlsWords,
  freeBlockId,
  freeBlockName,
  sourceStem,
  type BlockDisplay,
  type CustomBlock,
  type CustomDocument,
  type DateDefault,
} from "@/lib/reports/custom/document";
import { naturalGrouping, naturalMeasure } from "@/lib/reports/layout";
import { sqlName } from "@/lib/reports/sql/schema";
import type { Aggregate, ReportColumn, ReportColumnKind } from "@/lib/reports/types";
import { AGGREGATE_LABELS } from "@/lib/reports/view";

import { chartColumns } from "./custom-block";
import type { ReportSource } from "./use-custom-data";

/**
 * What a custom report's builder puts on the page and how: the kinds of
 * block, a new block of each kind over the source the page last read, and a
 * block shown another way keeping what still fits its result.
 */

export type ReportBlockKind = "table" | "bars" | "trend" | "figures" | "breakdown" | "heading" | "text" | "sentence" | "controls";

export const REPORT_KINDS: Record<ReportBlockKind, BlockKind> = {
  table: { id: "table", label: "Table", icon: "table" },
  bars: { id: "bars", label: "Bar chart", icon: "reports" },
  trend: { id: "trend", label: "Trend over time", icon: "insights" },
  figures: { id: "figures", label: "Headline figures", icon: "figure" },
  breakdown: { id: "breakdown", label: "Breakdown", icon: "list" },
  heading: { id: "heading", label: "Heading", icon: "sections" },
  text: { id: "text", label: "Text", icon: "sentence" },
  // ReportBuild: the board's finding over a question's totals, and the report's own dates and filters.
  sentence: { id: "sentence", label: "Sentence", icon: "bulb" },
  controls: { id: "controls", label: "Dates and filters", icon: "filter" },
};

/** The kinds Add (/) offers: a report has one set of controls, so not a second. */
export function addableKinds(blocks: readonly CustomBlock[]): BlockKind[] {
  const hasControls = blocks.some((block) => block.type === "controls");
  return Object.values(REPORT_KINDS).filter((kind) => kind.id !== "controls" || !hasControls);
}

export function kindOf(block: CustomBlock): ReportBlockKind {
  if (block.type !== "query") return block.type;
  return block.display.type === "chart" ? block.display.form : block.display.type;
}

export function kindIcon(block: CustomBlock): IconName {
  return REPORT_KINDS[kindOf(block)].icon;
}

/** A question's name as the builder says it: "by_fitter" reads "by fitter". */
export function questionName(name: string): string {
  return name.replace(/_/g, " ");
}

/** What a block is called in the outline and on its tag. */
export function blockTitle(block: CustomBlock): string {
  if (block.type === "heading") return block.text.trim() || "Heading";
  if (block.type === "text") return block.text.trim().split("\n")[0]!.slice(0, 60) || "Text";
  if (block.type === "sentence") return "Sentence";
  if (block.type === "controls") return controlsWords(block);
  return block.title?.trim() || REPORT_KINDS[kindOf(block)].label;
}

/** The question a block reads, as the outline says it beside the block: "totals". */
export function blockQuestion(block: CustomBlock): string | undefined {
  if (block.type === "query") return questionName(block.name);
  if (block.type === "sentence" && block.from) return questionName(block.from);
  return undefined;
}

/** The dates a report can open on, as the person picks them. */
export const PERIODS: Array<{ id: string; label: string; from: DateDefault | null; to: DateDefault | null }> = [
  { id: "7", label: "The last 7 days", from: "-7d", to: "today" },
  { id: "30", label: "The last 30 days", from: "-30d", to: "today" },
  { id: "90", label: "The last 90 days", from: "-90d", to: "today" },
  { id: "365", label: "The last 12 months", from: "-365d", to: "today" },
  { id: "month", label: "This month so far", from: "monthStart", to: "today" },
  { id: "year", label: "This year so far", from: "yearStart", to: "today" },
  { id: "any", label: "Any time", from: null, to: null },
];

export function periodId(period: CustomDocument["period"]): string {
  return PERIODS.find((entry) => entry.from === period.from && entry.to === period.to)?.id ?? "custom";
}

/** The report's own dates, named: "Last 180 days", "This year". */
export function periodWords(period: CustomDocument["period"]): string {
  const known = PERIODS.find((entry) => entry.from === period.from && entry.to === period.to);
  if (known) return known.label.replace(/^The last/, "Last").replace(/ so far$/, "");
  const days = period.from ? /^-(\d+)d$/.exec(period.from) : null;
  if (days) return `Last ${days[1]} days`;
  return "Its own dates";
}

/** The source a new block starts from: the one the page last read, else the first there is. */
function defaultSource(blocks: readonly CustomBlock[], sources: readonly ReportSource[]): ReportSource | null {
  for (const block of [...blocks].reverse()) {
    if (block.type !== "query") continue;
    const table = /\bfrom\s+([A-Za-z0-9_]+)/i.exec(block.query)?.[1]?.toLowerCase();
    const source = sources.find((candidate) => sqlName(candidate.key) === table);
    if (source) return source;
  }
  return sources[0] ?? null;
}

export function createReportBlock(kind: string, existing: readonly CustomBlock[], sources: readonly ReportSource[]): CustomBlock {
  if (kind === "heading") return { id: freeBlockId("heading", existing), type: "heading", text: "" };
  if (kind === "text") return { id: freeBlockId("text", existing), type: "text", text: "" };
  if (kind === "sentence") {
    // Over the page's headline figures, where it has some: the totals a finding is made of.
    const queries = existing.filter((block) => block.type === "query");
    const totals = queries.find((block) => block.type === "query" && block.display.type === "figures") ?? queries[0];
    return { id: freeBlockId("sentence", existing), type: "sentence", from: totals?.type === "query" ? totals.name : "", fact: "", rest: "" };
  }
  if (kind === "controls") return { id: freeBlockId("controls", existing), type: "controls", dates: true, filters: [] };

  const source = defaultSource(existing, sources);
  // Results name their columns the SQL way, so the display does too.
  const columns = (source?.columns ?? []).map((column) => ({ ...column, key: sqlName(column.key) }));
  const table = source ? sqlName(source.key) : "";
  const from = `select *\nfrom ${table}\n`;
  const measure = naturalMeasure(columns) ?? undefined;
  const base = { id: freeBlockId("query", existing), type: "query" as const, name: freeBlockName(source ? sourceStem(source.key) : "result", existing) };

  switch (kind as ReportBlockKind) {
    case "bars": {
      const by = naturalGrouping(columns) ?? chartColumns(columns, "bars").by[0];
      return { ...base, query: from, display: { type: "chart", form: "bars", by: by?.key ?? "", ...(measure ? { measure } : {}) } };
    }
    case "trend": {
      const by = chartColumns(columns, "trend").by[0];
      return { ...base, query: from, display: { type: "chart", form: "trend", by: by?.key ?? "", ...(measure ? { measure } : {}) } };
    }
    case "figures": {
      const totals = columns.filter((column) => column.total === "sum").map((column) => `sum(${column.key}) as ${column.key}`);
      return { ...base, query: `select ${["count(*) as row_count", ...totals].join(",\n  ")}\nfrom ${table}\n`, display: { type: "figures" } };
    }
    case "breakdown":
      return { ...base, query: from, display: { type: "breakdown" } };
    default:
      return { ...base, query: from, display: { type: "table" } };
  }
}

export function duplicateReportBlock(block: CustomBlock, existing: readonly CustomBlock[]): CustomBlock {
  return block.type === "query"
    ? { ...block, id: freeBlockId("query", existing), name: freeBlockName(block.name, existing) }
    : { ...block, id: freeBlockId(block.type, existing) };
}

/** A display switched to another kind, keeping what still fits the result's columns. */
export function redisplay(kind: ReportBlockKind, display: BlockDisplay, columns: ReportColumn[]): BlockDisplay {
  if (kind === "table") return { type: "table", ...(display.type === "table" && display.hidden ? { hidden: display.hidden } : {}) };
  if (kind === "figures") return { type: "figures" };
  if (kind === "breakdown") return { type: "breakdown" };
  const form = kind as "bars" | "trend";
  const { by } = chartColumns(columns, form);
  const keep = display.type === "chart" && by.some((column) => column.key === display.by) ? display.by : null;
  const kept = display.type === "chart" ? display.measure : undefined;
  const figure = chartColumns(columns, form).measures[0];
  const measure = kept ?? (figure ? { column: figure.key, fn: "sum" as const } : undefined);
  return {
    type: "chart",
    form,
    by: keep ?? (form === "bars" ? naturalGrouping(columns) ?? by[0] : by[0])?.key ?? "",
    ...(measure ? { measure } : {}),
  };
}

export const ROWS = "rows";

export function measureOptions(columns: ReportColumn[]): Array<[string, string]> {
  return [
    [ROWS, "How many rows"],
    ...chartColumns(columns, "bars").measures.flatMap((column) =>
      (["sum", "avg", "max"] as Aggregate[]).map((fn): [string, string] => [`${fn}:${column.key}`, `${AGGREGATE_LABELS[fn]} of ${column.label}`]),
    ),
  ];
}

/** What a column holds, said the way the inspector lists it. */
export function kindWords(kind: ReportColumnKind): string {
  switch (kind) {
    case "date":
      return "Date";
    case "money":
      return "Money";
    case "number":
      return "Number";
    case "status":
      return "A dot and a word";
    case "code":
      return "Reference";
    default:
      return "Text";
  }
}
