"use client";

import Link from "next/link";

import type { ExecutiveModuleSummary } from "@/lib/api";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Minus,
  ReportProblem,
  TrendingDown,
  TrendingUp,
} from "@/lib/icons";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ExecutiveCriticalStripProps = {
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

function formatTrendDelta(delta?: number) {
  if (typeof delta !== "number" || Number.isNaN(delta)) return null;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const sign = delta > 0 ? "+" : "";
  return {
    direction,
    label: `${sign}${delta.toFixed(1)}%`,
  };
}

function getStatusBadgeClass(status: ExecutiveModuleSummary["status"]) {
  if (status === "critical") return "bg-destructive/10 text-destructive";
  if (status === "watch") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function getStatusLabel(status: ExecutiveModuleSummary["status"]) {
  if (status === "critical") return "Critical";
  if (status === "watch") return "Watch";
  return "Healthy";
}

export function ExecutiveCriticalStrip({
  items,
  isLoading,
  isError,
  errorMessage,
}: ExecutiveCriticalStripProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`executive-critical-strip-skeleton-${index}`} className="rounded-md border border-border/60 p-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-2 h-3 w-full" />
                <Skeleton className="mt-3 h-5 w-20" />
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
        title="Escalation strip unavailable"
        description={errorMessage || "Priority module alerts could not be retrieved."}
      />
    );
  }

  if (!items || items.length === 0) {
    return (
      <StatusState
        variant="empty"
        title="No escalation data"
        description="Module health data is not available for this filter."
      />
    );
  }

  const urgentModules = [...items]
    .filter((item) => item.status !== "healthy")
    .sort((a, b) => {
      if (a.status === "critical" && b.status !== "critical") return -1;
      if (a.status !== "critical" && b.status === "critical") return 1;
      return b.openExceptions - a.openExceptions;
    });

  if (urgentModules.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Immediate Escalations</CardTitle>
          <CardDescription>No modules are currently in watch or critical state.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Portfolio remains within healthy thresholds.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Immediate Escalations</CardTitle>
        <CardDescription>Modules in watch or critical state, ranked by open exceptions.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {urgentModules.map((moduleSummary) => {
            const trend = formatTrendDelta(moduleSummary.trendDelta);
            const trendClass =
              trend?.direction === "up"
                ? "text-amber-700"
                : trend?.direction === "down"
                  ? "text-sky-700"
                  : "text-muted-foreground";

            return (
              <div key={moduleSummary.module} className="rounded-md border border-border/60 bg-background/75 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{MODULE_LABELS[moduleSummary.module]}</p>
                  <Badge variant="secondary" className={cn("text-[11px] uppercase", getStatusBadgeClass(moduleSummary.status))}>
                    {getStatusLabel(moduleSummary.status)}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {moduleSummary.topExceptionLabel || "No top exception label available."}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-sm bg-muted/60 px-2 py-1 font-mono tabular-nums">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {moduleSummary.openExceptions} open
                  </span>
                  <span className={cn("inline-flex items-center gap-1.5 font-mono tabular-nums", trendClass)}>
                    {trend?.direction === "up" ? <TrendingUp className="h-3.5 w-3.5" /> : null}
                    {trend?.direction === "down" ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                    {trend?.direction === "flat" ? <Minus className="h-3.5 w-3.5" /> : null}
                    {trend ? trend.label : "No trend"}
                  </span>
                </div>

                <Link
                  href={moduleSummary.reportHref}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                >
                  Open report
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

