"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, AlertCircle, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { VarianceReport, RollForwardRow } from "@/lib/gold/reconcile";
import type { ImportDetail } from "../types";

type BacklogResult = { count: number; totalUsd: number };

export function StudioReconciliationPanel({
  importData,
  onClose,
  onFilterByVariance,
}: {
  importData: ImportDetail;
  onClose?: () => void;
  onFilterByVariance?: (scopeId: string) => void;
}) {
  const periodStart = useMemo(() => {
    const dates = importData.entries
      .map((e) => e.parsedDate)
      .filter(Boolean) as string[];
    if (dates.length === 0) return null;
    return dates.reduce((a, b) => (a < b ? a : b));
  }, [importData.entries]);

  const periodEnd = useMemo(() => {
    const dates = importData.entries
      .map((e) => e.parsedDate)
      .filter(Boolean) as string[];
    if (dates.length === 0) return null;
    const max = dates.reduce((a, b) => (a > b ? a : b));
    const d = new Date(max);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [importData.entries]);

  const hasDateRange = !!periodStart && !!periodEnd;

  const varianceParams = useMemo(() => {
    if (!hasDateRange || !importData.siteId) return null;
    return new URLSearchParams({
      importId: importData.id,
      siteId: importData.siteId,
      periodStart: periodStart!,
      periodEnd: periodEnd!,
    }).toString();
  }, [hasDateRange, importData, periodStart, periodEnd]);

  const rollParams = useMemo(() => {
    if (!hasDateRange || !importData.siteId) return null;
    return new URLSearchParams({
      siteId: importData.siteId,
      periodStart: periodStart!,
      periodEnd: periodEnd!,
      groupBy: "leader",
    }).toString();
  }, [hasDateRange, importData.siteId, periodStart, periodEnd]);

  const { data: variance, isLoading: vLoading } = useQuery<VarianceReport[]>({
    queryKey: ["gold-variance", varianceParams],
    queryFn: () => fetchJson(`/api/gold/reports/variance?${varianceParams}`),
    enabled: !!varianceParams,
    staleTime: 30_000,
  });

  const { data: rollForward, isLoading: rfLoading } = useQuery<RollForwardRow[]>({
    queryKey: ["gold-roll-forward", rollParams],
    queryFn: () => fetchJson(`/api/gold/reports/roll-forward?${rollParams}`),
    enabled: !!rollParams,
    staleTime: 30_000,
  });

  const { data: backlog, isLoading: blLoading } = useQuery<BacklogResult>({
    queryKey: ["gold-accounting-backlog"],
    queryFn: () => fetchJson("/api/gold/reports/accounting-backlog"),
    staleTime: 60_000,
  });

  const summaryRow = useMemo(() => {
    if (!variance || variance.length === 0) return null;
    return variance[0];
  }, [variance]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[--border] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
          Reconciliation
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-[--text-muted] hover:text-[--text-strong]"
            aria-label="Close reconciliation panel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {!hasDateRange && (
          <p className="py-4 text-center text-xs text-[--text-muted]">
            No dated entries — cannot compute reconciliation.
          </p>
        )}

        {hasDateRange && (
          <>
            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
                Book vs System
              </h4>
              {vLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : summaryRow ? (
                <VarianceSummaryCard
                  row={summaryRow}
                  onClick={onFilterByVariance ? () => onFilterByVariance(summaryRow.scopeId) : undefined}
                />
              ) : (
                <p className="text-xs text-[--text-muted]">No variance data</p>
              )}
            </section>

            {variance && variance.length > 1 && (
              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
                  Variance by leader
                </h4>
                <div className="space-y-1">
                  {variance.slice(1).map((row) => (
                    <VarianceRowItem
                      key={row.scopeId}
                      row={row}
                      onClick={onFilterByVariance ? () => onFilterByVariance(row.scopeId) : undefined}
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
                Roll-forward ({periodStart} → {periodEnd})
              </h4>
              {rfLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : rollForward && rollForward.length > 0 ? (
                <div className="space-y-1">
                  {rollForward.map((r) => (
                    <RollForwardItem key={r.scopeId} row={r} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[--text-muted]">No roll-forward data</p>
              )}
            </section>
          </>
        )}

        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">
            Accounting backlog
          </h4>
          {blLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : backlog ? (
            <div
              className={cn(
                "flex items-center gap-2 rounded border p-2 text-xs",
                backlog.count > 0
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800",
              )}
            >
              {backlog.count > 0 ? (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              ) : null}
              <span>
                {backlog.count > 0
                  ? `${backlog.count} unposted event${backlog.count !== 1 ? "s" : ""}`
                  : "All events posted"}
              </span>
            </div>
          ) : (
            <p className="text-xs text-[--text-muted]">Could not load backlog</p>
          )}
        </section>
      </div>
    </div>
  );
}

function VarianceSummaryCard({
  row,
  onClick,
}: {
  row: VarianceReport;
  onClick?: () => void;
}) {
  const diff = row.diffGrams;
  const isNeutral = Math.abs(diff) < 0.001;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
      className={cn(
        "rounded border p-3 text-xs",
        isNeutral
          ? "border-emerald-200 bg-emerald-50"
          : diff > 0
            ? "border-amber-200 bg-amber-50"
            : "border-rose-200 bg-rose-50",
        onClick && "cursor-pointer hover:opacity-80",
      )}
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] font-medium uppercase text-[--text-muted]">Book</p>
          <p className="font-mono font-semibold text-[--text-strong]">
            {row.bookGrams.toFixed(2)} g
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase text-[--text-muted]">System</p>
          <p className="font-mono font-semibold text-[--text-strong]">
            {row.systemGrams.toFixed(2)} g
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase text-[--text-muted]">Diff</p>
          <p
            className={cn(
              "font-mono font-semibold",
              isNeutral
                ? "text-emerald-700"
                : diff > 0
                  ? "text-amber-700"
                  : "text-rose-700",
            )}
          >
            {diff >= 0 ? "+" : ""}
            {diff.toFixed(2)} g
          </p>
        </div>
      </div>
      {onClick && (
        <p className="mt-1.5 text-center text-[10px] text-[--text-muted]">
          Click to filter table to affected rows
        </p>
      )}
    </div>
  );
}

function VarianceRowItem({
  row,
  onClick,
}: {
  row: VarianceReport;
  onClick?: () => void;
}) {
  const diff = row.diffGrams;
  const isPositive = diff > 0.001;
  const isNegative = diff < -0.001;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded border border-[--border] bg-[--surface-base] px-2 py-1.5 text-[11px] hover:bg-[--surface-muted]"
    >
      <span className="min-w-0 flex-1 truncate text-left text-[--text-body]">
        {row.scopeId}
      </span>
      <span className="font-mono text-[--text-muted]">
        {row.bookGrams.toFixed(1)} g
      </span>
      <span
        className={cn(
          "flex items-center gap-0.5 font-mono font-medium",
          isPositive ? "text-amber-700" : isNegative ? "text-rose-700" : "text-emerald-700",
        )}
      >
        {isPositive ? (
          <TrendingUp className="h-3 w-3" />
        ) : isNegative ? (
          <TrendingDown className="h-3 w-3" />
        ) : null}
        {diff >= 0 ? "+" : ""}
        {diff.toFixed(2)}
      </span>
    </button>
  );
}

function RollForwardItem({ row }: { row: RollForwardRow }) {
  return (
    <div className="rounded border border-[--border] bg-[--surface-base] px-2 py-1.5 text-[11px]">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-[--text-strong] truncate">{row.scopeName}</span>
        <span className="ml-2 shrink-0 font-mono text-[--text-muted]">
          {row.closingGrams.toFixed(2)} g
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] text-[--text-muted]">
        <span>{row.openingGrams.toFixed(1)}</span>
        <span className="text-emerald-600">+{row.inGrams.toFixed(1)}</span>
        <span className="text-rose-600">-{row.outGrams.toFixed(1)}</span>
        <span className="text-[--text-strong]">= {row.closingGrams.toFixed(1)}</span>
      </div>
    </div>
  );
}
