"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Empty — the design system's `.empty-state` contract, kept compound.
 *
 * The DS ships `EmptyState` as a props component (`title` / `body` / `icon`),
 * but its CSS is written as descendant selectors — `.empty-state h3`,
 * `.empty-state p`, `.empty-state .ic` — so a compound tree binds to it just as
 * well. That keeps the existing composition working.
 *
 * Two element choices are load-bearing for the CSS: `EmptyTitle` renders an
 * `<h3>` and `EmptyDescription` a `<p>`. The description was previously a `div`
 * despite being typed as a `p`; it now matches its own type.
 *
 * The dashed frame is kept — it is this repo's affordance for a droppable or
 * fillable region, and the DS empty state is frameless.
 */
function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "empty-state flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-[var(--card-radius)] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-6 text-center text-balance md:p-12",
        className,
      )}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-sm flex-col items-center gap-2 text-center", className)}
      {...props}
    />
  );
}

const emptyMediaVariants = cva(
  "flex shrink-0 items-center justify-center mb-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        // `.ic` is the DS's rounded icon tile.
        icon: "ic [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 data-slot="empty-title" className={cn(className)} {...props} />;
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn(
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-[var(--text-link)]",
        className,
      )}
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        className,
      )}
      {...props}
    />
  );
}

export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia };
