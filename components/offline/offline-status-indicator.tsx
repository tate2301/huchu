"use client";

/**
 * Offline Status Indicator — huchu App
 *
 * A compact, pill-shaped indicator showing sync status.
 * Tapping expands the full Sync Panel.
 * States: online, offline, syncing, queued, error.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  CloudCheck,
  CloudOff,
  Loader2,
  Layers,
  AlertTriangle,
  ChevronDown,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { SPRING, STATUS_COLORS } from "@/lib/animation/tokens";
import { statusPillVariants, chevronVariants } from "./animations";
import { SyncPanel } from "./sync-panel";

// ---------------------------------------------------------------------------
// Status Config
// ---------------------------------------------------------------------------

type IndicatorStatus = "ONLINE" | "OFFLINE" | "SYNCING" | "QUEUED" | "ERROR";
type ExtendedIndicatorStatus =
  | IndicatorStatus
  | "PREPARING"
  | "RECONNECTING"
  | "UPDATE_READY";

interface StatusConfig {
  icon: React.ReactNode;
  label: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  role: "status" | "alert";
  expandable: boolean;
  animate?: "pulse" | "spin" | "bob" | "shake";
}

function getStatusConfig(
  status: ExtendedIndicatorStatus,
  pendingCount: number,
): StatusConfig {
  switch (status) {
    case "ONLINE":
      return {
        icon: <CloudCheck size={14} />,
        label: "ONLINE",
        bgColor: STATUS_COLORS.onlineBg,
        borderColor: STATUS_COLORS.onlineBorder,
        textColor: STATUS_COLORS.online,
        role: "status",
        expandable: false,
        animate: "pulse",
      };
    case "OFFLINE":
      return {
        icon: <CloudOff size={14} />,
        label: "OFFLINE",
        bgColor: STATUS_COLORS.offlineBg,
        borderColor: STATUS_COLORS.offlineBorder,
        textColor: STATUS_COLORS.offline,
        role: "status",
        expandable: true,
        animate: "bob",
      };
    case "SYNCING":
      return {
        icon: <Loader2 size={14} />,
        label: "SYNCING...",
        bgColor: STATUS_COLORS.syncingBg,
        borderColor: STATUS_COLORS.syncingBorder,
        textColor: STATUS_COLORS.syncing,
        role: "status",
        expandable: false,
        animate: "spin",
      };
    case "PREPARING":
      return {
        icon: <Loader2 size={14} />,
        label: "SETTING UP...",
        bgColor: STATUS_COLORS.syncingBg,
        borderColor: STATUS_COLORS.syncingBorder,
        textColor: STATUS_COLORS.syncing,
        role: "status",
        expandable: false,
        animate: "spin",
      };
    case "RECONNECTING":
      return {
        icon: <Loader2 size={14} />,
        label: "RECONNECTING...",
        bgColor: STATUS_COLORS.syncingBg,
        borderColor: STATUS_COLORS.syncingBorder,
        textColor: STATUS_COLORS.syncing,
        role: "status",
        expandable: false,
        animate: "spin",
      };
    case "QUEUED":
      return {
        icon: <Layers size={14} />,
        label: `${pendingCount} QUEUED`,
        bgColor: STATUS_COLORS.queuedBg,
        borderColor: STATUS_COLORS.queuedBorder,
        textColor: STATUS_COLORS.queued,
        role: "status",
        expandable: true,
        animate: undefined,
      };
    case "ERROR":
      return {
        icon: <AlertTriangle size={14} />,
        label: "SYNC ERROR",
        bgColor: STATUS_COLORS.errorBg,
        borderColor: STATUS_COLORS.errorBorder,
        textColor: STATUS_COLORS.error,
        role: "alert",
        expandable: true,
        animate: "shake",
      };
    case "UPDATE_READY":
      return {
        icon: <CloudCheck size={14} />,
        label: "UPDATE READY",
        bgColor: STATUS_COLORS.onlineBg,
        borderColor: STATUS_COLORS.onlineBorder,
        textColor: STATUS_COLORS.online,
        role: "status",
        expandable: false,
        animate: undefined,
      };
    default:
      return {
        icon: <CloudCheck size={14} />,
        label: "ONLINE",
        bgColor: STATUS_COLORS.onlineBg,
        borderColor: STATUS_COLORS.onlineBorder,
        textColor: STATUS_COLORS.online,
        role: "status",
        expandable: false,
        animate: "pulse",
      };
  }
}

// ---------------------------------------------------------------------------
// Status Icon Wrapper (with animations)
// ---------------------------------------------------------------------------

function StatusIcon({
  config,
  prefersReduced,
}: {
  config: StatusConfig;
  prefersReduced: boolean | null;
}) {
  if (prefersReduced) {
    return <span className="flex-shrink-0">{config.icon}</span>;
  }

  switch (config.animate) {
    case "spin":
      return (
        <motion.span
          className="flex-shrink-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          {config.icon}
        </motion.span>
      );
    case "bob":
      return (
        <motion.span
          className="flex-shrink-0"
          animate={{ y: [0, -1.5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          {config.icon}
        </motion.span>
      );
    case "shake":
      return (
        <motion.span
          className="flex-shrink-0"
          animate={{ x: [0, -2, 2, -2, 2, 0] }}
          transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 5 }}
        >
          {config.icon}
        </motion.span>
      );
    case "pulse":
      return (
        <motion.span
          className="flex-shrink-0"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 8 }}
        >
          {config.icon}
        </motion.span>
      );
    default:
      return <span className="flex-shrink-0">{config.icon}</span>;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface OfflineStatusIndicatorProps {
  className?: string;
  compact?: boolean;
}

export function OfflineStatusIndicator({
  className = "",
  compact = false,
}: OfflineStatusIndicatorProps) {
  const offline = useOfflineRuntime();
  const [isExpanded, setIsExpanded] = useState(false);
  const prefersReduced = useReducedMotion();

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Determine indicator status from offline context
  let indicatorStatus: ExtendedIndicatorStatus = "ONLINE";
  if (offline.status === "PREPARING") {
    indicatorStatus = "PREPARING";
  } else if (offline.isOffline) {
    indicatorStatus = "OFFLINE";
  } else if (offline.status === "SYNCING" || offline.isSyncing) {
    indicatorStatus = "SYNCING";
  } else if (offline.status === "RECONNECTING") {
    indicatorStatus = "RECONNECTING";
  } else if (offline.status === "UPDATE_READY") {
    indicatorStatus = "UPDATE_READY";
  } else if (offline.pendingCount > 0) {
    indicatorStatus = "QUEUED";
  } else if (offline.status === "ATTENTION") {
    indicatorStatus = "ERROR";
  }

  const config = getStatusConfig(indicatorStatus, offline.pendingCount);
  const height = compact ? "h-7" : "h-8";

  return (
    <div className={cn("relative inline-flex flex-col items-end", className)}>
      {/* Status Pill */}
      <motion.button
        variants={statusPillVariants}
        initial="initial"
        animate="animate"
        whileTap={config.expandable ? "tap" : undefined}
        onClick={config.expandable ? handleToggle : undefined}
        role={config.role}
        aria-live="polite"
        aria-expanded={config.expandable ? isExpanded : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-[0.04em] select-none outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          height,
          compact ? "px-2.5 text-[11px]" : "px-3 text-[11px]",
          config.expandable && "cursor-pointer",
          !config.expandable && "cursor-default",
        )}
        style={{
          backgroundColor: config.bgColor,
          borderColor: config.borderColor,
          color: config.textColor,
          minWidth: compact ? 90 : 100,
          maxWidth: 160,
        }}
      >
        <StatusIcon config={config} prefersReduced={prefersReduced} />
        <span className="truncate">{config.label}</span>
        {config.expandable && (
          <motion.span
            variants={chevronVariants}
            animate={isExpanded ? "open" : "closed"}
            className="flex-shrink-0 ml-0.5"
          >
            <ChevronDown size={12} />
          </motion.span>
        )}
      </motion.button>

      {/* Expanded Sync Panel */}
      <AnimatePresence>
        {isExpanded && config.expandable && (
          <SyncPanel onClose={() => setIsExpanded(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
