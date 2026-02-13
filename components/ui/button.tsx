import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border-0 text-sm font-semibold transition-[background-color,color,box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 [&_.material-symbols-rounded]:pointer-events-none [&_.material-symbols-rounded]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--edge-outline-sharp)] hover:bg-[var(--action-primary-hover)] hover:shadow-[var(--edge-outline-sharp-hover)]",
        destructive:
          "bg-destructive text-[var(--action-destructive-fg)] shadow-[var(--edge-outline-sharp)] hover:bg-destructive/90 hover:shadow-[var(--edge-outline-sharp-hover)]",
        outline:
          "bg-[var(--action-outline-bg)] text-foreground shadow-[var(--action-outline-shadow)] hover:bg-[var(--action-outline-hover-bg)] hover:shadow-[var(--action-outline-shadow-hover)]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[var(--edge-outline-sharp)] hover:bg-[var(--action-secondary-hover)] hover:shadow-[var(--edge-outline-sharp-hover)]",
        ghost: "text-foreground hover:bg-muted/80",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 gap-1.5 px-3 text-sm",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
