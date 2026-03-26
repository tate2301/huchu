import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SurfaceProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function CCTVSurface({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: SurfaceProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] shadow-[var(--surface-frame-shadow)]",
        className,
      )}
    >
      {title || description || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--edge-subtle)] px-4 py-3 sm:px-5">
          <div className="space-y-1">
            {title ? <h2 className="text-section-title text-foreground">{title}</h2> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("px-4 py-4 sm:px-5", contentClassName)}>{children}</div>
    </section>
  );
}

type MetricStripProps = {
  metrics: Array<{
    label: string;
    value: string;
    hint?: string;
    tone?: "default" | "success" | "warning" | "danger" | "muted";
  }>;
  className?: string;
};

export function CCTVMetricStrip({ metrics, className }: MetricStripProps) {
  return (
    <div className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-4", className)}>
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className={cn(
            "rounded-xl border border-[var(--edge-subtle)] px-4 py-3 shadow-[var(--surface-frame-shadow)]",
            metric.tone === "success"
              ? "bg-[var(--status-success-bg)]"
              : metric.tone === "warning"
                ? "bg-[var(--status-warning-bg)]"
                : metric.tone === "danger"
                  ? "bg-[var(--status-error-bg)]"
                  : "bg-background/80",
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {metric.label}
          </p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-2xl font-semibold tracking-tight text-foreground">{metric.value}</p>
          </div>
          {metric.hint ? <p className="mt-2 text-sm text-muted-foreground">{metric.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

type SplitPanelProps = {
  left: ReactNode;
  right: ReactNode;
  className?: string;
};

export function CCTVSplitPanel({ left, right, className }: SplitPanelProps) {
  return (
    <div className={cn("grid gap-4 xl:grid-cols-[1.6fr_1fr]", className)}>
      <div className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] shadow-[var(--surface-frame-shadow)]">
        {left}
      </div>
      <div className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] shadow-[var(--surface-frame-shadow)]">
        {right}
      </div>
    </div>
  );
}

type RowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
  active?: boolean;
  className?: string;
  onClick?: () => void;
};

export function CCTVRow({ title, subtitle, meta, right, active, className, onClick }: RowProps) {
  const interactive = Boolean(onClick);
  const shared = cn(
    "flex w-full items-start justify-between gap-3 border-b border-[var(--edge-subtle)] px-4 py-3 text-left transition-colors last:border-b-0",
    interactive ? "hover:bg-muted/50" : "",
    active ? "bg-muted/60" : "",
    className,
  );

  if (!interactive) {
    return (
      <div className={shared}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold text-foreground">{title}</div>
            {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
          </div>
          {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} className={shared}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-semibold text-foreground">{title}</div>
          {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </button>
  );
}
