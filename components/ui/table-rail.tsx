"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface TableRailProps extends React.ComponentProps<"div"> {
  /** Maximum height for the scrollable area */
  maxHeight?: string;
  /** Optional accessible caption describing the table */
  caption?: string;
  /** Content to display when there are no rows */
  emptyContent?: React.ReactNode;
  /** Whether the table has data (controls empty state) */
  isEmpty?: boolean;
  /** Whether the table is currently loading */
  isLoading?: boolean;
  /** Skeleton rows to show while loading */
  loadingSkeleton?: React.ReactNode;
}

/**
 * TableRail - Responsive table wrapper with mobile-optimized horizontal scrolling.
 *
 * Features:
 * - Horizontal scroll with momentum on mobile (CSS touch scrolling)
 * - Proper overscroll containment
 * - Optional max height for sticky headers
 * - Accessible caption support
 * - Built-in empty and loading states
 * - Refined shadow indicators for scroll overflow
 */
export function TableRail({
  className,
  maxHeight,
  caption,
  emptyContent,
  isEmpty = false,
  isLoading = false,
  loadingSkeleton,
  style,
  children,
  ...props
}: TableRailProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  // Detect scroll overflow for shadow indicators
  const checkOverflow = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(
      hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 4
    );
  }, []);

  React.useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener("scroll", checkOverflow, { passive: true });
    window.addEventListener("resize", checkOverflow);

    // Use ResizeObserver to detect content changes
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", checkOverflow);
      window.removeEventListener("resize", checkOverflow);
      ro.disconnect();
    };
  }, [checkOverflow]);

  return (
    <div
      data-slot="table-rail"
      className={cn(
        "relative w-full",
        // Left shadow indicator
        canScrollLeft &&
          "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-4 before:bg-gradient-to-r before:from-[var(--surface-base)] before:to-transparent",
        // Right shadow indicator
        canScrollRight &&
          "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-10 after:w-4 after:bg-gradient-to-l after:from-[var(--surface-base)] after:to-transparent",
        className
      )}
      {...props}
    >
      {/* Accessible caption (visually hidden, for screen readers) */}
      {caption && (
        <span className="sr-only" role="caption">
          {caption}
        </span>
      )}

      <div
        ref={scrollRef}
        className={cn(
          "table-rail",
          // Smooth momentum scrolling on iOS
          "[-webkit-overflow-scrolling:touch]",
          // Prevent scroll bleed
          "overscroll-x-contain",
          // Touch-friendly scrollbar styling
          "scrollbar-thin"
        )}
        style={maxHeight ? { ...style, maxHeight } : style}
      >
        {isLoading && loadingSkeleton ? (
          loadingSkeleton
        ) : isEmpty && emptyContent ? (
          <div
            data-slot="table-rail-empty"
            className="flex min-h-[120px] items-center justify-center py-8"
          >
            {emptyContent}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/**
 * Touch-friendly table header cell.
 * Ensures minimum tap target size for sortable columns on mobile.
 */
export interface TableRailHeaderProps
  extends React.ThHTMLAttributes<HTMLTableHeaderCellElement> {
  /** Whether the column is sortable (adds larger tap target) */
  sortable?: boolean;
  /** Current sort direction */
  sortDirection?: "asc" | "desc" | null;
}

const TableRailHeader = React.forwardRef<
  HTMLTableHeaderCellElement,
  TableRailHeaderProps
>(
  (
    { className, sortable = false, sortDirection = null, children, ...props },
    ref
  ) => {
    return (
      <th
        ref={ref}
        data-slot="table-rail-header"
        data-sortable={sortable ? "true" : undefined}
        data-sort-direction={sortDirection || undefined}
        className={cn(
          // Base header styles
          "text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]",
          // Touch-friendly sizing for sortable headers
          sortable
            ? "min-h-[44px] cursor-pointer select-none py-2.5"
            : "py-2.5",
          className
        )}
        {...props}
      >
        <span className={cn("flex items-center gap-1", sortable && "min-w-[44px]")}>
          {children}
          {sortDirection && (
            <span
              className={cn(
                "inline-block text-[10px] transition-transform",
                sortDirection === "desc" && "rotate-180"
              )}
              aria-hidden="true"
            >
              &#9650;
            </span>
          )}
        </span>
      </th>
    );
  }
);
TableRailHeader.displayName = "TableRailHeader";

export { TableRailHeader };
