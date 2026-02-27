"use client";

import { useId } from "react";
import { format } from "date-fns";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

export function TradingViewChartCard({
  title,
  subtitle,
  data,
  xKey,
  xAxisType = "category",
  series,
  valueFormatter = defaultValueFormatter,
  emptyMessage = "No data available for this chart.",
  className,
  chartClassName,
}: TradingViewChartCardProps) {
  const hasRightAxis = series.some((item) => item.yAxisId === "right");
  const gradientKey = useId().replace(/:/g, "");

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
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {series.map((item) => (
              <span
                key={`pill-${item.key}`}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
        <div className={cn("relative h-[320px] w-full px-2 pb-2 pt-1", chartClassName)}>
          <div className="pointer-events-none absolute inset-x-2 top-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
          {data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 12, right: 12, left: 6, bottom: 8 }}>
                <defs>
                  {series
                    .filter((item) => item.type === "area")
                    .map((item) => (
                      <linearGradient key={item.key} id={`${gradientKey}-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={item.color} stopOpacity={0.45} />
                        <stop offset="95%" stopColor={item.color} stopOpacity={0.03} />
                      </linearGradient>
                    ))}
                </defs>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 6" vertical={false} />
                <XAxis
                  dataKey={xKey}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                  tick={{ fill: "var(--chart-text)", fontSize: 11 }}
                  tickFormatter={(value) => {
                    if (xAxisType !== "time") return String(value);
                    const parsed = new Date(String(value));
                    if (Number.isNaN(parsed.getTime())) return String(value);
                    return format(parsed, "MMM d");
                  }}
                />
                <YAxis
                  yAxisId="left"
                  axisLine={false}
                  tickLine={false}
                  width={72}
                  tick={{ fill: "var(--chart-text)", fontSize: 11 }}
                  tickFormatter={(value) => valueFormatter(Number(value))}
                />
                {hasRightAxis ? (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    width={72}
                    tick={{ fill: "var(--chart-text)", fontSize: 11 }}
                    tickFormatter={(value) => valueFormatter(Number(value))}
                  />
                ) : null}
                <Tooltip
                  cursor={{ stroke: "var(--chart-text)", strokeDasharray: "4 6" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    return (
                      <div className="rounded-lg border border-border bg-surface-base px-3 py-2.5 shadow-[var(--shadow-popover)]">
                        <div className="mb-1 text-xs font-medium text-muted-foreground">{String(label)}</div>
                        <div className="space-y-1">
                          {payload.map((entry) => {
                            const numericValue = Number(entry.value ?? 0);
                            return (
                              <div key={`${entry.name}-${entry.dataKey}`} className="flex items-center justify-between gap-3 text-xs">
                                <span className="font-medium" style={{ color: entry.color }}>
                                  {entry.name}
                                </span>
                                <span className="font-mono text-foreground">{valueFormatter(numericValue)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {series.map((item) => {
                  const common = {
                    dataKey: item.key,
                    name: item.label,
                    yAxisId: item.yAxisId ?? "left",
                    stroke: item.color,
                    fill: item.color,
                  };

                  if (item.type === "bar") {
                    return <Bar key={item.key} {...common} barSize={18} radius={[4, 4, 0, 0]} fillOpacity={0.8} />;
                  }

                  if (item.type === "area") {
                    return (
                      <Area
                        key={item.key}
                        {...common}
                        type="monotone"
                        dot={false}
                        strokeWidth={item.strokeWidth ?? 2}
                        fill={`url(#${gradientKey}-${item.key})`}
                        fillOpacity={1}
                      />
                    );
                  }

                  return (
                    <Line
                      key={item.key}
                      {...common}
                      type="monotone"
                      dot={false}
                      strokeWidth={item.strokeWidth ?? 2}
                      strokeDasharray={item.dashed ? "5 5" : undefined}
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
