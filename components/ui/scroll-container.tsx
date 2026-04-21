"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * ScrollContainer - Reusable scroll wrapper with proper mobile scrolling behavior.
 *
 * Features:
 * - `-webkit-overflow-scrolling: touch` for smooth iOS momentum scrolling
 * - `overscroll-behavior: contain` to prevent body scroll bleed
 * - Optional horizontal scrolling
 * - Optional scroll-snap behavior
 * - Optional scrollbar hiding
 * - Safe area padding for notched devices
 */
export interface ScrollContainerProps extends React.ComponentProps<"div"> {
  /** When true, enables horizontal scrolling instead of vertical */
  horizontal?: boolean;
  /** When true, hides the scrollbar visually */
  hideScrollbar?: boolean;
  /** When true, enables scroll-snap behavior for child elements */
  snap?: boolean | "x" | "y" | "both";
  /** Maximum height for the scroll container (CSS value) */
  maxHeight?: string;
}

const ScrollContainer = React.forwardRef<HTMLDivElement, ScrollContainerProps>(
  (
    {
      className,
      horizontal = false,
      hideScrollbar = false,
      snap = false,
      maxHeight,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const snapClass =
      snap === true || snap === "y"
        ? "snap-y snap-mandatory"
        : snap === "x"
          ? "snap-x snap-mandatory"
          : snap === "both"
            ? "snap-both snap-mandatory"
            : "";

    const scrollDirection = horizontal
      ? "flex-row overflow-x-auto overflow-y-hidden"
      : "flex-col overflow-y-auto overflow-x-hidden";

    return (
      <div
        ref={ref}
        data-slot="scroll-container"
        data-horizontal={horizontal ? "true" : undefined}
        data-snap={snap ? "true" : undefined}
        className={cn(
          "flex",
          scrollDirection,
          // Smooth iOS scrolling
          "[-webkit-overflow-scrolling:touch]",
          // Prevent scroll bleed to parent
          "overscroll-contain",
          // Scrollbar hiding
          hideScrollbar &&
            "scrollbar-hide [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Scroll snap
          snapClass,
          // Safe area padding for mobile
          "pl-safe pr-safe",
          className
        )}
        style={{
          ...(maxHeight ? { maxHeight } : {}),
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ScrollContainer.displayName = "ScrollContainer";

/**
 * Props for a scroll section with optional sticky header.
 */
export interface ScrollSectionProps extends React.ComponentProps<"div"> {
  /** When true, the section header sticks to the top during scroll */
  stickyHeader?: boolean;
  /** Content for the sticky header */
  header?: React.ReactNode;
  /** Whether this section participates in scroll snapping */
  snapStart?: boolean;
}

/**
 * ScrollSection - A section within a ScrollContainer.
 *
 * Features:
 * - Optional sticky header that pins during scroll
 * - Optional scroll-snap alignment
 * - Proper flex behavior for scroll contexts
 */
const ScrollSection = React.forwardRef<HTMLDivElement, ScrollSectionProps>(
  (
    {
      className,
      stickyHeader = false,
      header,
      snapStart = false,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        data-slot="scroll-section"
        className={cn(
          "flex shrink-0 flex-col",
          snapStart && "snap-start",
          className
        )}
        {...props}
      >
        {header && stickyHeader && (
          <div
            data-slot="scroll-section-header"
            className={cn(
              "sticky top-0 z-10 bg-[var(--surface-base)]/95 backdrop-blur-sm px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]",
              "border-b border-[var(--edge-subtle)]"
            )}
          >
            {header}
          </div>
        )}
        {header && !stickyHeader && (
          <div
            data-slot="scroll-section-header"
            className="bg-[var(--surface-subtle)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]"
          >
            {header}
          </div>
        )}
        {children}
      </div>
    );
  }
);
ScrollSection.displayName = "ScrollSection";

export { ScrollContainer, ScrollSection };
