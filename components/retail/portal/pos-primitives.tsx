"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "@/lib/icons";

type PosPanelProps = {
  className?: string;
  children: ReactNode;
};

export function PosPanel({ className, children }: PosPanelProps) {
  return (
    <section
      className={cn(
        "rounded-[1.5rem] border border-[var(--border-default)] bg-[var(--surface-base)] p-4 shadow-[0_14px_36px_rgba(15,23,42,0.05)] sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

type PosPanelHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PosPanelHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PosPanelHeaderProps) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-3 border-b border-[var(--border-subtle)] pb-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.03em] text-[var(--text-strong)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-[58ch] text-sm leading-6 text-[var(--text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

type PosMetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  meta?: string;
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
  className?: string;
};

const POS_METRIC_TONE_CLASSNAMES = {
  brand:
    "bg-[color-mix(in_srgb,var(--action-primary-bg)_8%,white)] text-[var(--action-primary-bg)]",
  success:
    "bg-[color-mix(in_srgb,var(--status-success-bg)_85%,white)] text-[var(--status-success-text)]",
  warning:
    "bg-[color-mix(in_srgb,var(--status-warning-bg)_88%,white)] text-[var(--status-warning-text)]",
  danger:
    "bg-[color-mix(in_srgb,var(--status-error-bg)_80%,white)] text-[var(--status-error-text)]",
  neutral:
    "bg-[var(--surface-muted)] text-[var(--text-muted)]",
};

export function PosMetricCard({
  icon: Icon,
  label,
  value,
  meta,
  tone = "neutral",
  className,
}: PosMetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-[1.25rem] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full",
            POS_METRIC_TONE_CLASSNAMES[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </div>
      <div className="mt-3 font-mono text-[1.05rem] font-semibold text-[var(--text-strong)]">
        {value}
      </div>
      {meta ? (
        <div className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{meta}</div>
      ) : null}
    </div>
  );
}

type PosEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function PosEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: PosEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[14rem] flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-[var(--border-default)] bg-[var(--surface-muted)] px-5 py-8 text-center",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-base)] text-[var(--action-primary-bg)] shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-[var(--text-strong)]">
        {title}
      </h3>
      <p className="mt-2 max-w-[32rem] text-sm leading-6 text-[var(--text-muted)]">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

type PosStatusPillProps = {
  children: ReactNode;
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
  className?: string;
};

export function PosStatusPill({
  children,
  tone = "neutral",
  className,
}: PosStatusPillProps) {
  const variant =
    tone === "brand"
      ? "brand"
      : tone === "success"
        ? "success"
        : tone === "warning"
          ? "warning"
          : tone === "danger"
            ? "danger"
            : "neutral";

  return (
    <Badge variant={variant} className={cn("rounded-full", className)}>
      {children}
    </Badge>
  );
}
