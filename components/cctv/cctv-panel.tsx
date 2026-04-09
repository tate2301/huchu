import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

type CCTVSectionProps = {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function CCTVSection({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: CCTVSectionProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-base)] shadow-[var(--surface-frame-shadow)]",
        className,
      )}
    >
      {eyebrow || title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5">
          <div className="space-y-1">
            {eyebrow ? (
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

type CCTVStat = {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive";
};

type CCTVMetricStripProps = {
  stats: CCTVStat[];
  className?: string;
};

const toneClass: Record<NonNullable<CCTVStat["tone"]>, string> = {
  default: "text-foreground",
  success: "text-[var(--status-success-text)]",
  warning: "text-[var(--status-warning-text)]",
  destructive: "text-[var(--status-error-text)]",
};

export function CCTVMetricStrip({ stats, className }: CCTVMetricStripProps) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-2xl border border-[var(--edge-default)] bg-[var(--edge-default)] sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {stats.map((stat) => (
        <div
          key={String(stat.label)}
          className="bg-[var(--surface-base)] px-4 py-3"
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {stat.label}
          </div>
          <div
            className={cn(
              "mt-1 text-2xl font-semibold tracking-tight",
              toneClass[stat.tone ?? "default"],
            )}
          >
            {stat.value}
          </div>
          {stat.detail ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {stat.detail}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

type CCTVToolbarProps = {
  children: ReactNode;
  className?: string;
};

export function CCTVToolbar({ children, className }: CCTVToolbarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 ", className)}>
      {children}
    </div>
  );
}

export function CCTVDivider() {
  return <Separator className="bg-[var(--edge-default)]" />;
}
