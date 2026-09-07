"use client";

import * as React from "react";

import { cn } from "../lib/utils";

/**
 * A square button that is only an icon.
 *
 * There were five of these, hand-rolled, on one screen: a `variant="outline"`
 * that drew a filled box around three dots, a bare `<button>` with its own
 * hover classes, a ghost button with no size override that came out
 * rectangular, and two different squares — 28 px and 32 px — sitting in the
 * same row. That is what "nothing is polished" is made of.
 *
 * So: one square, one hover, one focus ring, three sizes that line up with the
 * text they sit beside. An overflow menu in particular is *bare* — horizontal
 * dots and nothing else until the pointer is on them, because a row of boxed
 * icons competes with the content it is meant to act on.
 */

const SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "size-7 [&_svg]:size-3.5",
  md: "size-8 [&_svg]:size-4",
  lg: "size-9 [&_svg]:size-4",
};

const TONE = {
  /** Nothing until hovered. The default, and what an overflow menu wants. */
  bare: "text-[var(--text-subtle)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)]",
  /** A visible affordance for an action somebody has to find. */
  outlined:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
} as const;

export type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: keyof typeof SIZE;
  tone?: keyof typeof TONE;
  /** Required: an icon with no label is a button nobody can name. */
  "aria-label": string;
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ className, size = "md", tone = "bare", type, ...props }, ref) {
    return (
      <button
        ref={ref}
        // Defaulting to `button` because these sit inside forms constantly and
        // a stray submit is a bug that only shows up in production.
        type={type ?? "button"}
        className={cn(
          "inline-flex flex-none items-center justify-center rounded-[var(--radius-sm)] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
          "disabled:pointer-events-none disabled:opacity-50",
          SIZE[size],
          TONE[tone],
          className,
        )}
        {...props}
      />
    );
  },
);
