import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-5 items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] border-0 px-2.5 py-0.5 text-[11px] font-semibold leading-4 tracking-[0.01em] shadow-[var(--badge-shadow)] transition-[background-color,color,box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-2 focus:ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-[var(--badge-brand-bg)] text-[var(--badge-brand-text)]",
        secondary: "bg-[var(--badge-info-bg)] text-[var(--badge-info-text)]",
        destructive: "bg-[var(--badge-danger-bg)] text-[var(--badge-danger-text)]",
        outline: "bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)]",
        neutral: "bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)]",
        brand: "bg-[var(--badge-brand-bg)] text-[var(--badge-brand-text)]",
        info: "bg-[var(--badge-info-bg)] text-[var(--badge-info-text)]",
        success: "bg-[var(--badge-success-bg)] text-[var(--badge-success-text)]",
        warning: "bg-[var(--badge-warning-bg)] text-[var(--badge-warning-text)]",
        danger: "bg-[var(--badge-danger-bg)] text-[var(--badge-danger-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return (
    <div className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
