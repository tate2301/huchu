"use client";

import { NumberChart } from "@rtcamp/frappe-ui-react";
import type { ExecutiveKpiCard } from "@/lib/api";
import { StatusState } from "@/components/shared/status-state";
import { Skeleton } from "@/components/ui/skeleton";
import { buildNumberMetricConfig } from "@/lib/charts/frappe-config-builders";

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
            const delta = typeof item.delta === "number" ? item.delta : 0;
            const deltaLabel = formatDelta(item);
            const valueLabel = formatKpiValue(item);
            const numberConfig = buildNumberMetricConfig({
              title: item.label,
              value: item.value,
              delta: typeof item.delta === "number" ? item.delta : undefined,
            });
            const deltaClassName =
              delta > 0
                ? "text-ink-green-2"
                : delta < 0
                  ? "text-ink-red-3"
                  : "text-ink-gray-6";
            const deltaArrow = delta > 0 ? "\u2191" : delta < 0 ? "\u2193" : "\u2192";

            return (
              <div
                key={item.id}
                className="rounded-md border border-border/60 bg-card/70"
              >
                <NumberChart
                  config={numberConfig}
                  title={
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink-gray-5">
                        {item.label}
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {formatModuleLabel(item.module)}
                      </span>
                    </div>
                  }
                  subtitle={() => (
                    <div className="flex-1 flex-shrink-0 truncate font-mono text-[24px] font-semibold leading-10 text-ink-gray-6">
                      {valueLabel}
                    </div>
                  )}
                  delta={() =>
                    deltaLabel ? (
                      <div className={`flex items-center gap-1 text-xs font-medium ${deltaClassName}`}>
                        <span>{deltaArrow}</span>
                        <span className="font-mono tabular-nums">{deltaLabel}</span>
                      </div>
                    ) : null
                  }
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
