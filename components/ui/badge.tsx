import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-4 transition-colors",
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
