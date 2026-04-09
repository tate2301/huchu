"use client";

import { format } from "date-fns";
import {
  type AdminChartAnnotation,
  type AdminChartSeries,
  type AdminChartTarget,
  AdminTrendChart,
} from "@/components/charts/admin-headless-charts";
import { cn } from "@/lib/utils";

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
          <AdminTrendChart
            rows={chartRows}
            series={toAdminSeries(series)}
            comparisonSeries={toAdminSeries(comparisonSeries)}
            target={target}
            annotations={annotations}
            height={320}
            valueFormatter={valueFormatter}
            yTickFormatter={valueFormatter}
            xTickFormatter={(value) => formatAxisLabel(value, xAxisType)}
            xTickInterval="preserveStartEnd"
            emptyLabel={emptyMessage}
          />
        </div>
      </div>
    </div>
  );
}
