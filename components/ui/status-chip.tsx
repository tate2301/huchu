import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Status Chip Component
 * Displays status with a colored dot + label (not a loud badge)
 *
 * Extracted from design spec:
 * - 8px colored dot
 * - Weight 500 text
 * - Transparent background (unless in dense lists)
 * - Status-based color mapping
 */

export interface StatusChipProps {
  status:
    | "passing"
    | "failing"
    | "need-changes"
    | "in-review"
    | "in-progress"
    | "pending"
    | "inactive"
    | "success"
    | "error"
    | "warning"
    | "info";
  label?: string;
  showDot?: boolean;
  className?: string;
}

const statusConfig = {
  passing: {
    color: "bg-status-success-border",
    text: "text-status-success-text",
    label: "Passing",
  },
  success: {
    color: "bg-status-success-border",
    text: "text-status-success-text",
    label: "Success",
  },
  failing: {
    color: "bg-status-error-border",
    text: "text-status-error-text",
    label: "Failing",
  },
  error: {
    color: "bg-status-error-border",
    text: "text-status-error-text",
    label: "Error",
  },
  "need-changes": {
    color: "bg-status-warning-border",
    text: "text-status-warning-text",
    label: "Need changes",
  },
  warning: {
    color: "bg-status-warning-border",
    text: "text-status-warning-text",
    label: "Warning",
  },
  "in-review": {
    color: "bg-status-info-border",
    text: "text-status-info-text",
    label: "In review",
  },
  info: {
    color: "bg-status-info-border",
    text: "text-status-info-text",
    label: "Info",
  },
  "in-progress": {
    color: "bg-status-progress-border",
    text: "text-status-progress-text",
    label: "In progress",
  },
  pending: {
    color: "bg-status-pending-border",
    text: "text-status-pending-text",
    label: "Pending",
  },
  inactive: {
    color: "bg-status-inactive-border",
    text: "text-status-inactive-text",
    label: "Inactive",
  },
};

export function StatusChip({
  status,
  label,
  showDot = true,
  className,
}: StatusChipProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        config.text,
        className
      )}
    >
      {showDot && (
        <span
          className={cn("h-2 w-2 rounded-full", config.color)}
          aria-hidden="true"
        />
      )}
      <span>{label || config.label}</span>
    </span>
  );
}

/**
 * Status Dot Component
 * Just the colored dot, useful for compact displays
 */
export interface StatusDotProps {
  status: StatusChipProps["status"];
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", config.color, className)}
      aria-label={config.label}
    />
  );
}
