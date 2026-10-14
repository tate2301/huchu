"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { Button, Kit } from "@/components/core";
import { seriesBy, timeSeries, type ChartPoint } from "@/lib/reports/charts";
import { formatTotal, formatValue, shortTicks, totalCaption } from "@/lib/reports/format";
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
 * A report's layout, drawn in the kit (PageReport): the key figures as one
 * strip, charts as blocks of bars or a line, two half blocks side by side.
 * The blocks read the rows the table shows, so a filter set above moves every
 * figure and chart on the page with it.
 */

type Context = {
  meta: ReportMeta;
  view: ReportView;
  params: ReportParams;
  applied: AppliedView;
};

/**
 * Explain a figure (PageVaneReport): when the page offers it, each key figure
 * and each bar has an Explain button that gives Vane the question.
 */
export type ExplainFigure = (figure: string, value: string) => void;
const ExplainContext = createContext<ExplainFigure | null>(null);
export const ExplainProvider = ExplainContext.Provider;

function ExplainButton({ figure, value }: { figure: string; value: string }) {
  const explain = useContext(ExplainContext);
  if (!explain) return null;
  return (
    <Button
      variant="quiet"
      iconOnly
      icon="help"
      size="sm"
      className="rp-explain"
      label={`Explain ${figure}, ${value}`}
      onClick={() => explain(figure, value)}
    />
  );
}

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

/** "sum of Value", "average of Hours", "how many". */
function measureWords(block: ChartBlock, meta: ReportMeta): string {
  const column = columnOf(meta, block.measure?.column);
  if (!block.measure || !column) return "how many";
  return `${totalCaption(block.measure.fn).toLowerCase()} of ${column.label}`;
}

/* ──────────────────────────────────────────────────────────────────────────
   Figures
   ────────────────────────────────────────────────────────────────────────── */

function Figures({ meta, view, applied }: Context) {
  const count = applied.rows.length;
  const figures = [
    { key: "rows", label: meta.title || "Rows", value: count.toLocaleString("en-US"), note: count === 1 ? "row" : "rows" },
    ...Object.entries(view.totals).flatMap(([key, fn]) => {
      const column = columnOf(meta, key);
      const value = applied.totals[key];
      if (!column || value === null || value === undefined) return [];
      return [{ key, label: column.label, value: formatTotal(value, column, fn), note: `${totalCaption(fn).toLowerCase()} of ${count.toLocaleString("en-US")}` }];
    }),
  ];
  return (
    <div className="rp-figs">
      <div className="kstrip" style={{ gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))` }}>
        {figures.map((figure) => (
          <div className="kt rp-kt" key={figure.key}>
            <span className="kt-l">{figure.label}</span>
            <ExplainButton figure={figure.label} value={figure.value} />
            <span className="kt-v">{figure.value}</span>
            <span className="kt-n muted">{figure.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Charts
   ────────────────────────────────────────────────────────────────────────── */

/** Bars, largest first; the largest in the accent and the rest in muted ink. */
function Bars({ points, format }: { points: ChartPoint[]; format: (value: number) => string }) {
  const max = Math.max(0, ...points.map((point) => point.value ?? 0));
  return (
    <>
      {points.map((point, index) => {
        const share = max > 0 && point.value ? Math.max(0, point.value / max) : 0;
        return (
          <div className="hbar rp-hbar" key={`${point.label}-${index}`}>
            <span className="truncate rp-bar-l">
              <span className="truncate">{point.label}</span>
              <ExplainButton figure={point.label} value={point.value === null ? "None" : format(point.value)} />
            </span>
            <span className="hbar-t">
              <i style={{ width: `${(share * 100).toFixed(1)}%`, background: index === 0 ? "var(--color-accent)" : "var(--color-muted)" }} />
            </span>
            <span className="num">{point.value === null ? "None" : format(point.value)}</span>
          </div>
        );
      })}
    </>
  );
}

/** A line over time with its axis under it, as the board draws it. */
function Line({ points, format }: { points: ChartPoint[]; format: (value: number) => string }) {
  const [tip, setTip] = useState<number | null>(null);
  const width = 520;
  const height = 150;
  const values = points.map((point) => point.value ?? 0);
  const max = Math.max(1, ...values);
  const x = (index: number) => 8 + (points.length > 1 ? (index / (points.length - 1)) * (width - 16) : (width - 16) / 2);
  const y = (value: number) => 142 - (value / max) * 134;
  const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.value ?? 0).toFixed(1)}`).join(" ");
  const ticks = Math.min(6, points.length);
  const axis = shortTicks(Array.from({ length: ticks }, (_, at) => points[Math.round((at * (points.length - 1)) / Math.max(1, ticks - 1))]!.label));
  const shown = tip !== null ? points[tip] : null;
  return (
    <div className="rp-line">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={points.map((point) => `${point.label} ${point.value === null ? "none" : format(point.value)}`).join(", ")}
        onMouseLeave={() => setTip(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const at = Math.round(((event.clientX - box.left) / box.width) * (points.length - 1));
          setTip(Math.max(0, Math.min(points.length - 1, at)));
        }}
      >
        {[8, 52.7, 97.3, 142].map((line) => (
          <line key={line} x1="8" x2={width - 8} y1={line} y2={line} stroke="var(--color-line)" strokeWidth="1" />
        ))}
        <polygon points={`8,142 ${line} ${x(points.length - 1).toFixed(1)},142`} fill="var(--color-info)" opacity="0.1" />
        <polyline points={line} fill="none" stroke="var(--color-info)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      {shown ? (
        <span className="rp-tip" role="status">
          {shown.label} <b>{shown.value === null ? "None" : format(shown.value)}</b>
        </span>
      ) : null}
      <div className="axis">
        {axis.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function Chart({ block, meta, params, applied }: Context & { block: ChartBlock }) {
  const by = columnOf(meta, block.by);
  const format = useMemo(() => valueFormatter(meta, block), [meta, block]);
  const series = useMemo(() => {
    if (!by) return null;
    if (block.form === "bars") {
      return { points: seriesBy(applied.rows, by, block.measure, meta.columns, block.limit ?? DEFAULT_CHART_LIMIT, (value) => formatValue(value, by)), sum: measureWords(block, meta) };
    }
    const { points, bucket } = timeSeries(applied.rows, by, block.measure, meta.columns, { from: params.from || undefined, to: params.to || undefined });
    return { points, sum: `by ${bucket}, ${measureWords(block, meta)}` };
  }, [applied.rows, block, by, meta, params.from, params.to]);
  if (!by || !series) return null;

  const title = block.title ?? `${measureLabel(block.measure, meta.columns)}, by ${by.label.toLowerCase()}`;
  const empty = series.points.every((point) => !point.value);
  return (
    <section className="kblock rp-block" aria-label={title}>
      <div className="kblock-h">
        <h3>{title}</h3>
        <span className="sum">{series.sum}</span>
      </div>
      {empty ? (
        <p className="muted">Nothing to chart in these rows.</p>
      ) : block.form === "bars" ? (
        <Bars points={series.points} format={format} />
      ) : (
        <Line points={series.points} format={format} />
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
    <section className="kblock rp-block" aria-label={`By ${by.label.toLowerCase()}`}>
      <div className="kblock-h">
        <h3>By {by.label.toLowerCase()}</h3>
        <span className="sum">{lead ? `share of ${lead.column.label}` : "share of the rows"}</span>
      </div>
      <div className="wt">
        <table className="table">
          <thead>
            <tr>
              <th>{by.label}</th>
              <th className="num">Rows</th>
              {totals.map(({ column, fn }) => (
                <th key={column.key} className="num">
                  {fn === "sum" ? column.label : `${column.label}, ${totalCaption(fn).toLowerCase()}`}
                </th>
              ))}
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {measured.map((line) => {
              const share = whole > 0 ? Math.max(0, Math.min(1, line.part / whole)) : 0;
              return (
                <tr key={line.name}>
                  <td className="fill">
                    <span className="cell-lead">{line.name}</span>
                  </td>
                  <td className="num">{line.rows.length.toLocaleString("en-US")}</td>
                  {totals.map(({ column, fn }) => (
                    <td key={column.key} className="num">
                      {formatTotal(line.totals[column.key], column, fn)}
                    </td>
                  ))}
                  <td className="num">{(share * 100).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   The page
   ────────────────────────────────────────────────────────────────────────── */

/** One block. The table is drawn by the caller. */
export function Leaf({
  block,
  meta,
  view,
  params,
  applied,
}: Context & { block: Exclude<LayoutBlock, { type: "table" }>; width?: number }) {
  return <Kit contents>{leaf(block, { meta, view, params, applied })}</Kit>;
}

function leaf(block: Exclude<LayoutBlock, { type: "table" }>, context: Context): ReactNode {
  switch (block.type) {
    case "heading":
      return <h2 className="rp-heading">{block.text}</h2>;
    case "text":
      return <p className="rp-text">{block.text}</p>;
    case "figures":
      return <Figures {...context} />;
    case "chart":
      return <Chart block={block} {...context} />;
    case "breakdown":
      return <Breakdown block={block} {...context} />;
  }
}

/**
 * The page's blocks in order: two half blocks share a row (`.cm-grid2`), the
 * rest take the width, and the worksheet is drawn where the layout puts it.
 */
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
    <>
      {layoutRows(blocks).map((row) =>
        row.length === 2 ? (
          <div key={row[0]!.id} className="cm-grid2 rp-grid2">
            {row.map((block) => (block.type === "table" ? null : <div key={block.id}>{leaf(block, context)}</div>))}
          </div>
        ) : row[0]!.type === "table" ? (
          <div key={row[0]!.id} className="rp-table">
            {table}
          </div>
        ) : (
          <div key={row[0]!.id} className="rp-row">
            {leaf(row[0]! as Exclude<LayoutBlock, { type: "table" }>, context)}
          </div>
        ),
      )}
    </>
  );
}
