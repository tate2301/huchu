"use client";

import * as React from "react";

import { cn } from "../lib/utils";

/**
 * TableRail — the horizontal scroll port a wide table sits in.
 *
 * The design system ships `.table-scroll` for exactly this (`overflow-x: auto`,
 * `min-width: 0`, plus `[data-sticky-first]` to pin the leading column while
 * the rail scrolls sideways). The local `.table-rail` is kept alongside it
 * because `app/globals.css` keys `.table-rail > [data-slot="table"]` off it to
 * let the table grow past the rail — the DS's `.table-scroll > table` only sets
 * `min-width: 100%`.
 *
 * `.table-scroll.capped` is deliberately *not* applied for `maxHeight`: it
 * would be inert here. `globals.css` declares `.table-rail` in the `utilities`
 * layer, which outranks the package's `corelith` layer, so its
 * `overflow-y: hidden` beats `.capped`'s `overflow-y: auto`. The inline
 * `max-height` is left as the mechanism, exactly as before.
 */
type TableRailProps = React.ComponentProps<"div"> & {
  maxHeight?: string;
  /** Pin the first column while the rail scrolls horizontally. */
  stickyFirstColumn?: boolean;
};

export function TableRail({
  className,
  maxHeight,
  stickyFirstColumn,
  style,
  children,
  ...props
}: TableRailProps) {
  return (
    <div
      className={cn("table-rail table-scroll", className)}
      data-sticky-first={stickyFirstColumn ? "" : undefined}
      style={maxHeight ? { ...style, maxHeight } : style}
      {...props}
    >
      {children}
    </div>
  );
}
