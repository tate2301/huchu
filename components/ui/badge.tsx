import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Attio-inspired badge variants.
 *
 * - Pill shape with generous horizontal padding
 * - Uses --badge-* CSS tokens for consistent theming
 * - Subtle shadow on filled variants for depth
 * - Outline variant: transparent bg + colored border
 * - Subtle variant: lighter background + darker text
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold leading-none transition-[background-color,color,box-shadow,border-color] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0",
  {
    variants: {
      /**
       * Visual style variant.
       * - default/brand: Primary brand color (uses --badge-brand-*)
       * - neutral: Neutral gray (uses --badge-neutral-*)
       * - info: Info blue (uses --badge-info-*)
       * - success: Success green (uses --badge-success-*)
       * - warning: Warning amber (uses --badge-warning-*)
       * - danger: Danger red (uses --badge-danger-*)
       * - outline: Transparent bg + colored border (uses --badge-brand-* for border/text)
       * - subtle: Lighter background + darker text (Attio style)
       */
      variant: {
        default:
          "bg-[var(--badge-brand-bg)] text-[var(--badge-brand-text)] shadow-[0_1px_2px_rgb(16_24_40_/_0.06)]",
        brand:
          "bg-[var(--badge-brand-bg)] text-[var(--badge-brand-text)] shadow-[0_1px_2px_rgb(16_24_40_/_0.06)]",
        neutral:
          "bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)] shadow-[0_1px_2px_rgb(16_24_40_/_0.06)]",
        info:
          "bg-[var(--badge-info-bg)] text-[var(--badge-info-text)] shadow-[0_1px_2px_rgb(16_24_40_/_0.06)]",
        success:
          "bg-[var(--badge-success-bg)] text-[var(--badge-success-text)] shadow-[0_1px_2px_rgb(16_24_40_/_0.06)]",
        warning:
          "bg-[var(--badge-warning-bg)] text-[var(--badge-warning-text)] shadow-[0_1px_2px_rgb(16_24_40_/_0.06)]",
        danger:
          "bg-[var(--badge-danger-bg)] text-[var(--badge-danger-text)] shadow-[0_1px_2px_rgb(16_24_40_/_0.06)]",
        outline:
          "border border-[var(--badge-brand-text)]/25 bg-transparent text-[var(--badge-brand-text)]",
        subtle:
          "bg-[var(--badge-neutral-bg)]/60 text-[var(--neutral-800)] border border-[var(--edge-subtle)]",
      },
      /**
       * Size controls height and font size.
       * - sm: 20px height, 10px font
       * - md: 24px height, 12px font (default)
       * - lg: 28px height, 13px font
       */
      size: {
        sm: "h-5 px-2 text-[10px] tracking-[0.02em]",
        md: "h-6 px-2.5 text-xs tracking-[0.01em]",
        lg: "h-7 px-3 text-[13px] tracking-[0.01em]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

/**
 * Pre-defined outline color variants for the outline style.
 * Maps tone to the correct CSS variable for border/text color.
 */
const outlineToneClasses: Record<string, string> = {
  brand: "border-[var(--badge-brand-text)]/25 text-[var(--badge-brand-text)]",
  neutral:
    "border-[var(--badge-neutral-text)]/25 text-[var(--badge-neutral-text)]",
  info: "border-[var(--badge-info-text)]/25 text-[var(--badge-info-text)]",
  success:
    "border-[var(--badge-success-text)]/25 text-[var(--badge-success-text)]",
  warning:
    "border-[var(--badge-warning-text)]/25 text-[var(--badge-warning-text)]",
  danger:
    "border-[var(--badge-danger-text)]/25 text-[var(--badge-danger-text)]",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Shows a small colored dot before the text when true */
  dot?: boolean;
  /** Color of the dot (CSS color value or variable). Falls back to text color. */
  dotColor?: string;
  /** For outline variant, specify the tone to use for border/text color */
  outlineTone?:
    | "brand"
    | "neutral"
    | "info"
    | "success"
    | "warning"
    | "danger";
}

/**
 * Badge component - Attio-inspired pill badges.
 *
 * Use for status labels, tags, counts, and category indicators.
 * Supports a colored dot prefix, multiple color variants, and three sizes.
 */
function Badge({
  className,
  variant,
  size,
  dot = false,
  dotColor,
  outlineTone = "brand",
  children,
  ...props
}: BadgeProps) {
  const isOutline = variant === "outline";

  return (
    <span
      data-slot="badge"
      data-variant={variant}
      data-size={size}
      className={cn(
        badgeVariants({ variant, size }),
        // For outline variant, apply tone-specific border/text colors
        isOutline && outlineToneClasses[outlineTone],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className="inline-block rounded-full"
          style={{
            width: size === "sm" ? 5 : size === "lg" ? 7 : 6,
            height: size === "sm" ? 5 : size === "lg" ? 7 : 6,
            backgroundColor: dotColor || "currentColor",
            opacity: dotColor ? 1 : 0.7,
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
