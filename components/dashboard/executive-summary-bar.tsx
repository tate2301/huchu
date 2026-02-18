"use client";

import type { ExecutiveModuleStatus, ExecutiveModuleSummary } from "@/lib/api";
import { AlertTriangle, CheckCircle2, Minus, ReportProblem } from "@/lib/icons";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ExecutiveSummaryBarProps = {
  items?: ExecutiveModuleSummary[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

const MODULE_LABELS: Record<ExecutiveModuleSummary["module"], string> = {
  finance: "Finance",
  gold: "Gold",
  workforce: "Workforce",
  operations: "Operations",
  stores: "Stores",
  maintenance: "Maintenance",
  compliance: "Compliance",
  security: "Security",
  reports: "Reports",
};

const STATUS_META: Record<
  ExecutiveModuleStatus,
  {
    label: string;
    className: string;
    icon: typeof CheckCircle2;
  }
> = {
  healthy: {
    label: "Healthy",
    className: "bg-emerald-100 text-emerald-700",
    icon: CheckCircle2,
  },
  watch: {
    label: "Watch",
    className: "bg-amber-100 text-amber-700",
    icon: ReportProblem,
  },
  critical: {
    label: "Critical",
    className: "bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
};

function SummaryStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ExecutiveSummaryBar({
  items,
  isLoading,
  isError,
  errorMessage,
}: ExecutiveSummaryBarProps) {
  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/60 pb-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`executive-summary-stat-skeleton-${index}`} className="rounded-md bg-muted/40 p-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-6 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <StatusState
        variant="error"
        title="Executive summary unavailable"
        description={errorMessage || "Summary metrics could not be retrieved."}
      />
    );
  }

  if (!items || items.length === 0) {
    return (
      <StatusState
        variant="empty"
        title="Executive summary unavailable"
        description="No module summaries are available for the selected scope."
      />
    );
  }

  const totalModules = items.length;
  const criticalCount = items.filter((item) => item.status === "critical").length;
  const watchCount = items.filter((item) => item.status === "watch").length;
  const healthyCount = items.filter((item) => item.status === "healthy").length;
  const totalExceptions = items.reduce((sum, item) => sum + item.openExceptions, 0);
  const highestPressureModule = [...items].sort((a, b) => b.openExceptions - a.openExceptions)[0];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[1.35rem]">Executive Summary</CardTitle>
            <CardDescription>Cross-module status, exception exposure, and escalation priority.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(STATUS_META) as ExecutiveModuleStatus[]).map((status) => {
              const Icon = STATUS_META[status].icon;
              const count =
                status === "critical"
                  ? criticalCount
                  : status === "watch"
                    ? watchCount
                    : healthyCount;
              return (
                <Badge
                  key={status}
                  variant="secondary"
                  className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs", STATUS_META[status].className)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {STATUS_META[status].label}: {count}
                </Badge>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStatCard label="Modules Monitored" value={String(totalModules)} />
          <SummaryStatCard label="Open Exceptions" value={String(totalExceptions)} />
          <SummaryStatCard label="Critical Modules" value={String(criticalCount)} />
          <SummaryStatCard label="Watch Modules" value={String(watchCount)} />
        </div>
        <div className="rounded-md bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            Highest pressure: {MODULE_LABELS[highestPressureModule.module]}
          </span>
          <span className="mx-2">|</span>
          <span className="font-mono tabular-nums">{highestPressureModule.openExceptions}</span> open exceptions
          {highestPressureModule.topExceptionLabel ? (
            <>
              <span className="mx-2">|</span>
              {highestPressureModule.topExceptionLabel}
            </>
          ) : (
            <>
              <span className="mx-2">|</span>
              <span className="inline-flex items-center gap-1">
                <Minus className="h-3 w-3" />
                No dominant exception label
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

