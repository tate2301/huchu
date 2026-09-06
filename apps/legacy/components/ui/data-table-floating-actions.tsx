"use client";

import type { ReactNode } from "react";

import { X } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * The bulk-selection bar, raised once rows are checked.
 *
 * It floats over the list rather than sitting in the page: a bar that scrolls
 * away on a long table is a bar you cannot reach at the moment you have
 * finished choosing rows, which is the only moment it exists for.
 *
 * The count leads. "3 selected" is the fact the reader needs before they can
 * judge whether an action is safe to take, and it is the first thing on the
 * bar for the same reason it is the first thing they would say out loud.
 */
type DataTableFloatingActionsProps = {
  children: ReactNode;
  /** How many rows are selected. */
  count?: number;
  /** Lets the bar dismiss itself, which is otherwise a hunt back up the list. */
  onClear?: () => void;
  className?: string;
};

export function DataTableFloatingActions({
  children,
  count,
  onClear,
  className,
}: DataTableFloatingActionsProps) {
  return (
    <div
      className={cn(
        "sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2",
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-2 pl-3",
        "shadow-[var(--elevation-3)]",
        className,
      )}
      role="region"
      aria-label="Actions for the selected rows"
    >
      {count !== undefined ? (
        <span className="flex items-center gap-2 pr-1 text-sm">
          <span className="inline-flex min-w-6 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--interactive-primary)] px-1.5 py-0.5 font-mono font-medium text-[var(--text-on-primary,white)]">
            {count}
          </span>
          <span className="text-[var(--text-muted)]">selected</span>
        </span>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">{children}</div>

      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear the selection"
          className="ml-1 flex size-7 flex-none items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
