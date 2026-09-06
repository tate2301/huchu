"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * NumericCell — the design system's `.num` treatment, on a span.
 *
 * Deliberately *not* the DS `NumericCell`: that one renders a `<td>`, and all
 * 92 call sites here return this from a TanStack `cell` renderer, i.e. already
 * inside a `<td>`. Nesting one in the other would be invalid markup.
 *
 * The DS `.num` class carries the mono font and tabular figures; alignment
 * stays local because `.num` defaults to right-aligned only when it is itself
 * the table cell.
 */
type NumericCellProps = {
  className?: string;
  align?: "left" | "right";
  children: React.ReactNode;
};

export function NumericCell({ className, align = "right", children }: NumericCellProps) {
  return (
    <span
      className={cn(
        "num inline-block",
        align === "right" ? "w-full text-right" : "text-left",
        className,
      )}
    >
      {children}
    </span>
  );
}
