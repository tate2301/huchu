"use client";

import type { ExecutiveHighlight } from "@/lib/api";
import { AlertTriangle, CheckCircle2, Minus, ReportProblem } from "@/lib/icons";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ExecutiveHighlightsProps = {
  items?: ExecutiveHighlight[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function formatHighlightValue(item: ExecutiveHighlight) {
  if (item.valueLabel) return item.valueLabel;
  if (typeof item.value !== "number" || Number.isNaN(item.value)) return null;
  const value = numberFormatter.format(item.value);
  return item.unit ? `${value} ${item.unit}` : value;
}

function getToneMeta(tone: ExecutiveHighlight["tone"]) {
  if (tone === "critical") {
    return {
      label: "Critical",
      badgeVariant: "danger" as const,
      markerClassName: "bg-[var(--status-error-border)]",
      icon: AlertTriangle,
    };
  }
  if (tone === "warning") {
    return {
      label: "Watch",
      badgeVariant: "warning" as const,
      markerClassName: "bg-[var(--status-warning-border)]",
      icon: ReportProblem,
    };
  }
  if (tone === "positive") {
    return {
      label: "Positive",
      badgeVariant: "success" as const,
      markerClassName: "bg-[var(--status-success-border)]",
      icon: CheckCircle2,
    };
  }
  return {
    label: "Neutral",
    badgeVariant: "info" as const,
    markerClassName: "bg-[var(--status-info-border)]",
    icon: Minus,
  };
}

function HighlightStatCard({ item }: { item: ExecutiveHighlight }) {
  const toneMeta = getToneMeta(item.tone ?? "neutral");
  const ToneIcon = toneMeta.icon;

  return (
    <div className="surface-framed rounded-md bg-muted/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${toneMeta.markerClassName}`} />
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.title}
          </p>
        </div>
        <Badge
          variant={toneMeta.badgeVariant}
          className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px]")}
        >
          <ToneIcon className="h-3 w-3" />
          {toneMeta.label}
        </Badge>
      </div>
      <p className="mt-2 font-mono text-xl font-semibold tabular-nums">
        {formatHighlightValue(item) ?? "n/a"}
      </p>
    </div>
  );
}

export function ExecutiveHighlights({
  items,
  isLoading,
  isError,
  errorMessage,
}: ExecutiveHighlightsProps) {
  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/60 pb-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`highlight-skeleton-${index}`} className="rounded-md bg-muted/40 p-3">
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
        title="Exception highlights unavailable"
        description={errorMessage || "Highlight records could not be retrieved."}
      />
    );
  }

  if (!items || items.length === 0) {
    return (
      <StatusState
        variant="empty"
        title="No exception highlights"
        description="No notable exception records were returned for this selection."
      />
    );
  }

  const criticalCount = items.filter((item) => item.tone === "critical").length;
  const watchCount = items.filter((item) => item.tone === "warning").length;
  const positiveCount = items.filter((item) => item.tone === "positive").length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-[1.15rem]">Exception Highlights</CardTitle>
            <CardDescription>Priority exception signals across active domains.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="danger">
              Critical: {criticalCount}
            </Badge>
            <Badge variant="warning">
              Watch: {watchCount}
            </Badge>
            <Badge variant="success">
              Positive: {positiveCount}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <HighlightStatCard key={item.id} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
