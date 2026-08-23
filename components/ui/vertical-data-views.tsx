"use client";

import * as React from "react";

import { resolveViewIcon } from "@/lib/ui/view-icons";
import type { LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type VerticalDataViewItem = {
  id: string;
  label: string;
  description?: string;
  count?: number;
  /**
   * Override the icon this view gets. Left off, one is resolved from the id
   * and label — see `lib/ui/view-icons`, which exists so a hundred rails do
   * not each pick a different picture for "invoices".
   */
  icon?: LucideIcon;
};

type VerticalDataViewsProps = {
  items: VerticalDataViewItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  /** Accessible name for the switcher. No longer painted as a rail heading. */
  railLabel?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * A view switcher, rendered as a segmented strip that pins above its content.
 *
 * It used to be a second vertical nav rail. On a page like Receivables that
 * put four levels of navigation in front of the data — app sidebar, the
 * module's category rail, a horizontal tab strip, and then this — and the
 * views rail alone took `--rail-w` off the width of every table it sat beside.
 *
 * The rail was also saying the wrong thing. Customers, Invoices, Receipts,
 * Credit notes, Write-offs, Ageing and Statements are not seven destinations;
 * they are seven cuts of one ledger. A rail presents them as places you travel
 * to, which is why the pages behind it kept needing their own headings to
 * re-explain where you were. A segmented control presents them as what they
 * are: the current view of the thing already named in the page band.
 *
 * Overflow is horizontal scroll, never wrapping or shrinking. Pills keep their
 * natural width — a set that squeezes to fit is a set you cannot read, and the
 * counts are the part that goes first.
 */
export function VerticalDataViews({
  items,
  value,
  onValueChange,
  className,
  railLabel = "Views",
  children,
}: VerticalDataViewsProps) {
  const accessibleLabel = typeof railLabel === "string" ? railLabel : "Views";

  return (
    <section
      className={cn("min-w-0", className)}
      style={
        {
          // Computed here, applied one element down. `--stack-top: calc(var(--stack-top) …)`
          // on a single element is a custom-property cycle — CSS makes the whole
          // declaration invalid rather than reading the inherited value — so the
          // accumulate and the rename have to happen on different elements.
          "--stack-next": "calc(var(--stack-top, 0px) + var(--list-toolbar-h))",
        } as React.CSSProperties
      }
    >
      {/*
        Pins at whatever offset the stack has reached: zero on a page with no
        band above it, the page band's height inside the accounting shell.
      */}
      <div
        className="band-shell sticky z-20 flex min-h-[var(--list-toolbar-h)] items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-base)]"
        style={{ top: "var(--stack-top, 0px)" }}
      >
        <div
          role="tablist"
          aria-label={accessibleLabel}
          className="flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto rounded-[7px] bg-[var(--surface-sunken)] p-0.5"
        >
          {items.map((item) => {
            const Icon = item.icon ?? resolveViewIcon(item.id, item.label);
            const active = item.id === value;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onValueChange(item.id)}
                className={cn(
                  "flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 text-sm transition-colors",
                  active
                    ? "bg-[var(--surface)] font-bold text-[var(--text-strong)] shadow-[0_1px_2px_rgba(22,24,29,.10)]"
                    : "font-medium text-[var(--text-muted)] hover:text-[var(--text-strong)]",
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
                {typeof item.count === "number" ? (
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      active ? "text-[var(--text-muted)]" : "text-[var(--text-subtle)]",
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/*
        Republish the stack one band lower. Anything sticky inside a view — a
        list toolbar, and through it a column header — now pins beneath this
        strip without ever naming a pixel offset.
      */}
      <div
        className="min-w-0 space-y-2.5 pt-3"
        style={{ "--stack-top": "var(--stack-next)" } as React.CSSProperties}
      >
        {children}
      </div>
    </section>
  );
}
