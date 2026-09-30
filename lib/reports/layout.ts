import { z } from "zod";

import { AGGREGATES, type Aggregate, type ReportColumn, type ReportMeta, type ReportView } from "@/lib/reports/types";
import { isNumeric } from "@/lib/reports/view";

/**
 * A report as a page: blocks, in order.
 *
 * The worksheet is one block among them — the table — and the rest read the
 * same rows it does: the figures total what the table shows, a chart breaks it
 * down, a breakdown lists it by group. Change a filter and every block follows,
 * because none of them has rows of its own. The screen draws these blocks and
 * the PDF prints them, so the page somebody arranges is the page that prints.
 */

const id = z.string().min(1).max(40);
const columnKey = z.string().min(1).max(64);

/** A figure worth charting: a column and how it is totalled. Absent means "how many rows". */
export const measureSchema = z.object({ column: columnKey, fn: z.enum(AGGREGATES) });
export type Measure = z.infer<typeof measureSchema>;

/** Half a row: two half blocks in a row sit side by side. */
const half = z.boolean().optional();

const headingBlock = z.object({ id, type: z.literal("heading"), text: z.string().max(120), level: z.union([z.literal(1), z.literal(2)]).optional(), half });
const textBlock = z.object({ id, type: z.literal("text"), text: z.string().max(2000), half });
/** The row count and every total the view asks for, as headline figures. */
const figuresBlock = z.object({ id, type: z.literal("figures"), half });
const chartBlock = z.object({
  id,
  type: z.literal("chart"),
  /** Bars compare groups; a trend follows a date. */
  form: z.enum(["bars", "trend"]),
  /** The column the chart is by: grouped for bars, a date for a trend. */
  by: columnKey,
  measure: measureSchema.optional(),
  /** Bars shown before the rest fold into "Other". */
  limit: z.number().int().min(3).max(20).optional(),
  title: z.string().max(120).optional(),
  half,
});
/** One line per group, with totals and a share — the table's own figures by group. */
const breakdownBlock = z.object({
  id,
  type: z.literal("breakdown"),
  by: columnKey.optional(),
  limit: z.number().int().min(3).max(50).optional(),
  half,
});
/** The worksheet itself, always the page's full width. */
const tableBlock = z.object({ id, type: z.literal("table") });

export const layoutBlockSchema = z.discriminatedUnion("type", [
  headingBlock,
  textBlock,
  figuresBlock,
  chartBlock,
  breakdownBlock,
  tableBlock,
]);

export const reportLayoutSchema = z
  .object({ blocks: z.array(layoutBlockSchema).max(30) })
  .refine((layout) => layout.blocks.filter((block) => block.type === "table").length <= 1, {
    message: "A report has one table",
  });

export type LayoutBlock = z.infer<typeof layoutBlockSchema>;
export type ChartBlock = z.infer<typeof chartBlock>;
export type BreakdownBlock = z.infer<typeof breakdownBlock>;
export type ReportLayout = z.infer<typeof reportLayoutSchema>;
export type LayoutBlockType = LayoutBlock["type"];

export const DEFAULT_CHART_LIMIT = 8;
export const DEFAULT_BREAKDOWN_LIMIT = 12;

/**
 * The page's rows: a block alone, or two half blocks side by side. A half
 * block with no half neighbour takes the row to itself rather than leaving a
 * hole beside it.
 */
export function layoutRows(blocks: LayoutBlock[]): LayoutBlock[][] {
  const rows: LayoutBlock[][] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const next = blocks[index + 1];
    if (block.type !== "table" && block.half && next && next.type !== "table" && next.half) {
      rows.push([block, next]);
      index += 1;
    } else {
      rows.push([block]);
    }
  }
  return rows;
}

/* ──────────────────────────────────────────────────────────────────────────
   Defaults
   ────────────────────────────────────────────────────────────────────────── */

/** The column a report is most naturally broken down by: its first state, else its first repeating text. */
export function naturalGrouping(columns: ReportColumn[]): ReportColumn | null {
  return (
    columns.find((column) => column.kind === "status" && !column.hidden) ??
    columns.find((column) => column.kind === "text" && !column.hidden && column !== columns[0]) ??
    null
  );
}

/** The figure a report is about: its first summed money, else its first summed number. */
export function naturalMeasure(columns: ReportColumn[]): Measure | null {
  const summed = columns.filter((column) => column.total === "sum");
  const lead = summed.find((column) => column.kind === "money") ?? summed.find((column) => isNumeric(column.kind));
  return lead ? { column: lead.key, fn: "sum" } : null;
}

/**
 * The page a report opens as when nobody has arranged it: its headline
 * figures, then a breakdown and a trend side by side where it has both, then
 * the table. Every report gets one; a report can declare its own instead.
 */
export function defaultLayout(meta: Pick<ReportMeta, "columns">): ReportLayout {
  const by = naturalGrouping(meta.columns);
  const when = meta.columns.find((column) => column.kind === "date" && !column.hidden) ?? null;
  const measure = naturalMeasure(meta.columns) ?? undefined;

  const charts: LayoutBlock[] = [];
  if (by) charts.push({ id: "by", type: "chart", form: "bars", by: by.key, measure });
  if (when) charts.push({ id: "over-time", type: "chart", form: "trend", by: when.key, measure });
  // A breakdown beside a trend when there are both; the one across the page otherwise.
  const paired = charts.length === 2 ? charts.map((chart) => ({ ...chart, half: true })) : charts;
  return { blocks: [{ id: "figures", type: "figures" }, ...paired, { id: "table", type: "table" }] };
}

/**
 * A layout made to fit the columns a report has today: blocks naming a column
 * that has gone are dropped, so a layout saved last month still opens.
 */
export function fitLayout(layout: ReportLayout, columns: ReportColumn[]): ReportLayout {
  const known = new Set(columns.map((column) => column.key));
  const fits = (block: LayoutBlock): boolean => {
    if (block.type === "chart") return known.has(block.by) && (!block.measure || known.has(block.measure.column));
    if (block.type === "breakdown") return !block.by || known.has(block.by);
    return true;
  };
  return { blocks: layout.blocks.filter(fits) };
}

/** The layout's measure, spelt out: a chart with none counts rows. */
export function measureLabel(measure: Measure | undefined, columns: ReportColumn[]): string {
  if (!measure) return "Rows";
  const column = columns.find((candidate) => candidate.key === measure.column);
  if (!column) return "Rows";
  return measure.fn === "sum" ? column.label : `${column.label} (${AGGREGATE_WORDS[measure.fn]})`;
}

const AGGREGATE_WORDS: Record<Aggregate, string> = {
  sum: "total",
  avg: "average",
  min: "lowest",
  max: "highest",
  count: "count",
  distinct: "distinct",
};

/** The view's grouping wins over a block's own, so grouping the table regroups the page. */
export function breakdownBy(block: BreakdownBlock, view: ReportView, columns: ReportColumn[]): ReportColumn | null {
  const key = view.groupBy ?? block.by;
  return (key ? columns.find((column) => column.key === key) : null) ?? naturalGrouping(columns);
}
