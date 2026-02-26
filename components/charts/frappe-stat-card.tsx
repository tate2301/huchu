"use client";

import { NumberChart } from "@rtcamp/frappe-ui-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { buildNumberMetricConfig } from "@/lib/charts/frappe-config-builders";
import { cn } from "@/lib/utils";

type FrappeStatCardTone = "neutral" | "success" | "warning" | "danger";

const toneClassName: Record<FrappeStatCardTone, string> = {
  neutral: "bg-card/70",
  success: "bg-emerald-50/80",
  warning: "bg-amber-50/80",
  danger: "bg-rose-50/80",
};

type FrappeStatCardProps = {
  label: string;
  value: number;
  valueLabel?: string;
  detail?: string;
  delta?: number;
  negativeIsBetter?: boolean;
  tone?: FrappeStatCardTone;
  loading?: boolean;
  className?: string;
  titleAdornment?: ReactNode;
};

export function FrappeStatCard({
  label,
  value,
  valueLabel,
  detail,
  delta,
  negativeIsBetter = false,
  tone = "neutral",
  loading = false,
  className,
  titleAdornment,
}: FrappeStatCardProps) {
  const metricConfig = buildNumberMetricConfig({
    title: label,
    value,
    delta,
    negativeIsBetter,
  });

  return (
    <div className={cn("rounded-md border border-border/60", toneClassName[tone], className)}>
      {loading ? (
        <Skeleton className="h-[140px] w-full" />
      ) : (
        <NumberChart
          config={metricConfig}
          title={
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
              {titleAdornment}
            </div>
          }
          subtitle={() => (
            <div className="flex flex-col gap-1">
              <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
                {valueLabel ?? value.toLocaleString()}
              </div>
              {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
            </div>
          )}
        />
      )}
    </div>
  );
}
