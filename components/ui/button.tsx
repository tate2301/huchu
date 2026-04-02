import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium tracking-tight transition-all duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 [&_.material-symbols-rounded]:pointer-events-none [&_.material-symbols-rounded]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] hover:bg-[var(--action-primary-hover)] active:bg-[var(--action-primary-pressed)] shadow-[var(--button-shadow-rest)]",
        destructive:
          "bg-[var(--action-danger-bg)] text-[var(--action-danger-fg)] hover:opacity-90 active:opacity-80",
        outline:
          "border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] hover:bg-[var(--surface-alt)] hover:border-[var(--border-strong)]",
        secondary:
          "bg-[var(--action-secondary-bg)] text-[var(--action-secondary-fg)] hover:bg-[var(--action-secondary-hover)] border border-transparent",
        ghost:
          "text-[var(--text-primary)] hover:bg-[var(--action-ghost-hover)] active:bg-[var(--action-ghost-pressed)]",
        link: "text-[var(--primary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-11 w-11",
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
