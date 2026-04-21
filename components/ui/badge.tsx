import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-5 items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] border-0 px-2.5 py-0.5 text-[11px] font-semibold leading-4 tracking-[0.01em] shadow-[var(--badge-shadow)] transition-[background-color,color,box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)] focus:outline-none focus:ring-2 focus:ring-ring/20 focus:ring-offset-0",
  {
    variants: {
      variant: {
        default:  "bg-[var(--badge-brand-bg)] text-[var(--badge-brand-text)]",
        secondary:"bg-[var(--badge-info-bg)] text-[var(--badge-info-text)]",
        destructive:"bg-[var(--badge-danger-bg)] text-[var(--badge-danger-text)]",
        outline:  "bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)]",
        neutral:  "bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)]",
        brand:    "bg-[var(--badge-brand-bg)] text-[var(--badge-brand-text)]",
        info:     "bg-[var(--badge-info-bg)] text-[var(--badge-info-text)]",
        success:  "bg-[var(--badge-success-bg)] text-[var(--badge-success-text)]",
        warning:  "bg-[var(--badge-warning-bg)] text-[var(--badge-warning-text)]",
        danger:   "bg-[var(--badge-danger-bg)] text-[var(--badge-danger-text)]",
        progress: "bg-[var(--status-progress-bg)] text-[var(--status-progress-text)]",
        pending:  "bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]",
        inactive: "bg-[var(--status-inactive-bg)] text-[var(--status-inactive-text)]",
        /* Soft variants: lower contrast, pill with subtle border */
        "soft-neutral": "border border-[var(--edge-default)] bg-[var(--surface-subtle)] text-[var(--text-muted)]",
        "soft-brand":   "border border-[var(--primary-300)] bg-[var(--primary-50)] text-[var(--primary-700)]",
        "soft-success": "border border-[var(--success-300)] bg-[var(--success-50)] text-[var(--success-700)]",
        "soft-warning": "border border-[var(--warning-300)] bg-[var(--warning-50)] text-[var(--warning-700)]",
        "soft-danger":  "border border-[var(--danger-300)] bg-[var(--danger-50)] text-[var(--danger-700)]",
        "soft-info":    "border border-[var(--info-300)] bg-[var(--info-50)] text-[var(--info-700)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  dotColor?: string;
}

function Badge({
  className,
  variant,
  dot,
  dotColor,
  children,
  ...props
}: BadgeProps) {
  const dotStyle = dotColor
    ? { backgroundColor: dotColor }
    : undefined;

  return (
    <div
      data-slot="badge"
      data-variant={variant ?? "default"}
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    >
      {dot && (
        <span
          data-slot="badge-dot"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70"
          style={dotStyle}
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  );
}

/* ── Badge Group ─────────────────────────────────────────────────────────── */

function BadgeGroup({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="badge-group"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Badge, BadgeGroup, badgeVariants };
export type { BadgeProps };
