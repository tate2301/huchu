import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--button-radius)] border text-sm font-semibold tracking-[0.01em] shadow-none transition-[background-color,color,border-color,box-shadow,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)] active:scale-[0.995] disabled:pointer-events-none disabled:opacity-70 disabled:shadow-none disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 [&_.material-symbols-rounded]:pointer-events-none [&_.material-symbols-rounded]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        default:
          "border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] shadow-[var(--button-shadow-rest)] hover:bg-[var(--action-primary-hover)] hover:shadow-[var(--button-shadow-hover)] active:bg-[var(--action-primary-pressed)] active:shadow-[var(--button-shadow-pressed)]",
        destructive:
          "border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)] shadow-none hover:bg-[var(--status-error-bg)]",
        outline:
          "border-[var(--border-default)] bg-[var(--action-outline-bg)] text-foreground shadow-[var(--button-shadow-rest)] hover:border-[var(--border-strong)] hover:bg-[var(--action-outline-hover-bg)] hover:shadow-[var(--button-shadow-hover)] active:shadow-[var(--button-shadow-pressed)]",
        secondary:
          "border-none bg-[var(--action-secondary-bg)] text-[var(--action-secondary-fg)] shadow-[var(--button-shadow-rest)] hover:border-[var(--border-strong)]  hover:shadow-[var(--button-shadow-pressed)]",
        ghost: "border-transparent bg-button-ghost-hover-bg text-foreground",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[var(--button-height)] px-4",
        sm: "h-8 gap-1.5 px-3 text-[13px]",
        lg: "h-10 px-5",
        icon: "h-[var(--button-height)] w-[var(--button-height)]",
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
