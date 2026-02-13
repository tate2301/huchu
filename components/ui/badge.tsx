import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border-0 px-2 py-0.5 text-xs font-semibold transition-[background-color,color,box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-2 focus:ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary shadow-[var(--edge-outline-sharp)]",
        secondary: "bg-muted text-foreground shadow-[var(--edge-outline-sharp)]",
        destructive: "bg-destructive/10 text-destructive shadow-[var(--edge-outline-sharp)]",
        outline:
          "bg-[var(--action-outline-bg)] text-foreground shadow-[var(--action-outline-shadow)] hover:bg-[var(--action-outline-hover-bg)] hover:shadow-[var(--action-outline-shadow-hover)]",
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
