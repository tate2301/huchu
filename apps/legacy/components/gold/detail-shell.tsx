"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { ChevronLeftIcon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { GoldShell } from "@/components/gold/gold-shell";
import type { GoldTab } from "@/lib/gold/tab-config";
import { cn } from "@/lib/utils";

type DetailShellProps = {
  activeTab: GoldTab;
  backHref: string;
  backLabel: string;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  primary: ReactNode;
  side: ReactNode;
  /** Optional bottom-full-width section, e.g. an audit log timeline. */
  footer?: ReactNode;
};

export function DetailShell({
  activeTab,
  backHref,
  backLabel,
  title,
  subtitle,
  status,
  actions,
  primary,
  side,
  footer,
}: DetailShellProps) {
  return (
    <GoldShell activeTab={activeTab} title="">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Button asChild size="sm" variant="ghost" className="shrink-0">
              <Link href={backHref}>
                <ChevronLeftIcon className="mr-1 h-4 w-4" />
                {backLabel}
              </Link>
            </Button>
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl font-bold tracking-tight truncate">
                {title}
              </h1>
              {subtitle ? (
                <p className="text-sm text-muted-foreground truncate">
                  {subtitle}
                </p>
              ) : null}
              {status ? <div className="pt-1">{status}</div> : null}
            </div>
          </div>
          {actions ? (
            <div className="flex flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">{primary}</div>
          <div className="space-y-5">{side}</div>
        </div>

        {footer}
      </div>
    </GoldShell>
  );
}

export type DetailSectionTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger";

const TONE_HEADER_BG: Record<DetailSectionTone, string> = {
  neutral: "bg-muted/40",
  primary: "bg-blue-50/70",
  success: "bg-emerald-50/70",
  warning: "bg-amber-50/70",
  danger: "bg-rose-50/70",
};
const TONE_ICON: Record<DetailSectionTone, string> = {
  neutral: "text-muted-foreground",
  primary: "text-blue-600",
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-rose-600",
};
const TONE_BORDER: Record<DetailSectionTone, string> = {
  neutral: "border-border",
  primary: "border-blue-200",
  success: "border-emerald-200",
  warning: "border-amber-200",
  danger: "border-rose-200",
};

type IconType = ComponentType<{ className?: string }>;

export function DetailSection({
  title,
  description,
  children,
  className,
  actions,
  icon: Icon,
  tone = "neutral",
  count,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  /** Optional leading icon for the section header. */
  icon?: IconType;
  tone?: DetailSectionTone;
  /** Optional count chip rendered next to the title (e.g., entry counts). */
  count?: number;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border bg-card overflow-hidden",
        TONE_BORDER[tone],
        className,
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between gap-3 border-b px-4 py-3",
          TONE_HEADER_BG[tone],
          TONE_BORDER[tone],
        )}
      >
        <div className="flex items-start gap-3 min-w-0">
          {Icon ? (
            <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", TONE_ICON[tone])} />
          ) : null}
          <div className="min-w-0">
            <h2 className="font-semibold flex items-center gap-2">
              <span>{title}</span>
              {count != null ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {count}
                </span>
              ) : null}
            </h2>
            {description ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function FactGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; tone?: DetailSectionTone }>;
}) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd
            className={cn(
              "mt-1 font-medium",
              item.tone === "success" && "text-emerald-700",
              item.tone === "warning" && "text-amber-700",
              item.tone === "danger" && "text-rose-700",
              item.tone === "primary" && "text-blue-700",
            )}
          >
            {item.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
