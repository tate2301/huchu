"use client";

import type { ReactNode } from "react";

import { cn } from "../lib/utils";

/**
 * A table row, as a card, on a phone.
 *
 * `DataTable` takes a `mobileCardRenderer` and swaps the table for a stack of
 * these below `md`. The shape was written for scrap metal and used by ten of
 * its screens; it lived in `components/scrap-metal/` and the only
 * module-specific thing about it was the prefix on the names.
 *
 * R-4.5 needed it for retail. Copying it in would have made a second
 * implementation of a solved problem — the exact thing S-6 exists to end — so
 * it moved here, and a re-export kept those ten screens working. ST-2 has
 * since deleted the scrap-metal module outright and the re-export went with
 * it, which leaves this file as what it always was underneath: the one card.
 *
 * ## The shape, and why it is this shape
 *
 * A phone cannot show eight columns, and shrinking them until it can is how a
 * table becomes unreadable rather than responsive. So a row becomes three
 * parts: what it **is** (title and reference), what it **says** (a strip of
 * pill-shaped facts, each with an icon and a screen-reader label), and what you
 * can **do** with it.
 *
 * The icons are decoration and the `srLabel` carries the meaning, because
 * "$42.00" beside a coin glyph reads fine to somebody looking at it and as
 * nothing at all to somebody listening.
 *
 * ## The type scale caught something on the way here
 *
 * The scrap-metal original set the subtitle at `text-[11px]` and the metric
 * values at `text-[12px]`, both below the design system's floor. Nothing
 * complained, because `no-restricted-syntax` is enforced on `components/ui`
 * and that file sat outside it. Moving it in made the lint fire, so both are
 * `text-sm` now, receding by colour rather than by size — which is what the
 * rule tells you to do and reads better on a phone anyway.
 */

type MobileListMetric = {
  icon: React.ComponentType<{ className?: string; size?: number | string }>;
  value: ReactNode;
  /** What this figure is. Read aloud; the icon is not. */
  srLabel: string;
};

export function MobileListCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <article className={cn("space-y-2.5", className)}>{children}</article>;
}

export function MobileListCardHeader({
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
        {subtitle ? (
          <p className="truncate font-mono text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export function MobileListMetricStrip({ items }: { items: MobileListMetric[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <div
          key={item.srLabel}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-2.5 py-1.5"
        >
          <item.icon className="shrink-0 text-muted-foreground" size={14} />
          <span className="sr-only">{item.srLabel}</span>
          <span className="truncate text-sm font-medium text-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function MobileListCardActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-wrap gap-2 pt-0.5", className)}>{children}</div>;
}
