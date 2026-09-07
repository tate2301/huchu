"use client";

import * as React from "react";
import { Skeleton as DsSkeleton } from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * Skeleton — the design system's. Local call sites size it with Tailwind
 * classes (`className="h-8 w-2/3"`) rather than the DS `width`/`height` props,
 * and both still work: the class lands on the same element.
 */
export type SkeletonProps = React.ComponentProps<typeof DsSkeleton> & {
  /** Legacy alias for the DS `variant`. */
  shape?: "text" | "circle" | "rect";
};

function Skeleton({ className, shape, variant, ...props }: SkeletonProps) {
  return <DsSkeleton variant={variant ?? shape} className={cn(className)} {...props} />;
}

function SkeletonGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("space-y-2", className)} {...props} />;
}

function SkeletonCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-[var(--card-radius)] border border-[var(--border)] p-4", className)}
      {...props}
    >
      <DsSkeleton variant="text" width="40%" />
      <div className="mt-3 space-y-2">
        <DsSkeleton variant="text" />
        <DsSkeleton variant="text" width="80%" />
      </div>
    </div>
  );
}

export { Skeleton, SkeletonGroup, SkeletonCard };
