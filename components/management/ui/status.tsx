import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./settings.module.css";

/**
 * The four states the design has ink for, and nothing else.
 *
 * Deliberately narrower than `lib/ui/status-map`'s seven canonical statuses:
 * this surface draws a state as either "fine", "look at this", "broken" or
 * "switched off", and a fifth colour would only be a fifth thing to remember.
 * Map a domain status onto one of these at the call site.
 */
export type StatusTone = "neutral" | "success" | "warn" | "danger";

/**
 * Where the state is being drawn. It is not decoration — it decides whether a
 * healthy value renders at all.
 *
 *   - `row`    — a list column, where every row shows its state and the column
 *                would have holes in it otherwise. Everything renders.
 *   - `header` — a record header or a single-value row, where a chip saying
 *                "Active" on every record teaches nobody anything. A healthy
 *                value renders `null`.
 *
 * This is rule 5 of the contract, expressed as a type rather than a comment
 * somebody has to remember.
 */
export type StatusContext = "row" | "header";

export type StatusBadgeProps = {
  tone: StatusTone;
  /** The word. "Retired", "Expiring", "Failed" — not a sentence. */
  children: React.ReactNode;
  context?: StatusContext;
  className?: string;
};

/**
 * A tinted chip. Use it for the exception: Retired/Inactive/Archived (grey),
 * anything needing attention (amber), failure (red).
 *
 * In a `header` context a `success` tone returns `null` — there is no chip for
 * Active, Valid, Passing, Published, Current, Core or Teaching.
 */
export function StatusBadge({
  tone,
  children,
  context = "row",
  className,
}: StatusBadgeProps) {
  if (context === "header" && tone === "success") return null;

  return (
    <span data-tone={tone} className={cn(styles.statusBadge, className)}>
      {children}
    </span>
  );
}

export type StatusDotProps = {
  tone: StatusTone;
  /** The word beside the dot. A dot on its own is a colour, not a state. */
  label: string;
  context?: StatusContext;
  className?: string;
};

/**
 * A 6px coloured dot and the word, in the state's own ink. This is what a
 * status *value* looks like inside a record list — not a chip, which would
 * make a column of rows read as a column of buttons.
 */
export function StatusDot({
  tone,
  label,
  context = "row",
  className,
}: StatusDotProps) {
  if (context === "header" && tone === "success") return null;

  return (
    <span data-tone={tone} className={cn(styles.statusDot, className)}>
      {label}
    </span>
  );
}
