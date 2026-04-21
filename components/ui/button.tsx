"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * CSS-only loading spinner using a conic gradient mask.
 * No external icon library dependency.
 */
function ButtonSpinner({ className }: { className?: string }) {
  return (
    <span
      data-slot="button-spinner"
      className={cn(
        "inline-block h-[1em] w-[1em] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
      aria-hidden="true"
    />
  );
}

/**
 * Attio-inspired button variants.
 *
 * - Generous rounding (10px)
 * - Hover: subtle lift with shadow increase
 * - Active: slight scale down (0.98)
 * - Ghost: clear hover state with bg change
 * - Outline: clean border handling
 * - Loading state: spinner + disabled, width preserved
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-semibold tracking-[0.01em] shadow-none transition-[background-color,color,border-color,box-shadow,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 disabled:shadow-none disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 [&_.material-symbols-rounded]:pointer-events-none [&_.material-symbols-rounded]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] shadow-[var(--button-shadow-rest)] hover:bg-[var(--action-primary-hover)] hover:shadow-[var(--button-shadow-hover)] hover:translate-y-[-1px] active:translate-y-0 active:bg-[var(--action-primary-pressed)] active:shadow-[var(--button-shadow-pressed)]",
        destructive:
          "bg-[var(--action-destructive-bg)] text-[var(--action-destructive-fg)] shadow-[var(--button-shadow-rest)] hover:opacity-90 hover:shadow-[var(--button-shadow-hover)] hover:translate-y-[-1px] active:translate-y-0",
        outline:
          "border border-[var(--border-default)] bg-[var(--action-outline-bg)] text-foreground shadow-[var(--button-shadow-rest)] hover:border-[var(--border-strong)] hover:bg-[var(--action-outline-hover-bg)] hover:shadow-[var(--button-shadow-hover)] hover:translate-y-[-1px] active:translate-y-0 active:shadow-[var(--button-shadow-pressed)]",
        secondary:
          "bg-[var(--action-secondary-bg)] text-[var(--action-secondary-fg)] shadow-[var(--button-shadow-rest)] hover:bg-[var(--action-secondary-hover)] hover:shadow-[var(--button-shadow-hover)] hover:translate-y-[-1px] active:translate-y-0 active:shadow-[var(--button-shadow-pressed)]",
        ghost:
          "border-transparent bg-transparent text-foreground hover:bg-[var(--button-ghost-hover-bg)] hover:shadow-none active:bg-[var(--button-ghost-active-bg)]",
        link: "border-transparent bg-transparent text-[var(--primary)] underline-offset-4 hover:underline hover:translate-y-0 shadow-none active:scale-100",
      },
      /**
       * Button sizes with Attio-inspired heights.
       * - sm: 32px
       * - md: 36px (default)
       * - lg: 40px
       * - xl: 44px (great for mobile primary CTAs)
       * - icon variants: square buttons for icon-only usage
       */
      size: {
        default: "h-9 px-4",
        sm: "h-8 gap-1.5 px-3 text-[13px]",
        md: "h-9 px-4",
        lg: "h-10 px-5",
        xl: "h-11 px-6 text-base",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-md": "h-9 w-9",
        "icon-lg": "h-10 w-10",
        "icon-xl": "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  /** When true, button content is replaced by Slot child */
  asChild?: boolean;
  /** When true, shows a loading spinner and disables the button. Width is preserved. */
  loading?: boolean;
  /** Accessible label for the loading state (announced to screen readers) */
  loadingLabel?: string;
}

/**
 * Button component - Attio-inspired with loading state and refined interactions.
 *
 * Features:
 * - Loading spinner (CSS animation, no icon lib dependency)
 * - Hover lift effect with shadow increase
 * - Active press scale-down
 * - Full focus-visible ring support
 * - asChild pattern for composability
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  loadingLabel = "Loading",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading ? "true" : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-disabled={disabled || loading ? true : undefined}
      aria-busy={loading ? true : undefined}
      {...props}
    >
      {loading ? (
        <>
          <ButtonSpinner />
          {/* Visually hidden label for screen readers */}
          <span className="sr-only">{loadingLabel}</span>
          {/* Original children are visually hidden but maintain layout width */}
          <span className="opacity-0" aria-hidden="true">
            {children}
          </span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants, ButtonSpinner };
