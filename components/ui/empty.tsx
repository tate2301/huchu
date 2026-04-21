import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Empty state container for when there's no data to display.
 *
 * Attio-inspired with:
 * - Centered layout with generous vertical padding
 * - Dashed border for visual distinction
 * - Muted text hierarchy
 * - Optional action button area
 */
function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-5 rounded-[var(--card-radius)] border border-dashed border-[var(--border-default)] bg-[var(--surface-subtle)] p-6 text-center text-balance shadow-[var(--surface-frame-shadow)] sm:p-10 md:p-12",
        className
      )}
      {...props}
    />
  );
}

/**
 * Header area within an empty state - groups icon + title + description.
 */
function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn(
        "flex max-w-sm flex-col items-center gap-3 text-center",
        className
      )}
      {...props}
    />
  );
}

const emptyMediaVariants = cva(
  "flex shrink-0 items-center justify-center mb-1 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-11 shrink-0 items-center justify-center rounded-[var(--button-radius)] border border-[var(--border-default)] bg-[var(--surface-panel)] text-[var(--text-strong)] shadow-[var(--surface-frame-shadow)] [&_svg:not([class*='size-'])]:size-5",
        large: "flex size-14 shrink-0 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-panel)] text-[var(--text-muted)] shadow-[var(--surface-frame-shadow)] [&_svg:not([class*='size-'])]:size-7",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
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

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn(
        "text-lg font-semibold tracking-[-0.02em] text-[var(--text-strong)]",
        className
      )}
      {...props}
    />
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="empty-description"
      className={cn(
        "max-w-xs text-sm leading-relaxed text-[var(--text-muted)] [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-[var(--primary)]",
        className
      )}
      {...props}
    />
  );
}

/**
 * Action button area within an empty state.
 * Use this to wrap Button components.
 */
function EmptyActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-actions"
      className={cn(
        "flex flex-wrap items-center justify-center gap-3 pt-1",
        className
      )}
      {...props}
    />
  );
}

/**
 * Raw content area for custom empty state layouts.
 */
function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        className
      )}
      {...props}
    />
  );
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyActions,
  EmptyContent,
  EmptyMedia,
  emptyMediaVariants,
};
