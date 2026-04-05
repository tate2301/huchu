"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AdminTrendChart } from "@/components/charts/admin-headless-charts";
import { cn } from "@/lib/utils";

type ProjectionPoint = {
  id: string;
  label: string;
  monthStart: string;
  committedAmount: number;
  atRiskAmount: number;
  workspaceCount: number;
};

type FinancialProjectionsCardProps = {
  projections: ProjectionPoint[];
  currency?: string;
};

type RangeKey = "3m" | "6m" | "12m" | "all";

const RANGE_OPTIONS: Array<{
  key: RangeKey;
  label: string;
  months: number | null;
}> = [
  { key: "3m", label: "3M", months: 3 },
  { key: "6m", label: "6M", months: 6 },
  { key: "12m", label: "12M", months: 12 },
  { key: "all", label: "All", months: null },
];

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function safeDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function FinancialProjectionsCard({
  projections,
  currency = "USD",
}: FinancialProjectionsCardProps) {
  const [activeRange, setActiveRange] = useState<RangeKey>("12m");

  const normalizedPoints = useMemo(
    () =>
      projections.map((point) => ({
        ...point,
        projectedAmount: Math.max(point.committedAmount - point.atRiskAmount, 0),
      })),
    [projections],
  );

  const visiblePoints = useMemo(() => {
    const selected =
      RANGE_OPTIONS.find((option) => option.key === activeRange) ??
      RANGE_OPTIONS[2];
    if (!selected.months) return normalizedPoints;
    return normalizedPoints.slice(-selected.months);
  }, [activeRange, normalizedPoints]);

  const summary = useMemo(() => {
    const target = visiblePoints.length > 0 ? visiblePoints : normalizedPoints;
    const sampleSize = Math.max(target.length, 1);
    const committedAverage =
      target.reduce((sum, point) => sum + point.committedAmount, 0) / sampleSize;
    const atRiskAverage =
      target.reduce((sum, point) => sum + point.atRiskAmount, 0) / sampleSize;
    const netProjection = target[target.length - 1]?.projectedAmount ?? 0;
    const startProjection = target[0]?.projectedAmount ?? 0;
    const trendValue =
      startProjection > 0
        ? ((netProjection - startProjection) / startProjection) * 100
        : 0;
    const asOfDate = target[target.length - 1]?.monthStart ?? null;

    return {
      committedAverage,
      atRiskAverage,
      netProjection,
      trendValue,
      asOfDate,
    };
  }, [normalizedPoints, visiblePoints]);

  const asOfLabel = useMemo(() => {
    if (!summary.asOfDate) return "--/--/----";
    const parsed = safeDate(summary.asOfDate);
    if (!parsed) return "--/--/----";
    return format(parsed, "dd/MM/yyyy");
  }, [summary.asOfDate]);

  return (
    <div className="overflow-hidden rounded-[14px] border border-[var(--edge-default)] bg-[var(--surface-base)] shadow-[var(--card-shadow-rest)]">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[var(--primary-700)] text-[11px] font-semibold tracking-[0.14em] text-[var(--text-inverse)]">
            FIN
          </div>
          <div className="space-y-0.5">
            <p className="text-[24px] font-semibold leading-tight tracking-[-0.01em] text-[var(--text-strong)]">
              Financial projections
            </p>
            <p className="text-[12px] text-[var(--text-muted)]">
              Expected recurring revenue net of current risk exposure.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center rounded-full border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Live
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-y border-[var(--edge-subtle)] px-5 py-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Committed Avg
          </p>
          <p className="mt-1 font-mono text-[20px] font-semibold text-[var(--primary-700)]">
            {formatCurrency(summary.committedAverage, currency)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Recurring baseline</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            At-Risk Avg
          </p>
          <p className="mt-1 font-mono text-[20px] font-semibold text-[var(--warning-700)]">
            {formatCurrency(summary.atRiskAverage, currency)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Potential volatility</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Net Projection
          </p>
          <p className="mt-1 font-mono text-[20px] font-semibold text-[var(--text-strong)]">
            {formatCurrency(summary.netProjection, currency)}
          </p>
          <p
            className={cn(
              "mt-1 text-[11px]",
              summary.trendValue < 0
                ? "text-[var(--danger-700)]"
                : "text-[var(--success-700)]",
            )}
          >
            {summary.trendValue >= 0 ? "+" : ""}
            {summary.trendValue.toFixed(1)}% trend
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <p className="font-mono text-[12px] text-[var(--text-muted)]">
          As of {asOfLabel}
          <span className="ml-3 text-[var(--text-strong)]">
            Net: {formatCompactCurrency(summary.netProjection, currency)}
          </span>
        </p>
        <div className="inline-flex items-center rounded-[10px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-1">
          {RANGE_OPTIONS.map((option) => {
            const isActive = option.key === activeRange;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setActiveRange(option.key)}
                className={cn(
                  "rounded-[8px] px-2.5 py-1 text-[11px] font-medium transition-colors",
                  isActive
                    ? "bg-[var(--surface-base)] text-[var(--primary-700)] shadow-[var(--button-shadow-rest)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-strong)]",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-[210px] border-t border-[var(--edge-subtle)] px-2 py-3 sm:px-4">
        {visiblePoints.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            No projection data available.
          </div>
        ) : (
          <AdminTrendChart
            rows={visiblePoints.map((point) => ({
              label: (() => {
                const parsed = safeDate(point.monthStart);
                return parsed ? format(parsed, "MMM").toUpperCase() : "--";
              })(),
              tooltipLabel: (() => {
                const parsed = safeDate(point.monthStart);
                return parsed ? format(parsed, "MMMM yyyy") : "Projection";
              })(),
              projectedAmount: point.projectedAmount,
              committedAmount: point.committedAmount,
              atRiskAmount: point.atRiskAmount,
            }))}
            series={[
              {
                key: "projectedAmount",
                label: "Net projection",
                color: "var(--primary-600)",
              },
              {
                key: "atRiskAmount",
                label: "At risk",
                color: "var(--warning-500)",
                dashed: true,
              },
            ]}
            comparisonSeries={[
              {
                key: "committedAmount",
                label: "Committed",
                kind: "line",
                color: "var(--accent-500)",
              },
            ]}
            target={{
              value: summary.committedAverage,
              label: "Avg target",
              color: "var(--accent-500)",
            }}
            annotations={
              visiblePoints.length > 0
                ? [
                    {
                      label: "Latest",
                      rowLabel: (() => {
                        const parsed = safeDate(
                          visiblePoints[visiblePoints.length - 1]?.monthStart ?? "",
                        );
                        return parsed ? format(parsed, "MMM").toUpperCase() : "--";
                      })(),
                      seriesKey: "projectedAmount",
                      color: "var(--primary-600)",
                    },
                  ]
                : []
            }
            height={194}
            valueFormatter={(value) => formatCurrency(value, currency)}
            yTickFormatter={(value) => formatCompactCurrency(value, currency)}
            xTickInterval={0}
          />
        )}
      </div>
    </div>
  );
}
