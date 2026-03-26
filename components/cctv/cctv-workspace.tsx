"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type CctvHeroProps = {
  title: string;
  purpose: string;
  nextStep?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function CctvHero({
  title,
  purpose,
  nextStep,
  actions,
  children,
  className,
}: CctvHeroProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[20px] border border-[var(--edge-subtle)] bg-[linear-gradient(135deg,rgba(8,32,42,0.96),rgba(12,52,54,0.92))] px-5 py-5 text-white shadow-[var(--surface-frame-shadow)] sm:px-6 sm:py-6",
        className,
      )}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">
            CCTV Workspace
          </p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-white/72 sm:text-[15px]">
              {purpose}
            </p>
            {nextStep ? (
              <p className="text-sm font-medium text-[rgba(173,216,191,0.95)]">
                Next: {nextStep}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

type CctvPanelProps = {
  children: ReactNode;
  className?: string;
};

export function CctvPanel({ children, className }: CctvPanelProps) {
  return (
    <section
      className={cn(
        "rounded-[18px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] shadow-[var(--surface-frame-shadow)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

type CctvPanelHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

export function CctvPanelHeader({
  title,
  description,
  aside,
  className,
}: CctvPanelHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-[var(--edge-subtle)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6",
        className,
      )}
    >
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
    </header>
  );
}

type CctvPanelBodyProps = {
  children: ReactNode;
  className?: string;
};

export function CctvPanelBody({ children, className }: CctvPanelBodyProps) {
  return <div className={cn("px-5 py-4 sm:px-6", className)}>{children}</div>;
}

type CctvMetricStripProps = {
  children: ReactNode;
  className?: string;
};

export function CctvMetricStrip({ children, className }: CctvMetricStripProps) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

type CctvMetricProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
};

const metricToneMap: Record<NonNullable<CctvMetricProps["tone"]>, string> = {
  default: "border-[var(--edge-subtle)] bg-[var(--surface-base)]",
  success: "border-[var(--status-success-border)] bg-[var(--status-success-bg)]",
  warning: "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]",
  danger: "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)]",
};

export function CctvMetric({
  label,
  value,
  detail,
  tone = "default",
}: CctvMetricProps) {
  return (
    <div
      className={cn(
        "rounded-[16px] border px-4 py-4 shadow-[var(--surface-frame-shadow)]",
        metricToneMap[tone],
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      </div>
      {detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

type CctvToolbarProps = {
  children: ReactNode;
  className?: string;
};

export function CctvToolbar({ children, className }: CctvToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[16px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-4 shadow-[var(--surface-frame-shadow)] sm:px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

type CctvLabelProps = {
  children: ReactNode;
  className?: string;
};

export function CctvLabel({ children, className }: CctvLabelProps) {
  return (
    <label
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </label>
  );
}

type CctvKeyValueListProps = {
  items: Array<{ label: string; value: ReactNode }>;
  className?: string;
};

export function CctvKeyValueList({ items, className }: CctvKeyValueListProps) {
  return (
    <dl className={cn("grid gap-3", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-start justify-between gap-3 border-b border-[var(--edge-subtle)] pb-3 last:border-0 last:pb-0"
        >
          <dt className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="text-right text-sm font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type CctvScrollListProps = {
  children: ReactNode;
  className?: string;
};

export function CctvScrollList({ children, className }: CctvScrollListProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[16px] border border-[var(--edge-subtle)] bg-[var(--surface-base)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
