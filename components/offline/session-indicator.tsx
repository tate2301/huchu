"use client";

/**
 * Session Status Indicator — huchu App
 *
 * Shows session expiry info.
 * Normal: subtle text.
 * Warning (expires < 3 days): amber pulse.
 * Critical (expires < 1 day): red pulse + warning icon.
 * Tap to extend session (if online).
 */

import { useMemo, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, AlertTriangle, Shield, RefreshCw } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { SPRING, STATUS_COLORS } from "@/lib/animation/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionUrgency = "normal" | "warning" | "critical";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSessionUrgency(expiresAt: string | null | undefined): SessionUrgency {
  if (!expiresAt) return "normal";
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffHour = diffMs / 1000 / 60 / 60;

  if (diffHour < 24) return "critical";
  if (diffHour < 72) return "warning"; // 3 days
  return "normal";
}

function formatExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "No expiry";
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffHour = Math.floor(diffMs / 1000 / 60 / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffHour < 0) return "Expired";
  if (diffHour < 1) return "Expires soon";
  if (diffHour < 24) return `Expires in ${diffHour}h`;
  if (diffDay < 30) return `Expires in ${diffDay}d`;
  return `Expires ${expiry.toLocaleDateString()}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SessionIndicatorProps {
  expiresAt?: string | null;
  onExtendSession?: () => void;
  className?: string;
  compact?: boolean;
}

export function SessionIndicator({
  expiresAt,
  onExtendSession,
  className = "",
  compact = false,
}: SessionIndicatorProps) {
  const offline = useOfflineRuntime();
  const prefersReduced = useReducedMotion();

  const urgency = useMemo(() => getSessionUrgency(expiresAt), [expiresAt]);
  const label = useMemo(() => formatExpiry(expiresAt), [expiresAt]);
  const canExtend = !offline.isOffline && onExtendSession && urgency !== "normal";

  const config = {
    normal: {
      icon: <Shield size={compact ? 12 : 14} />,
      dotColor: STATUS_COLORS.online,
      textColor: "text-[var(--text-tertiary,#A1A1AA)]",
      bgColor: "bg-transparent",
      borderColor: "border-transparent",
      pulse: false,
    },
    warning: {
      icon: <Clock size={compact ? 12 : 14} />,
      dotColor: STATUS_COLORS.offline,
      textColor: "text-[var(--warning-700,#9f6523)]",
      bgColor: "bg-[var(--warning-50,#fef6ea)]",
      borderColor: "border-[var(--warning-100,#fde6cb)]",
      pulse: true,
    },
    critical: {
      icon: <AlertTriangle size={compact ? 12 : 14} />,
      dotColor: STATUS_COLORS.error,
      textColor: "text-[var(--danger-700,#9c2f35)]",
      bgColor: "bg-[var(--danger-50,#fef0f1)]",
      borderColor: "border-[var(--danger-100,#fddde0)]",
      pulse: true,
    },
  }[urgency];

  const handleExtend = useCallback(() => {
    if (canExtend) {
      onExtendSession();
    }
  }, [canExtend, onExtendSession]);

  if (urgency === "normal" && compact) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]", className)}>
        <Shield size={10} />
        {label}
      </span>
    );
  }

  return (
    <motion.button
      whileTap={canExtend ? { scale: 0.97 } : undefined}
      transition={SPRING.micro}
      onClick={canExtend ? handleExtend : undefined}
      disabled={!canExtend}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium select-none",
        compact ? "h-5 px-2 text-[10px]" : "h-6 px-2.5 text-[11px]",
        config.bgColor,
        config.borderColor,
        config.textColor,
        canExtend && "cursor-pointer hover:brightness-95 transition-[filter]",
        !canExtend && "cursor-default",
        className,
      )}
    >
      {/* Pulse dot */}
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
              duration: urgency === "critical" ? 1.2 : 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </span>

      {/* Icon */}
      <span className="flex-shrink-0 relative z-10">{config.icon}</span>

      {/* Label */}
      <span className="relative z-10 whitespace-nowrap">{label}</span>

      {/* Extend icon */}
      {canExtend && (
        <motion.span
          className="flex-shrink-0 relative z-10"
          animate={{ rotate: [0, -10, 10, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
        >
          <RefreshCw size={10} />
        </motion.span>
      )}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Session Status Panel (expanded info)
// ---------------------------------------------------------------------------

export interface SessionStatusPanelProps {
  expiresAt?: string | null;
  bootstrappedAt?: string | null;
  onExtendSession?: () => void;
  onRebootstrap?: () => void;
  className?: string;
}

export function SessionStatusPanel({
  expiresAt,
  bootstrappedAt,
  onExtendSession,
  onRebootstrap,
  className = "",
}: SessionStatusPanelProps) {
  const offline = useOfflineRuntime();
  const urgency = useMemo(() => getSessionUrgency(expiresAt), [expiresAt]);

  return (
    <div
      className={cn(
        "rounded-[var(--card-radius,12px)] border border-[var(--border-subtle)]",
        "bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] p-4",
        className,
      )}
    >
      {/* Status header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            urgency === "normal" && "bg-[var(--success-50)]",
            urgency === "warning" && "bg-[var(--warning-50)]",
            urgency === "critical" && "bg-[var(--danger-50)]",
          )}
        >
          {urgency === "normal" && <Shield size={20} className="text-[var(--success-500)]" />}
          {urgency === "warning" && <Clock size={20} className="text-[var(--warning-500)]" />}
          {urgency === "critical" && (
            <AlertTriangle size={20} className="text-[var(--danger-500)]" />
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {urgency === "normal" && "Session Active"}
            {urgency === "warning" && "Session Expiring Soon"}
            {urgency === "critical" && "Session Critical"}
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            <SessionIndicator expiresAt={expiresAt} />
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 text-sm">
        {bootstrappedAt && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Last bootstrap</span>
            <span className="text-[var(--text-primary)] font-medium">
              {new Date(bootstrappedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
        {expiresAt && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">Expires at</span>
            <span className="text-[var(--text-primary)] font-medium">
              {new Date(expiresAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-secondary)]">Connection</span>
          <span
            className={cn(
              "font-medium",
              offline.isOffline ? "text-[var(--warning-500)]" : "text-[var(--success-500)]",
            )}
          >
            {offline.isOffline ? "Offline" : "Online"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4 pt-3 border-t border-[var(--border-subtle)]">
        {onExtendSession && !offline.isOffline && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={SPRING.micro}
            onClick={onExtendSession}
            className={cn(
              "flex-1 h-9 rounded-lg text-xs font-semibold",
              "bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)]",
              "hover:bg-[var(--action-primary-hover)] transition-colors",
              "inline-flex items-center justify-center gap-1.5",
            )}
          >
            <RefreshCw size={12} />
            Extend Session
          </motion.button>
        )}
        {onRebootstrap && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={SPRING.micro}
            onClick={onRebootstrap}
            className={cn(
              "flex-1 h-9 rounded-lg text-xs font-semibold",
              "bg-[var(--bg-secondary)] text-[var(--text-secondary)]",
              "hover:bg-[var(--bg-tertiary)] transition-colors",
              "border border-[var(--border-subtle)]",
            )}
          >
            Re-bootstrap
          </motion.button>
        )}
      </div>
    </div>
  );
}
