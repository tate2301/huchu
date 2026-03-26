"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type CCTVSectionProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

type CCTVSurfaceProps = {
  children: ReactNode;
  className?: string;
};

type CCTVStatProps = {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "good" | "warn" | "danger";
};

const toneClasses: Record<NonNullable<CCTVStatProps["tone"]>, string> = {
  neutral: "border-border bg-background text-foreground",
  good: "border-emerald-200 bg-emerald-50/70 text-emerald-950",
  warn: "border-amber-200 bg-amber-50/70 text-amber-950",
  danger: "border-rose-200 bg-rose-50/70 text-rose-950",
};

export function CCTVSurface({ children, className }: CCTVSurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-background/95 shadow-[0_1px_0_rgba(15,23,42,0.03)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CCTVSection({
  title,
  description,
  actions,
  children,
  className,
}: CCTVSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function CCTVStat({ label, value, detail, tone = "neutral" }: CCTVStatProps) {
  return (
    <div className={cn("rounded-2xl border p-4", toneClasses[tone])}>
      <div className="text-xs font-medium uppercase tracking-[0.18em] opacity-70">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {detail ? <div className="mt-1 text-sm opacity-80">{detail}</div> : null}
    </div>
  );
}
