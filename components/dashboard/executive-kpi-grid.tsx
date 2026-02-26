"use client";

import type { ExecutiveKpiCard } from "@/lib/api";
import { FrappeStatCard } from "@/components/charts/frappe-stat-card";
import { StatusState } from "@/components/shared/status-state";
import { Skeleton } from "@/components/ui/skeleton";

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

function formatModuleLabel(module: ExecutiveKpiCard["module"]) {
  return module
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
        <h3 className="text-lg font-semibold tracking-tight">
          Position Indicators
        </h3>
      </div>
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`kpi-skeleton-${index}`}
              className="rounded-md border border-border/60 p-4"
            >
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
            const deltaLabel = formatDelta(item);
            const valueLabel = formatKpiValue(item);

            return (
              <FrappeStatCard
                key={item.id}
                label={item.label}
                value={item.value}
                valueLabel={valueLabel}
                detail={deltaLabel ? `Trend ${deltaLabel}` : undefined}
                delta={typeof item.delta === "number" ? item.delta : undefined}
                titleAdornment={
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {formatModuleLabel(item.module)}
                  </span>
                }
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
