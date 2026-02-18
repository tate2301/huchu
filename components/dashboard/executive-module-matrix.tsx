"use client";

import Link from "next/link";

import type { ExecutiveModuleSummary, ExecutiveSummaryMetric } from "@/lib/api";
import {
  ArrowRight,
  BarChart3,
  Coins,
  FileCheck,
  ManageAccounts,
  Minus,
  PackageCheck,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Video,
  Wallet,
  Wrench,
} from "@/lib/icons";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ExecutiveModuleMatrixProps = {
  items?: ExecutiveModuleSummary[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

const EXECUTIVE_MODULE_ORDER: ExecutiveModuleSummary["module"][] = [
  "finance",
  "gold",
  "workforce",
  "operations",
  "stores",
  "maintenance",
  "compliance",
  "security",
  "reports",
];

const MODULE_META: Record<
  ExecutiveModuleSummary["module"],
  {
    label: string;
    icon: typeof Wallet;
  }
> = {
  finance: { label: "Finance", icon: Wallet },
  gold: { label: "Gold", icon: Coins },
  workforce: { label: "Workforce", icon: ManageAccounts },
  operations: { label: "Operations", icon: BarChart3 },
  stores: { label: "Stores", icon: PackageCheck },
  maintenance: { label: "Maintenance", icon: Wrench },
  compliance: { label: "Compliance", icon: ShieldCheck },
  security: { label: "Security", icon: Video },
  reports: { label: "Reports", icon: FileCheck },
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function formatMetric(metric: ExecutiveSummaryMetric) {
  if (metric.valueLabel) return metric.valueLabel;
  const value = numberFormatter.format(metric.value);
  if (metric.unit === "USD") return `USD ${value}`;
  return metric.unit ? `${value} ${metric.unit}` : value;
}

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

function getStatusSurfaceClass(status: ExecutiveModuleSummary["status"]) {
  if (status === "critical") return "border border-destructive/30 bg-destructive/[0.02]";
  if (status === "watch") return "border border-amber-300/60 bg-amber-50/30";
  return "border border-emerald-300/50 bg-emerald-50/25";
}

function getStatusLabel(status: ExecutiveModuleSummary["status"]) {
  if (status === "critical") return "Critical";
  if (status === "watch") return "Watch";
  return "Healthy";
}

function SecondaryMetricLine({ metric }: { metric: ExecutiveSummaryMetric }) {
  return (
    <div className="grid gap-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{metric.label}</p>
      <p className="text-xs font-medium text-foreground">{formatMetric(metric)}</p>
    </div>
  );
}

export function ExecutiveModuleMatrix({
  items,
  isLoading,
  isError,
  errorMessage,
}: ExecutiveModuleMatrixProps) {
  if (isLoading) {
    return (
      <section className="space-y-3">
        <div className="space-y-1">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={`executive-module-matrix-skeleton-${index}`} className="rounded-md border border-border/60 p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-32" />
              <Skeleton className="mt-3 h-12 w-full" />
              <Skeleton className="mt-3 h-4 w-28" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <StatusState
        variant="error"
        title="Module matrix unavailable"
        description={errorMessage || "Module summary cards could not be retrieved."}
      />
    );
  }

  if (!items || items.length === 0) {
    return (
      <StatusState
        variant="empty"
        title="No module summaries"
        description="No module health metrics are available for the selected scope."
      />
    );
  }

  const moduleMap = new Map(items.map((item) => [item.module, item] as const));

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight">Module Matrix</h3>
        <p className="text-sm text-muted-foreground">
          Finance-first module cards with status, metrics, exceptions, trend, and report links.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {EXECUTIVE_MODULE_ORDER.map((moduleKey) => {
          const summary = moduleMap.get(moduleKey);
          const meta = MODULE_META[moduleKey];
          const Icon = meta.icon;

          if (!summary) {
            return (
              <Card key={moduleKey} className="border border-dashed border-border/70 bg-muted/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">No summary data is available for this module.</p>
                </CardContent>
              </Card>
            );
          }

          const trend = formatTrendDelta(summary.trendDelta);
          const trendClass =
            trend?.direction === "up"
              ? "text-amber-700"
              : trend?.direction === "down"
                ? "text-sky-700"
                : "text-muted-foreground";

          return (
            <Card key={moduleKey} className={cn("pb-3", getStatusSurfaceClass(summary.status))}>
              <CardHeader className="space-y-3 border-b border-border/60 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{meta.label}</CardTitle>
                      <CardDescription className="text-xs">Module status and key pressure metrics.</CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className={cn("text-[11px] uppercase", getStatusBadgeClass(summary.status))}>
                    {getStatusLabel(summary.status)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pt-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{summary.primaryMetric.label}</p>
                  <p className="mt-1 break-words font-mono text-2xl font-semibold tabular-nums">{formatMetric(summary.primaryMetric)}</p>
                </div>

                {summary.secondaryMetric || summary.tertiaryMetric ? (
                  <div className="space-y-2 rounded-md bg-muted/45 p-2.5">
                    {summary.secondaryMetric ? <SecondaryMetricLine metric={summary.secondaryMetric} /> : null}
                    {summary.tertiaryMetric ? <SecondaryMetricLine metric={summary.tertiaryMetric} /> : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className="font-mono text-[11px] tabular-nums">
                    {summary.openExceptions} open exceptions
                  </Badge>
                  <span className={cn("inline-flex items-center gap-1.5 text-xs font-mono tabular-nums", trendClass)}>
                    {trend?.direction === "up" ? <TrendingUp className="h-3.5 w-3.5" /> : null}
                    {trend?.direction === "down" ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                    {trend?.direction === "flat" ? <Minus className="h-3.5 w-3.5" /> : null}
                    {trend ? trend.label : "No trend"}
                  </span>
                </div>

                <p className="min-h-9 text-xs text-muted-foreground">
                  {summary.topExceptionLabel || "No dominant exception label."}
                </p>

                <Link
                  href={summary.reportHref}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                >
                  Open report
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

