"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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
    .map((item) => ({ ...item, value: Number.isFinite(item.value) ? Math.max(0, item.value) : 0 }))
    .filter((item) => item.value > 0);
  const total = cleaned.reduce((sum, item) => sum + item.value, 0);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-card via-card to-muted/25 shadow-sm",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(47,92,243,0.16),transparent_58%)]" />
      <div className="relative">
        <div className="border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {cleaned.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center px-4 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div
            className={cn(
              "grid h-[360px] grid-cols-1 gap-2 px-2 py-2 sm:h-[320px] sm:grid-cols-[minmax(0,1fr)_180px]",
              chartClassName,
            )}
          >
            <div className="relative min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cleaned}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={108}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {cleaned.map((item) => (
                      <Cell key={item.label} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => valueFormatter(Number(value))}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background) / 0.95)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-full border border-border/70 bg-background/90 px-4 py-2 text-center shadow-sm">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
                  <div className="font-mono text-sm font-semibold">{valueFormatter(total)}</div>
                </div>
              </div>
            </div>
            <div className="space-y-2 overflow-auto pr-1">
              {cleaned.map((item) => {
                const ratio = total <= 0 ? 0 : (item.value / total) * 100;
                return (
                  <div key={item.label} className="rounded-md border border-border/60 bg-background/50 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-medium">
                        <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{ratio.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1 font-mono text-xs">{valueFormatter(item.value)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
