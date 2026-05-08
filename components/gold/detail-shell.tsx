"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button asChild size="sm" variant="ghost">
              <Link href={backHref}>
                <ChevronLeftIcon className="mr-1 h-4 w-4" />
                {backLabel}
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight truncate">{title}</h1>
              {subtitle ? (
                <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
              ) : null}
            </div>
            {status}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">{primary}</div>
          <div className="space-y-4">{side}</div>
        </div>

        {footer}
      </div>
    </GoldShell>
  );
}

export function DetailSection({
  title,
  description,
  children,
  className,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function FactGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 font-medium">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
