"use client";

import type { ExecutiveKpiCard } from "@/lib/api";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownward, ArrowUpward, Minus } from "@/lib/icons";
import { cn } from "@/lib/utils";

type ExecutiveKpiGridProps = {
  items?: ExecutiveKpiCard[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

const compactNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function formatKpiValue(item: ExecutiveKpiCard) {
  if (item.valueLabel) return item.valueLabel;
  const value = compactNumber.format(item.value);
  return item.unit ? `${value} ${item.unit}` : value;
}

function formatDelta(item: ExecutiveKpiCard) {
  if (item.deltaLabel) return item.deltaLabel;
  if (typeof item.delta !== "number" || Number.isNaN(item.delta)) return null;
  const sign = item.delta > 0 ? "+" : "";
  return `${sign}${item.delta.toFixed(1)}%`;
}

export function ExecutiveKpiGrid({
  items,
  isLoading,
  isError,
  errorMessage,
}: ExecutiveKpiGridProps) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight">Key Indicators</h3>
        <p className="text-sm text-muted-foreground">Cross-functional KPI snapshot for the selected filters.</p>
      </div>
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`kpi-skeleton-${index}`} className="rounded-md border border-border/60 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-8 w-28" />
              <Skeleton className="mt-3 h-5 w-20" />
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && isError ? (
        <StatusState
          variant="error"
          title="Key indicators unavailable"
          description={errorMessage || "KPI data could not be retrieved."}
        />
      ) : null}

      {!isLoading && !isError && (!items || items.length === 0) ? (
        <StatusState
          variant="empty"
          title="No key indicators available"
          description="No KPI records were returned for the current selection."
        />
      ) : null}

      {!isLoading && !isError && items && items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const delta = typeof item.delta === "number" ? item.delta : 0;
            const trendPositive = delta > 0;
            const trendNegative = delta < 0;
            const deltaLabel = formatDelta(item);

            return (
              <div key={item.id} className="rounded-md border border-border/60 bg-card/95 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {item.module}
                  </Badge>
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                  {formatKpiValue(item)}
                </p>
                {deltaLabel ? (
                  <Badge
                    variant={trendNegative ? "destructive" : "secondary"}
                    className={cn(
                      "mt-3 inline-flex gap-1 font-mono tabular-nums",
                      trendPositive && "bg-emerald-100 text-emerald-700",
                    )}
                  >
                    {trendPositive ? <ArrowUpward className="h-3.5 w-3.5" /> : null}
                    {trendNegative ? <ArrowDownward className="h-3.5 w-3.5" /> : null}
                    {!trendPositive && !trendNegative ? <Minus className="h-3.5 w-3.5" /> : null}
                    {deltaLabel}
                  </Badge>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
