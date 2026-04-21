import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Attio-inspired card variants.
 *
 * - default: Subtle border + very soft shadow (refined surfaces)
 * - ghost: No border/shadow, clean background only
 * - elevated: Stronger shadow for emphasis
 *
 * Hoverable cards get a subtle lift with shadow increase on hover.
 */
const cardVariants = cva(
  "bg-card text-card-foreground relative isolate flex flex-col rounded-[12px] transition-[box-shadow,transform,border-color] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)]",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--edge-default)] shadow-[var(--card-shadow-rest)]",
        ghost: "border-0 shadow-none",
        elevated:
          "border border-[var(--edge-default)] shadow-[var(--elevation-3)]",
      },
      hoverable: {
        true: "cursor-pointer hover:shadow-[var(--elevation-3)] hover:-translate-y-[1px] active:translate-y-0 active:shadow-[var(--card-shadow-rest)]",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      hoverable: false,
    },
  }
);

export interface CardProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof cardVariants> {}

/**
 * Card component - Attio-inspired with refined surface treatment.
 *
 * Features:
 * - 12px rounded corners (medium rounded)
 * - Subtle border + very soft shadow (default variant)
 * - Hoverable variant with lift effect
 * - Generous padding via CardHeader/CardContent/CardFooter
 */
function Card({
  className,
  variant = "default",
  hoverable = false,
  ...props
}: CardProps) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      data-hoverable={hoverable ? "true" : undefined}
      className={cn(cardVariants({ variant, hoverable, className }))}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-[var(--section-gutter-x)] pt-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:border-[var(--card-divider)] [.border-b]:pb-4",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-[var(--type-section-title-size)] font-bold tracking-[-0.02em] text-[var(--text-strong)] leading-tight",
        className
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        "text-sm leading-relaxed text-[var(--text-muted)]",
        className
      )}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-[var(--section-gutter-x)] pb-4", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-2 px-[var(--section-gutter-x)] pb-4 [.border-t]:border-[var(--card-divider)] [.border-t]:pt-4",
        className
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
};
