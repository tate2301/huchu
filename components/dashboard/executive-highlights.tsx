"use client";

import type { ExecutiveHighlight } from "@/lib/api";
import { FrappeStatCard } from "@/components/charts/frappe-stat-card";
import { AlertTriangle, CheckCircle2, Minus, ReportProblem } from "@/lib/icons";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type ExecutiveHighlightsProps = {
  items?: ExecutiveHighlight[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  extras: ReactNode;
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
      icon: AlertTriangle,
    };
  }
  if (tone === "warning") {
    return {
      label: "Watch",
      badgeVariant: "warning" as const,
      icon: ReportProblem,
    };
  }
  if (tone === "positive") {
    return {
      label: "Positive",
      badgeVariant: "success" as const,
      icon: CheckCircle2,
    };
  }
  return {
    label: "Neutral",
    badgeVariant: "info" as const,
    icon: Minus,
  };
}

function HighlightStatCard({ item }: { item: ExecutiveHighlight }) {
  const toneMeta = getToneMeta(item.tone ?? "neutral");
  const ToneIcon = toneMeta.icon;
  const numericValue = typeof item.value === "number" && Number.isFinite(item.value) ? item.value : 0;
  const tone =
    toneMeta.badgeVariant === "danger"
      ? "danger"
      : toneMeta.badgeVariant === "warning"
        ? "warning"
        : toneMeta.badgeVariant === "success"
          ? "success"
          : "neutral";

  return (
    <FrappeStatCard
      label={item.title}
      value={numericValue}
      valueLabel={formatHighlightValue(item) ?? "n/a"}
      detail={`Tone: ${toneMeta.label}`}
      tone={tone}
      titleAdornment={
        <Badge
          variant={toneMeta.badgeVariant}
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px]",
          )}
        >
          <ToneIcon className="h-3 w-3" />
          {toneMeta.label}
        </Badge>
      }
    />
  );
}

export function ExecutiveHighlights({
  items,
  isLoading,
  isError,
  errorMessage,
  extras,
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
              <div
                key={`highlight-skeleton-${index}`}
                className="rounded-md bg-muted/40 p-3"
              >
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
        description={
          errorMessage || "Highlight records could not be retrieved."
        }
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
          <div>{extras}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="danger">Critical: {criticalCount}</Badge>
            <Badge variant="warning">Watch: {watchCount}</Badge>
            <Badge variant="success">Positive: {positiveCount}</Badge>
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
