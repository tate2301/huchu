"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

import { barsSvg, seriesBy, timeSeries, trendSvg, type ChartColors } from "@/lib/reports/charts";
import { formatTotal, formatValue, totalCaption } from "@/lib/reports/format";
import {
  breakdownBy,
  DEFAULT_BREAKDOWN_LIMIT,
  DEFAULT_CHART_LIMIT,
  layoutRows,
  measureLabel,
  type BreakdownBlock,
  type ChartBlock,
  type LayoutBlock,
} from "@/lib/reports/layout";
import type { ReportColumn, ReportMeta, ReportParams, ReportView } from "@/lib/reports/types";
import { applyView, type AppliedView } from "@/lib/reports/view";

/**
 * A report's layout, drawn: the blocks read the rows the table shows, so a
 * filter set above moves every figure and chart on the page with it.
 */

/** The design system's first chart colour, and its quiet inks. Text never wears the mark. */
const SCREEN_COLORS: ChartColors = {
  mark: "var(--chart-1)",
  grid: "var(--border-subtle)",
  text: "var(--text-body)",
  muted: "var(--text-muted)",
  surface: "var(--surface)",
};

type Context = {
  meta: ReportMeta;
  view: ReportView;
  params: ReportParams;
  applied: AppliedView;
};

function columnOf(meta: ReportMeta, key: string | undefined): ReportColumn | null {
  return key ? meta.columns.find((column) => column.key === key) ?? null : null;
}

function valueFormatter(meta: ReportMeta, block: ChartBlock): (value: number) => string {
  const column = columnOf(meta, block.measure?.column);
  if (!column || !block.measure || block.measure.fn === "count" || block.measure.fn === "distinct") {
    return (value) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
  return (value) => formatTotal(value, column, block.measure!.fn);
}

/* ──────────────────────────────────────────────────────────────────────────
   Figures
   ────────────────────────────────────────────────────────────────────────── */

function Figures({ meta, view, applied }: Context) {
  const figures = [
    { key: "rows", label: "Rows", value: applied.rows.length.toLocaleString("en-US") },
    ...Object.entries(view.totals).flatMap(([key, fn]) => {
      const column = columnOf(meta, key);
      const value = applied.totals[key];
      if (!column || value === null || value === undefined) return [];
      return [
        {
          key,
          label: fn === "sum" ? column.label : `${column.label} · ${totalCaption(fn).toLowerCase()}`,
          value: formatTotal(value, column, fn),
        },
      ];
    }),
  ];
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-6 gap-y-3">
      {figures.map((figure) => (
        <div key={figure.key} className="border-t border-[var(--border)] pt-2">
          <dt className="truncate text-[12px] leading-[1.4] font-medium text-[var(--text-muted)]">{figure.label}</dt>
          <dd className="mt-0.5 truncate text-[17px] leading-[1.25] font-semibold tracking-[-0.012em] text-[var(--text-strong)]">
            {figure.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Charts
   ────────────────────────────────────────────────────────────────────────── */

/** Drawing widths: a chart beside another, and one across the page. */
const HALF = 520;
const FULL = 1080;

function Chart({ block, meta, params, applied, width }: Context & { block: ChartBlock; width: number }) {
  const frame = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; label: string; value: string } | null>(null);
  const by = columnOf(meta, block.by);

  const { svg, summary, empty } = useMemo(() => {
    if (!by) return { svg: "", summary: "", empty: true };
    const format = valueFormatter(meta, block);
    if (block.form === "bars") {
      const points = seriesBy(applied.rows, by, block.measure, meta.columns, block.limit ?? DEFAULT_CHART_LIMIT, (value) => formatValue(value, by));
      return {
        svg: barsSvg(points, { width: Math.min(width, 720), colors: SCREEN_COLORS, format }),
        summary: points.map((point) => `${point.label} ${point.value === null ? "none" : format(point.value)}`).join(", "),
        empty: points.every((point) => !point.value),
      };
    }
    const { points } = timeSeries(applied.rows, by, block.measure, meta.columns, {
      from: params.from || undefined,
      to: params.to || undefined,
    });
    const last = [...points].reverse().find((point) => point.value !== null);
    return {
      svg: trendSvg(points, { width, height: width > HALF ? 240 : 200, colors: SCREEN_COLORS, format }),
      summary: last ? `${points.length} points, latest ${last.label} ${format(last.value!)}` : "",
      empty: points.every((point) => !point.value),
    };
  }, [applied.rows, block, by, meta, params.from, params.to, width]);

  if (!by) return null;
  const title = block.title ?? `${measureLabel(block.measure, meta.columns)} ${block.form === "bars" ? `by ${by.label.toLowerCase()}` : "over time"}`;

  const hover = (event: React.MouseEvent) => {
    const mark = (event.target as Element).closest?.(".chart-mark");
    const box = frame.current?.getBoundingClientRect();
    if (!mark || !box) return setTip(null);
    // Placed here, from the frame's size now, so it never runs off the right edge.
    setTip({
      x: Math.min(event.clientX - box.left + 12, box.width - 150),
      y: Math.max(0, event.clientY - box.top - 36),
      label: mark.getAttribute("data-label") ?? "",
      value: mark.getAttribute("data-value") ?? "",
    });
  };

  return (
    <section aria-label={title} className="min-w-0">
      <h2 className="mb-2.5 text-[15px] leading-[1.35] font-semibold text-[var(--text-strong)]">{title}</h2>
      {empty ? (
        <p className="text-[13px] text-[var(--text-muted)]">Nothing to chart in these rows.</p>
      ) : (
        <div ref={frame} className="relative" onMouseMove={hover} onMouseLeave={() => setTip(null)}>
          <div role="img" aria-label={`${title}: ${summary}`} dangerouslySetInnerHTML={{ __html: svg }} />
          {tip ? (
            <div
              role="status"
              className="pointer-events-none absolute z-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[12px] shadow-[var(--shadow-popover)]"
              style={{ left: tip.x, top: tip.y }}
            >
              <span className="text-[var(--text-muted)]">{tip.label}</span>{" "}
              <span className="font-mono font-medium tabular-nums text-[var(--text-strong)]">{tip.value}</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Breakdown
   ────────────────────────────────────────────────────────────────────────── */

function Breakdown({ block, meta, view, applied }: Context & { block: BreakdownBlock }) {
  const by = breakdownBy(block, view, meta.columns);
  const lines = useMemo(() => {
    if (!by) return [];
    const regrouped = applyView(applied.rows, meta.columns, { ...view, conditions: [], search: "", groupBy: by.key });
    return (regrouped.groups ?? []).map((group) => ({
      name: group.value === null ? "None" : formatValue(group.value, by),
      rows: group.rows,
      totals: group.totals,
    }));
  }, [applied.rows, by, meta.columns, view]);
  if (!by) return null;

  const totals = Object.entries(view.totals)
    .map(([key, fn]) => ({ column: columnOf(meta, key), fn }))
    .filter((entry): entry is { column: ReportColumn; fn: (typeof entry)["fn"] } => Boolean(entry.column));
  const lead = totals.find(({ column, fn }) => fn === "sum" && column.kind === "money") ?? totals.find(({ fn }) => fn === "sum");
  const whole = lead ? Number(applied.totals[lead.column.key] ?? 0) : applied.rows.length;
  const measured = lines
    .map((line) => ({ ...line, part: lead ? Number(line.totals[lead.column.key] ?? 0) : line.rows.length }))
    .sort((a, b) => b.part - a.part)
    .slice(0, block.limit ?? DEFAULT_BREAKDOWN_LIMIT);

  return (
    <section aria-label={`By ${by.label.toLowerCase()}`} className="min-w-0">
      <h2 className="mb-2.5 text-[15px] leading-[1.35] font-semibold text-[var(--text-strong)]">
        By {by.label.toLowerCase()}
      </h2>
      <table className="w-full border-separate border-spacing-0 text-left text-[13px]">
        <thead>
          <tr className="acct-col-head">
            <th className="border-b border-[var(--border)] py-1.5 pr-3 font-medium">{by.label}</th>
            <th className="border-b border-[var(--border)] py-1.5 pr-3 text-right font-medium">Rows</th>
            {totals.map(({ column, fn }) => (
              <th key={column.key} className="border-b border-[var(--border)] py-1.5 pr-3 text-right font-medium">
                {fn === "sum" ? column.label : `${column.label} · ${totalCaption(fn).toLowerCase()}`}
              </th>
            ))}
            <th className="w-40 border-b border-[var(--border)] py-1.5 font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {measured.map((line) => {
            const share = whole > 0 ? Math.max(0, Math.min(1, line.part / whole)) : 0;
            return (
              <tr key={line.name}>
                <td className="max-w-[16rem] truncate border-b border-[var(--table-divider)] py-1.5 pr-3 font-medium text-[var(--text)]">
                  {line.name}
                </td>
                <td className="border-b border-[var(--table-divider)] py-1.5 pr-3 text-right font-mono tabular-nums">
                  {line.rows.length.toLocaleString("en-US")}
                </td>
                {totals.map(({ column, fn }) => (
                  <td key={column.key} className="border-b border-[var(--table-divider)] py-1.5 pr-3 text-right font-mono tabular-nums">
                    {formatTotal(line.totals[column.key], column, fn)}
                  </td>
                ))}
                <td className="border-b border-[var(--table-divider)] py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                      <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${share * 100}%` }} />
                    </span>
                    <span className="w-12 text-right font-mono text-[12px] tabular-nums text-[var(--text-muted)]">
                      {(share * 100).toFixed(1)}%
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   The page
   ────────────────────────────────────────────────────────────────────────── */

/** One block, drawn at a width. The table is drawn by the caller. */
export function Leaf({ block, width, ...context }: Context & { block: Exclude<LayoutBlock, { type: "table" }>; width: number }) {
  switch (block.type) {
    case "heading":
      return block.level === 1 ? (
        <h2 className="text-[17px] leading-[1.25] font-semibold tracking-[-0.012em] text-[var(--text-strong)]">{block.text}</h2>
      ) : (
        <h3 className="text-[15px] leading-[1.35] font-semibold text-[var(--text-strong)]">{block.text}</h3>
      );
    case "text":
      return <p className="max-w-[70ch] text-[13px] leading-[1.5] whitespace-pre-line text-[var(--text-body)]">{block.text}</p>;
    case "figures":
      return <Figures {...context} />;
    case "chart":
      return <Chart block={block} width={width} {...context} />;
    case "breakdown":
      return <Breakdown block={block} {...context} />;
  }
}

export function ReportBlocks({
  blocks,
  table,
  ...context
}: Context & {
  blocks: LayoutBlock[];
  /** The worksheet, drawn where the layout puts the table. */
  table: ReactNode;
}) {
  return (
    <div className="grid gap-8">
      {layoutRows(blocks).map((row) =>
        row.length === 2 ? (
          <div key={row[0]!.id} className="grid gap-8 md:grid-cols-2">
            {row.map((block) =>
              block.type === "table" ? null : (
                <div key={block.id} className="min-w-0">
                  <Leaf block={block} width={HALF} {...context} />
                </div>
              ),
            )}
          </div>
        ) : row[0]!.type === "table" ? (
          <div key={row[0]!.id}>{table}</div>
        ) : (
          <Leaf key={row[0]!.id} block={row[0]!} width={FULL} {...context} />
        ),
      )}
    </div>
  );
}
