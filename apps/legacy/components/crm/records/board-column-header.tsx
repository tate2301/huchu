"use client";

import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { IconButton } from "@corelithzw/ui/components/icon-button";
import { DotsThree, Plus } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

export type BoardColumnAction = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

/**
 * The head of a board column, shared by every board.
 *
 * The colour appears twice on purpose: a dot beside the name, and a rule
 * across the top of the column. The dot alone is four pixels the eye has to
 * find once per column; the rule is what makes the colour readable at the
 * speed you actually scan a board — sideways, without stopping.
 *
 * The add button is here rather than at the foot of the column because on a
 * full column the foot is off screen, and "put a new one in this stage" is a
 * thing you decide from the header you just read.
 */
export function BoardColumnHeader({
  name,
  count,
  meta,
  color,
  onAdd,
  addLabel,
  actions,
}: {
  name: string;
  count: number;
  /** Right-aligned supporting figure — a column total, usually. */
  meta?: ReactNode;
  /** Tailwind background classes from `stageColor`. */
  color: { dot: string; band: string };
  onAdd?: () => void;
  addLabel?: string;
  actions?: BoardColumnAction[];
}) {
  return (
    <header className="sticky top-0 z-10 bg-[var(--surface-base)] pb-1">
      <span
        aria-hidden="true"
        className={cn("block h-1 rounded-full", color.band)}
      />

      <div className="group/head flex items-center gap-2 px-1 py-2">
        <span
          aria-hidden="true"
          className={cn("size-2 flex-none rounded-full", color.dot)}
        />
        <h3 className="min-w-0 truncate text-sm font-medium">{name}</h3>
        <span className="flex-none rounded-[var(--radius-sm)] bg-[var(--surface-muted)] px-1.5 font-mono text-sm text-[var(--text-muted)]">
          {count}
        </span>

        {meta ? <span className="ml-auto flex-none">{meta}</span> : null}

        <div className={cn("flex flex-none items-center gap-0.5", meta ? "" : "ml-auto")}>
          {onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              aria-label={addLabel ?? `Add to ${name}`}
              // Visible on hover and on keyboard focus. A row of plus signs
              // across eight columns is eight things competing with the cards.
              className="flex size-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-subtle)] opacity-0 transition-opacity hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:opacity-100 group-hover/head:opacity-100 pointer-coarse:opacity-100"
            >
              <Plus className="size-3.5" />
            </button>
          ) : null}

          {actions && actions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  size="sm"
                  aria-label={`Options for ${name}`}
                  className="opacity-0 focus-visible:opacity-100 group-hover/head:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
                >
                  <DotsThree />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {actions.map((action) => (
                  <DropdownMenuItem
                    key={action.label}
                    onClick={action.onSelect}
                    className={
                      action.destructive ? "text-[var(--status-error-text)]" : undefined
                    }
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
