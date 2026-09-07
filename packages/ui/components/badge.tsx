"use client";

import * as React from "react";
import { Badge as DsBadge, type BadgeTone } from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * Badge — the design system's, behind this repo's older prop names.
 *
 * The DS is the implementation; this file exists only so the ~142 call sites
 * that already say `variant="destructive"` keep working. New code should reach
 * for `Badge` from `@corelithzw/react` directly and use `tone`.
 */
const VARIANT_TO_TONE: Record<string, BadgeTone> = {
  default: "neutral",
  secondary: "neutral",
  neutral: "neutral",
  outline: "outline",
  destructive: "danger",
  danger: "danger",
  success: "success",
  warning: "warn",
  info: "info",
  brand: "brand",
};

export type BadgeVariant = keyof typeof VARIANT_TO_TONE;

export type BadgeProps = Omit<React.ComponentProps<typeof DsBadge>, "tone"> & {
  variant?: BadgeVariant;
  tone?: BadgeTone;
  /** Legacy: a leading dot. The DS has no dot slot, so it is composed here. */
  dot?: boolean;
  dotColor?: string;
};

function Badge({ className, variant, tone, dot, dotColor, children, ...props }: BadgeProps) {
  return (
    <DsBadge tone={tone ?? VARIANT_TO_TONE[variant ?? "default"] ?? "neutral"} className={className} {...props}>
      {dot ? (
        <span
          aria-hidden
          className="mr-1 inline-block size-1.5 rounded-full bg-current"
          style={dotColor ? { backgroundColor: dotColor } : undefined}
        />
      ) : null}
      {children}
    </DsBadge>
  );
}

function BadgeGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("inline-flex flex-wrap items-center gap-1.5", className)} {...props} />;
}

/**
 * Kept so existing `cn(badgeVariants({ variant }))` call sites compile. It
 * returns the DS class plus the tone modifier rather than the old cva output.
 */
function badgeVariants({ variant }: { variant?: BadgeVariant } = {}) {
  return cn("badge", `badge-${VARIANT_TO_TONE[variant ?? "default"] ?? "neutral"}`);
}

export { Badge, BadgeGroup, badgeVariants };
