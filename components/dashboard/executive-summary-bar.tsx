"use client";

import type { ExecutiveModuleStatus, ExecutiveModuleSummary } from "@/lib/api";
import { FrappeStatCard } from "@/components/charts/frappe-stat-card";
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
  headerControls?: React.ReactNode;
  headerMeta?: React.ReactNode;
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
    variant: "success" | "warning" | "danger";
    icon: typeof CheckCircle2;
  }
> = {
  healthy: {
    label: "Healthy",
    variant: "success",
    icon: CheckCircle2,
  },
  watch: {
    label: "Watch",
    variant: "warning",
    icon: ReportProblem,
  },
  critical: {
    label: "Critical",
    variant: "danger",
    icon: AlertTriangle,
  },
};

function SummaryStatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: string;
}) {
  return <FrappeStatCard label={label} value={value} valueLabel={value.toLocaleString()} detail={detail} />;
}

export function ExecutiveSummaryBar({
  items,
  isLoading,
  isError,
  errorMessage,
  headerControls,
  headerMeta,
}: ExecutiveSummaryBarProps) {
  const safeItems = items ?? [];
  const hasItems = safeItems.length > 0;
  const totalModules = hasItems ? safeItems.length : 0;
  const criticalCount = hasItems ? safeItems.filter((item) => item.status === "critical").length : 0;
  const watchCount = hasItems ? safeItems.filter((item) => item.status === "watch").length : 0;
  const healthyCount = hasItems ? safeItems.filter((item) => item.status === "healthy").length : 0;
  const totalExceptions = hasItems ? safeItems.reduce((sum, item) => sum + item.openExceptions, 0) : 0;
  const highestPressureModule = hasItems
    ? [...safeItems].sort((a, b) => b.openExceptions - a.openExceptions)[0]
    : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[1.35rem]">Executive Summary</CardTitle>
            <CardDescription>Cross-module status, exception exposure, and escalation priority.</CardDescription>
          </div>
          {headerControls ? (
            <div className="w-full lg:w-auto">{headerControls}</div>
          ) : hasItems ? (
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
                    variant={STATUS_META[status].variant}
                    className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs")}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {STATUS_META[status].label}: {count}
                  </Badge>
                );
              })}
            </div>
          ) : null}
        </div>
        {headerMeta ? <div className="pt-2">{headerMeta}</div> : null}
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`executive-summary-stat-skeleton-${index}`} className="rounded-md bg-muted/40 p-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-6 w-20" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <StatusState
            variant="error"
            title="Executive summary unavailable"
            description={errorMessage || "Summary metrics could not be retrieved."}
          />
        ) : !hasItems ? (
          <StatusState
            variant="empty"
            title="Executive summary unavailable"
            description="No module summaries are available for the selected scope."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryStatCard label="Modules Monitored" value={totalModules} />
              <SummaryStatCard label="Open Exceptions" value={totalExceptions} />
              <SummaryStatCard label="Critical Modules" value={criticalCount} />
              <SummaryStatCard label="Watch Modules" value={watchCount} />
            </div>
            {highestPressureModule ? (
              <div className="surface-framed rounded-md bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
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
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

