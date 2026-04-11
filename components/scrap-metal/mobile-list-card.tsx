"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ScrapMobileMetric = {
  icon: React.ComponentType<{ className?: string; size?: number | string }>;
  value: ReactNode;
  srLabel: string;
};

export function ScrapMobileCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <article className={cn("space-y-2.5", className)}>{children}</article>;
}

export function ScrapMobileCardHeader({
  title,
  subtitle,
  aside,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {subtitle ? <p className="truncate font-mono text-[11px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export function ScrapMobileMetricStrip({
  items,
}: {
  items: ScrapMobileMetric[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <div
          key={item.srLabel}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-2.5 py-1.5"
        >
          <item.icon className="shrink-0 text-muted-foreground" size={14} />
          <span className="sr-only">{item.srLabel}</span>
          <span className="truncate text-[12px] font-medium text-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ScrapMobileCardActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-wrap gap-2 pt-0.5", className)}>{children}</div>;
}
