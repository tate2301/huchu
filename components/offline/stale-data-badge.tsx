"use client";

/**
 * Data Freshness Indicator — huchu App
 *
 * Shows how old cached data is.
 * Green = fresh (< 1h), amber = stale (1-24h), red = very stale (> 24h)
 * Tooltip on hover showing exact timestamp.
 * Gentle pulse when data is stale.
 */

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING, STATUS_COLORS } from "@/lib/animation/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FreshnessLevel = "fresh" | "stale" | "very-stale";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFreshnessLevel(timestamp: string | Date | number | null | undefined): FreshnessLevel {
  if (!timestamp) return "very-stale";
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHour = diffMs / 1000 / 60 / 60;

  if (diffHour < 1) return "fresh";
  if (diffHour < 24) return "stale";
  return "very-stale";
}

function formatFreshnessLabel(timestamp: string | Date | number | null | undefined): string {
  if (!timestamp) return "No data";
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp instanceof Date ? timestamp : new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 1000 / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatExactTimestamp(timestamp: string | Date | number | null | undefined): string {
  if (!timestamp) return "No timestamp";
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface StaleDataBadgeProps {
  timestamp: string | Date | number | null | undefined;
  className?: string;
  showTooltip?: boolean;
  size?: "sm" | "md";
}

export function StaleDataBadge({
  timestamp,
  className = "",
  showTooltip = true,
  size = "sm",
}: StaleDataBadgeProps) {
  const prefersReduced = useReducedMotion();

  const level = useMemo(() => getFreshnessLevel(timestamp), [timestamp]);
  const label = useMemo(() => formatFreshnessLabel(timestamp), [timestamp]);
  const exactTime = useMemo(() => formatExactTimestamp(timestamp), [timestamp]);

  const config = {
    fresh: {
      icon: <CheckCircle2 size={size === "sm" ? 12 : 14} />,
      dotColor: STATUS_COLORS.online,
      textColor: "text-[var(--success-700,#23885c)]",
      bgColor: "bg-[var(--success-50,#edf9f2)]",
      borderColor: "border-[var(--success-100,#d7f1e1)]",
      pulse: false,
    },
    stale: {
      icon: <Clock size={size === "sm" ? 12 : 14} />,
      dotColor: STATUS_COLORS.offline,
      textColor: "text-[var(--warning-700,#9f6523)]",
      bgColor: "bg-[var(--warning-50,#fef6ea)]",
      borderColor: "border-[var(--warning-100,#fde6cb)]",
      pulse: true,
    },
    "very-stale": {
      icon: <AlertTriangle size={size === "sm" ? 12 : 14} />,
      dotColor: STATUS_COLORS.error,
      textColor: "text-[var(--danger-700,#9c2f35)]",
      bgColor: "bg-[var(--danger-50,#fef0f1)]",
      borderColor: "border-[var(--danger-100,#fddde0)]",
      pulse: true,
    },
  }[level];

  const sizeClasses = {
    sm: "h-5 px-1.5 text-[10px] gap-1",
    md: "h-6 px-2 text-[11px] gap-1.5",
  };

  return (
    <div className={cn("relative inline-flex", className)}>
      <motion.div
        whileTap={{ scale: 0.95 }}
        transition={SPRING.micro}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border font-semibold",
          sizeClasses[size],
          config.bgColor,
          config.borderColor,
          config.textColor,
          "cursor-default select-none",
        )}
        title={showTooltip ? `Updated: ${exactTime}` : undefined}
      >
        {/* Status dot */}
        <span className="relative flex-shrink-0">
          <span
            className="block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: config.dotColor }}
          />
          {config.pulse && !prefersReduced && (
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: config.dotColor }}
              animate={{
                scale: [1, 1.8, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}
        </span>

        {/* Icon */}
        <span className="flex-shrink-0 relative z-10">{config.icon}</span>

        {/* Label */}
        <span className="relative z-10 tabular-nums">{label}</span>
      </motion.div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-[var(--text-primary,#1A1A1E)] text-white text-[11px] font-medium whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50 pointer-events-none">
          {exactTime}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[var(--text-primary)]" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline variant (dot + text only, no pill background)
// ---------------------------------------------------------------------------

export interface StaleDataInlineProps {
  timestamp: string | Date | number | null | undefined;
  className?: string;
}

export function StaleDataInline({ timestamp, className = "" }: StaleDataInlineProps) {
  const level = useMemo(() => getFreshnessLevel(timestamp), [timestamp]);
  const label = useMemo(() => formatFreshnessLabel(timestamp), [timestamp]);

  const dotColor = {
    fresh: STATUS_COLORS.online,
    stale: STATUS_COLORS.offline,
    "very-stale": STATUS_COLORS.error,
  }[level];

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[var(--text-tertiary)] text-xs", className)}>
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      <span>Updated {label}</span>
    </span>
  );
}
