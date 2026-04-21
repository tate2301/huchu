import * as React from "react";

import { cn } from "@/lib/utils";
import {
  getUiStatusPresentation,
  type CanonicalUiStatus,
} from "@/lib/ui/status-map";

function tokenVar(token: string): string {
  return `var(--${token})`;
}

export type StatusChipSize = "sm" | "md";
export type StatusChipVariant = "default" | "subtle";

export interface StatusChipProps {
  /** Raw status string or canonical status */
  status: string | CanonicalUiStatus | null | undefined;
  /** Override label text */
  label?: string;
  /** Show the colored dot (default: true) */
  showDot?: boolean;
  /** Size of the chip */
  size?: StatusChipSize;
  /** Visual style variant */
  variant?: StatusChipVariant;
  className?: string;
}

/**
 * StatusChip - Attio-inspired status indicator with pill shape.
 *
 * Maps any status string to a canonical status with appropriate colors.
 * Uses --status-* CSS tokens for consistent theming.
 */
export function StatusChip({
  status,
  label,
  showDot = true,
  size = "md",
  variant = "default",
  className,
}: StatusChipProps) {
  const presentation = getUiStatusPresentation(status);

  const sizeClasses = {
    sm: "h-5 gap-1 px-2 text-[10px]",
    md: "h-6 gap-1.5 px-2.5 text-xs",
  };

  const dotSizes = {
    sm: { w: 4.5, h: 4.5 },
    md: { w: 6, h: 6 },
  };

  const isSubtle = variant === "subtle";

  return (
    <span
      data-slot="status-chip"
      data-status={presentation.status}
      data-tone={presentation.tone}
      data-size={size}
      data-variant={variant}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold leading-none whitespace-nowrap transition-[background-color,color] duration-[var(--motion-duration-fast)]",
        sizeClasses[size],
        isSubtle
          ? "bg-transparent border"
          : "bg-[var(--status-bg)] text-[var(--status-text)]",
        className
      )}
      style={
        {
          ...(isSubtle
            ? {
                color: tokenVar(presentation.tokens.text),
                borderColor: `${tokenVar(presentation.tokens.border)}60`,
              }
            : {
                "--status-bg": tokenVar(presentation.tokens.bg),
                "--status-text": tokenVar(presentation.tokens.text),
              }),
        } as React.CSSProperties
      }
    >
      {showDot ? (
        <span
          className="inline-block rounded-full"
          style={{
            width: dotSizes[size].w,
            height: dotSizes[size].h,
            backgroundColor: tokenVar(presentation.tokens.border),
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      ) : null}
      <span>{label ?? presentation.label}</span>
    </span>
  );
}

export interface StatusDotProps {
  status: StatusChipProps["status"];
  className?: string;
  /** Size of the dot */
  size?: StatusChipSize;
}

/**
 * A simple colored dot representing a status.
 */
export function StatusDot({
  status,
  className,
  size = "md",
}: StatusDotProps) {
  const presentation = getUiStatusPresentation(status);

  const dotSizes = {
    sm: "h-2 w-2",
    md: "h-2.5 w-2.5",
  };

  return (
    <span
      data-slot="status-dot"
      data-status={presentation.status}
      data-tone={presentation.tone}
      className={cn("inline-block rounded-full", dotSizes[size], className)}
      style={{ backgroundColor: tokenVar(presentation.tokens.border) }}
      aria-label={presentation.label}
    />
  );
}
