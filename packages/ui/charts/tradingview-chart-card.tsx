"use client";

import type { ReactNode } from "react";
import { format } from "date-fns";
import {
  type AdminChartAnnotation,
  type AdminChartSeries,
  type AdminChartTarget,
  AdminTrendChart,
} from "./admin-headless-charts";
import { cn } from "../lib/utils";

type ChartDatum = Record<string, string | number | null | undefined>;

export type TradingViewSeries = {
  key: string;
  label: string;
  type: "bar" | "line" | "area";
  color: string;
  yAxisId?: "left" | "right";
  dashed?: boolean;
  strokeWidth?: number;
};

type TradingViewChartCardProps = {
  title: string;
  subtitle?: string;
  /** Right-aligned qualifier in the panel head — "last six months". */
  note?: ReactNode;
  /**
   * Panel chrome instead of card chrome.
   *
   * The default here is a gradient-filled, glow-lit, 12px-cornered card that
   * predates the accounting canvas. Next to the flat 10px panels the rest of
   * a report is built from, it reads as a widget borrowed from another
   * product — and the radial highlight sits directly behind the plot, tinting
   * the one thing on the page that has to be read accurately.
   *
   * `flat` matches `ReportPanel` exactly, so a chart can sit in a row of
   * panels and be the same object as its neighbours. Kept opt-in because the
   * schools reporting page still wants the original.
   */
  flat?: boolean;
  /** Plot height. The canvas draws these short — 120 in a three-across row. */
  height?: number;
  data: ChartDatum[];
  xKey: string;
  xAxisType?: "category" | "time";
  series: TradingViewSeries[];
  comparisonSeries?: TradingViewSeries[];
  target?: AdminChartTarget;
  annotations?: AdminChartAnnotation[];
  valueFormatter?: (value: number) => string;
  emptyMessage?: string;
  className?: string;
  chartClassName?: string;
};

function defaultValueFormatter(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatAxisLabel(value: string, xAxisType: "category" | "time") {
  if (xAxisType !== "time") return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "MMM d");
}

function formatTooltipLabel(value: string, xAxisType: "category" | "time") {
  if (xAxisType !== "time") return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, "MMM d, yyyy");
}

function toAdminSeries(items: TradingViewSeries[]): AdminChartSeries[] {
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    kind: item.type,
    color: item.color,
    axis: item.yAxisId,
    dashed: item.dashed,
    strokeWidth: item.strokeWidth,
  }));
}

export function TradingViewChartCard({
  title,
  subtitle: _subtitle,
  note,
  flat = false,
  height = 320,
  data,
  xKey,
  xAxisType = "category",
  series,
  comparisonSeries = [],
  target,
  annotations = [],
  valueFormatter = defaultValueFormatter,
  emptyMessage = "No data available for this chart.",
  className,
  chartClassName,
}: TradingViewChartCardProps) {
  const chartRows = data.map((point) => {
    const rawLabel = String(point[xKey] ?? "");
    return {
      ...point,
      label: rawLabel,
      tooltipLabel: formatTooltipLabel(rawLabel, xAxisType),
    };
  });

  const chart = (
    <AdminTrendChart
      rows={chartRows}
      series={toAdminSeries(series)}
      comparisonSeries={toAdminSeries(comparisonSeries)}
      target={target}
      annotations={annotations}
      height={height}
      valueFormatter={valueFormatter}
      yTickFormatter={valueFormatter}
      xTickFormatter={(value) => formatAxisLabel(value, xAxisType)}
      xTickInterval="preserveStartEnd"
      emptyLabel={emptyMessage}
    />
  );

  if (flat) {
    return (
      <section
        className={cn(
          "overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]",
          className,
        )}
      >
        <header className="flex h-9 items-center gap-2 border-b border-[var(--border-subtle)] px-[13px]">
          <h3 className="truncate text-sm font-bold text-[var(--text-strong)]">{title}</h3>
          {note ? (
            <span className="ml-auto shrink-0 truncate text-sm text-[var(--text-subtle)]">
              {note}
            </span>
          ) : null}
        </header>
        <div className={cn("w-full px-2 pb-2 pt-2", chartClassName)}>{chart}</div>
      </section>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-card via-card to-muted/30 shadow-sm",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(76,100,212,0.12),transparent_55%)]" />
      <div className="relative">
        <div className="border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        </div>
        <div className={cn("relative w-full px-2 pb-2 pt-1", chartClassName)}>
          <div className="pointer-events-none absolute inset-x-2 top-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          {chart}
        </div>
      </div>
    </div>
  );
}
