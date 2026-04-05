"use client";

import { AdminDonutChart } from "@/components/charts/admin-headless-charts";
import { cn } from "@/lib/utils";

type DonutDatum = {
  label: string;
  value: number;
  color: string;
};

type InsightDonutCardProps = {
  title: string;
  subtitle?: string;
  data: DonutDatum[];
  valueFormatter?: (value: number) => string;
  className?: string;
  chartClassName?: string;
  emptyMessage?: string;
};

function defaultValueFormatter(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function InsightDonutCard({
  title,
  subtitle,
  data,
  valueFormatter = defaultValueFormatter,
  className,
  chartClassName,
  emptyMessage = "No composition data available.",
}: InsightDonutCardProps) {
  const cleaned = data
    .map((item) => ({
      ...item,
      value: Number.isFinite(item.value) ? Math.max(0, item.value) : 0,
    }))
    .filter((item) => item.value > 0);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-card via-card to-muted/25 shadow-sm",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(76,100,212,0.16),transparent_58%)]" />
      <div className="relative">
        <div className="border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className={cn("px-2 py-2", chartClassName)}>
          <AdminDonutChart
            rows={cleaned.map((item, index) => ({
              id: `${item.label}-${index}`,
              label: item.label,
              value: item.value,
              color: item.color,
            }))}
            height={320}
            valueLabel="Total"
            valueFormatter={valueFormatter}
            emptyLabel={emptyMessage}
          />
        </div>
      </div>
    </div>
  );
}
