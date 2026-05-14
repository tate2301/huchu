"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "@/lib/icons";

/* ── PosTerminalHeader ──────────────────────────────────────────────────── */

type PosTerminalHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  valuePrimary?: string;
  valueSecondary?: string;
  pill?: ReactNode;
  className?: string;
};

export function PosTerminalHeader({
  eyebrow,
  title,
  subtitle,
  valuePrimary,
  valueSecondary,
  pill,
  className,
}: PosTerminalHeaderProps) {
  return (
    <div
      className={cn("px-5 py-4", className)}
      style={{
        background: "var(--pos-amount-bg)",
        borderBottom: "1px solid var(--pos-amount-border)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p
              className="truncate text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "var(--pos-amount-label)" }}
            >
              {eyebrow}
            </p>
          ) : null}
          <h2
            className="mt-0.5 truncate font-bold"
            style={{
              fontSize: "clamp(1.05rem, 4vw, 1.5rem)",
              lineHeight: 1.2,
              color: "var(--pos-amount-text)",
            }}
          >
            {title}
          </h2>
          {subtitle ? (
            <p
              className="mt-0.5 truncate text-sm"
              style={{ color: "var(--pos-amount-label)" }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {valuePrimary ? (
            <p
              className="font-mono font-black tabular-nums"
              style={{
                fontSize: "clamp(1.1rem, 4vw, 1.6rem)",
                lineHeight: 1.1,
                color: "var(--pos-amount-text)",
              }}
            >
              {valuePrimary}
            </p>
          ) : null}
          {valueSecondary ? (
            <p
              className="mt-0.5 font-mono text-sm tabular-nums"
              style={{ color: "var(--pos-amount-label)" }}
            >
              {valueSecondary}
            </p>
          ) : null}
          {pill ? <div className="mt-1">{pill}</div> : null}
        </div>
      </div>
    </div>
  );
}

/* ── PosPanel ───────────────────────────────────────────────────────────── */

type PosPanelProps = {
  className?: string;
  children: ReactNode;
  variant?: "section" | "card";
};

export function PosPanel({ className, children, variant = "section" }: PosPanelProps) {
  return (
    <section
      className={cn(
        variant === "card"
          ? "rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-base)] p-4 sm:p-5"
          : "rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-4 sm:p-5",
        className,
      )}
      style={{ boxShadow: "var(--shadow-card, 0 1px 3px rgba(15,23,42,0.06))" }}
    >
      {children}
    </section>
  );
}

/* ── PosPanelHeader ─────────────────────────────────────────────────────── */

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
        "mb-4 flex flex-col gap-3 border-b border-[var(--edge-subtle)] pb-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-[1.3rem] font-bold tracking-[-0.025em] text-[var(--text-strong)]">
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

/* ── PosMetricCard ──────────────────────────────────────────────────────── */

type PosMetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  meta?: ReactNode;
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
  className?: string;
};

const POS_METRIC_TONE: Record<string, { bg: string; text: string }> = {
  brand:   { bg: "var(--pos-status-info-bg)",    text: "var(--pos-status-info-text)" },
  success: { bg: "var(--pos-status-success-bg)", text: "var(--pos-status-success-text)" },
  warning: { bg: "var(--pos-status-warning-bg)", text: "var(--pos-status-warning-text)" },
  danger:  { bg: "var(--pos-status-danger-bg)",  text: "var(--pos-status-danger-text)" },
  neutral: { bg: "var(--surface-muted)",          text: "var(--text-muted)" },
};

export function PosMetricCard({
  icon: Icon,
  label,
  value,
  meta,
  tone = "neutral",
  className,
}: PosMetricCardProps) {
  const t = POS_METRIC_TONE[tone] ?? POS_METRIC_TONE.neutral;
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full"
          style={{ background: t.bg, color: t.text }}
        >
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </div>
      <div className="mt-3 font-mono text-[1.05rem] font-black tabular-nums text-[var(--text-strong)]">
        {value}
      </div>
      {meta ? (
        <div className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{meta}</div>
      ) : null}
    </div>
  );
}

/* ── PosEmptyState ──────────────────────────────────────────────────────── */

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
        "flex min-h-[14rem] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--edge-default)] bg-[var(--surface-muted)] px-5 py-8 text-center",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-base)] text-[var(--action-primary-bg)] shadow-sm">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold tracking-[-0.02em] text-[var(--text-strong)]">
        {title}
      </h3>
      <p className="mt-2 max-w-[32rem] text-sm leading-6 text-[var(--text-muted)]">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ── PosStatusPill ──────────────────────────────────────────────────────── */

type PosStatusPillProps = {
  children: ReactNode;
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
  className?: string;
};

const POS_PILL_STYLE: Record<
  string,
  { bg: string; ring: string; text: string }
> = {
  brand:   { bg: "var(--pos-status-info-bg)",    ring: "var(--pos-status-info-ring)",    text: "var(--pos-status-info-text)" },
  success: { bg: "var(--pos-status-success-bg)", ring: "var(--pos-status-success-ring)", text: "var(--pos-status-success-text)" },
  warning: { bg: "var(--pos-status-warning-bg)", ring: "var(--pos-status-warning-ring)", text: "var(--pos-status-warning-text)" },
  danger:  { bg: "var(--pos-status-danger-bg)",  ring: "var(--pos-status-danger-ring)",  text: "var(--pos-status-danger-text)" },
  neutral: { bg: "var(--surface-muted)",          ring: "var(--edge-default)",             text: "var(--text-muted)" },
};

export function PosStatusPill({
  children,
  tone = "neutral",
  className,
}: PosStatusPillProps) {
  const s = POS_PILL_STYLE[tone] ?? POS_PILL_STYLE.neutral;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1",
        className,
      )}
      style={{ background: s.bg, boxShadow: `inset 0 0 0 1px ${s.ring}`, color: s.text }}
    >
      {children}
    </span>
  );
}
