"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Chip — a choice chip, 30px pill; picked = solid ink (G1). One or many in a
 * row may be picked, so each is a toggle button with `aria-pressed`. `count`
 * is the mono figure after the word ("Beer 48").
 */
export type ChipProps = Omit<React.ComponentProps<"button">, "onChange"> & {
  pressed: boolean;
  onPressedChange?: (pressed: boolean) => void;
  count?: React.ReactNode;
};

export function Chip({ pressed, onPressedChange, count, className, children, onClick, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn("cx-chip", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onPressedChange?.(!pressed);
      }}
      {...props}
    >
      {children}
      {count !== undefined && count !== null ? <span className="cx-chip__count">{count}</span> : null}
    </button>
  );
}
