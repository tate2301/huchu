"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ── Scroll Container Types ──────────────────────────────────────────────── */

type ScrollDirection = "both" | "horizontal" | "vertical";

type ScrollSnap = "none" | "x" | "y" | "both";

type ScrollIndicator = "none" | "fade" | "shadow";

interface ScrollContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: ScrollDirection;
  snap?: ScrollSnap;
  indicator?: ScrollIndicator;
  hideScrollbar?: boolean;
  overscroll?: "auto" | "contain" | "none";
  children: React.ReactNode;
}

/* ── Scroll Container ────────────────────────────────────────────────────── */

const ScrollContainer = React.forwardRef<HTMLDivElement, ScrollContainerProps>(
  (
    {
      className,
      direction = "vertical",
      snap = "none",
      indicator = "none",
      hideScrollbar = false,
      overscroll = "auto",
      children,
      ...props
    },
    ref
  ) => {
    const directionClasses = {
      both: "overflow-auto",
      horizontal: "overflow-x-auto overflow-y-hidden",
      vertical: "overflow-y-auto overflow-x-hidden",
    };

    const snapClasses = {
      none: "",
      x: "scroll-snap-x snap-x",
      y: "scroll-snap-y snap-y",
      both: "scroll-snap-both snap-both",
    };

    const overscrollClasses = {
      auto: "overscroll-auto",
      contain: "overscroll-contain",
      none: "overscroll-none",
    };

    const indicatorClasses = {
      none: "",
      fade: "scroll-fade",
      shadow: "scroll-shadow",
    };

    return (
      <div
        ref={ref}
        data-slot="scroll-container"
        data-direction={direction}
        data-snap={snap}
        data-indicator={indicator}
        className={cn(
          "relative",
          directionClasses[direction],
          snapClasses[snap],
          overscrollClasses[overscroll],
          hideScrollbar && "scrollbar-hide",
          indicatorClasses[indicator],
          "[-webkit-overflow-scrolling:touch]",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ScrollContainer.displayName = "ScrollContainer";

/* ── Snap Item ───────────────────────────────────────────────────────────── */

const SnapItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { align?: "start" | "center" | "end" }
>(({ className, align = "start", ...props }, ref) => (
  <div
    ref={ref}
    data-slot="snap-item"
    className={cn("snap-start", align === "center" && "snap-center", align === "end" && "snap-end", className)}
    {...props}
  />
));
SnapItem.displayName = "SnapItem";

/* ── Pull To Refresh Hint (visual only) ──────────────────────────────────── */

const PullToRefreshHint = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    pulling?: boolean;
    threshold?: number;
  }
>(({ className, pulling = false, threshold = 64, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="pull-to-refresh-hint"
    className={cn(
      "flex items-center justify-center py-3 text-[13px] text-[var(--text-muted)] transition-opacity duration-200",
      pulling ? "opacity-100" : "opacity-0",
      className
    )}
    {...props}
  >
    <svg
      className="mr-2 h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
    Pull to refresh
  </div>
));
PullToRefreshHint.displayName = "PullToRefreshHint";

/* ── Exports ─────────────────────────────────────────────────────────────── */

export {
  ScrollContainer,
  SnapItem,
  PullToRefreshHint,
};

export type {
  ScrollDirection,
  ScrollSnap,
  ScrollIndicator,
  ScrollContainerProps,
};
