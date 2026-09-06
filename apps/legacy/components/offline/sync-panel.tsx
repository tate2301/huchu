"use client";

/**
 * Sync Panel — huchu App
 *
 * Slide-down panel showing detailed sync information, pending operations,
 * and controls. Spring animations for open/close with AnimatePresence.
 */

import { useCallback, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  CloudCheck,
  RefreshCw,
  Play,
  PlusCircle,
  Trash2,
  Pencil,
  Clock,
  XCircle,
  RotateCcw,
  Wifi,
  WifiOff,
  ChevronRight,
  AlertTriangle,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { SPRING, STATUS_COLORS } from "@/lib/animation/tokens";
import { syncPanelVariants, staggerContainerVariants, staggerItemVariants } from "./animations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateString: string | null): string {
  if (!dateString) return "Not synced yet";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function operationTypeIcon(operation: string) {
  switch (operation) {
    case "create":
    case "add":
      return <PlusCircle size={16} className="text-[var(--success-500,#30B0C7)]" />;
    case "delete":
    case "remove":
      return <Trash2 size={16} className="text-[var(--danger-500,#FF453A)]" />;
    case "edit":
    case "update":
      return <Pencil size={16} className="text-[var(--info-500,#007AFF)]" />;
    default:
      return <RefreshCw size={16} className="text-[var(--info-500,#5AC8FA)]" />;
  }
}

function statusIcon(status: string, isSyncing: boolean) {
  if (isSyncing) {
    return (
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      >
        <RefreshCw size={16} className="text-[var(--info-500,#5AC8FA)]" />
      </motion.div>
    );
  }
  switch (status) {
    case "QUEUED":
      return <Clock size={16} className="text-[var(--text-tertiary,#A1A1AA)]" />;
    case "SYNCING":
      return (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <RefreshCw size={16} className="text-[var(--info-500,#5AC8FA)]" />
        </motion.div>
      );
    case "FAILED_BLOCKING":
    case "FAILED_RETRYABLE":
      return <XCircle size={16} className="text-[var(--danger-500,#FF453A)] cursor-pointer" />;
    default:
      return <Clock size={16} className="text-[var(--text-tertiary,#A1A1AA)]" />;
  }
}

function statusDetailText(status: string, retryCount?: number): { text: string; color: string } {
  switch (status) {
    case "QUEUED":
      return { text: "queued", color: "var(--text-tertiary,#A1A1AA)" };
    case "SYNCING":
      return { text: "syncing...", color: "var(--info-500,#5AC8FA)" };
    case "FAILED_BLOCKING":
      return { text: "failed (blocking)", color: "var(--danger-500,#FF453A)" };
    case "FAILED_RETRYABLE":
      return { text: `retrying (${retryCount ?? 0}/3)`, color: "var(--warning-500,#FF9F0A)" };
    case "SYNCED":
      return { text: "synced", color: "var(--success-500,#34C759)" };
    default:
      return { text: status.toLowerCase(), color: "var(--text-tertiary,#A1A1AA)" };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SyncPanelProps {
  onClose?: () => void;
}

export function SyncPanel({ onClose }: SyncPanelProps) {
  const offline = useOfflineRuntime();
  const prefersReduced = useReducedMotion();

  const handleSyncNow = useCallback(() => {
    if (!offline.isSyncing && offline.pendingCount > 0) {
      void offline.syncNow({ force: true });
    }
  }, [offline]);

  const handleRetryAll = useCallback(() => {
    void offline.syncNow({ force: true });
  }, [offline]);

  const hasFailedItems = useMemo(
    () => offline.operations.some((op) => op.status === "FAILED_BLOCKING" || op.status === "FAILED_RETRYABLE"),
    [offline.operations],
  );

  const statusColor = offline.isOffline
    ? STATUS_COLORS.offline
    : offline.isSyncing
      ? STATUS_COLORS.syncing
      : offline.pendingCount > 0
        ? STATUS_COLORS.warning
        : STATUS_COLORS.online;

  const statusText = offline.isSyncing
    ? "Syncing now..."
    : offline.isOffline
      ? `${offline.pendingCount} operations pending`
      : offline.pendingCount > 0
        ? `${offline.pendingCount} operations pending`
        : "All synced up";

  return (
    <motion.div
      variants={syncPanelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(
        "absolute top-full right-0 mt-2 z-50 w-[340px] max-w-[calc(100vw-2rem)]",
        "rounded-[var(--card-radius,12px)] border border-[var(--border-subtle,#F0F0F2)]",
        "bg-[var(--bg-elevated,#FFFFFF)] shadow-[var(--shadow-lg,0_8px_24px_rgba(0,0,0,0.10))]",
        "overflow-hidden",
      )}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: statusColor }}
            />
            <span className="text-[13px] font-semibold text-[var(--text-primary,#1A1A1E)] truncate">
              {statusText}
            </span>
          </div>
          <motion.button
            whileTap={prefersReduced ? {} : { scale: 0.95 }}
            transition={SPRING.button}
            onClick={handleSyncNow}
            disabled={offline.isSyncing || offline.pendingCount === 0 || offline.isOffline}
            className={cn(
              "inline-flex items-center gap-1 text-[13px] font-semibold px-2.5 py-1 rounded-lg",
              "text-[var(--interactive-primary,#007AFF)]",
              "disabled:opacity-40 disabled:pointer-events-none",
              "hover:bg-[var(--bg-secondary,#F7F7F9)] transition-colors",
            )}
          >
            {offline.isSyncing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <RefreshCw size={14} />
              </motion.div>
            ) : (
              <Play size={14} />
            )}
            Sync Now
          </motion.button>
        </div>

        {/* Last sync info */}
        <p className="text-xs text-[var(--text-tertiary,#A1A1AA)] mt-1 flex items-center gap-1">
          {offline.isOffline ? (
            <>
              <WifiOff size={12} />
              Working offline
            </>
          ) : (
            <>
              <Wifi size={12} />
              Last synced: {timeAgo(offline.lastSyncedAt)}
            </>
          )}
          {offline.blockingCount > 0 && (
            <span className="text-[var(--danger-500,#FF453A)] font-medium ml-1">
              &middot; {offline.blockingCount} blocking
            </span>
          )}
        </p>
      </div>

      {/* Pending Operations List */}
      {offline.operations.length > 0 && (
        <div className="px-4 pb-2 max-h-[280px] overflow-y-auto">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-tertiary,#A1A1AA)] mb-2">
            Pending Operations
          </p>

          <motion.div
            variants={prefersReduced ? {} : staggerContainerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-2"
          >
            <AnimatePresence>
              {offline.operations.map((op) => {
                const detail = statusDetailText(op.status);
                return (
                  <motion.div
                    key={op.operationId}
                    variants={prefersReduced ? {} : staggerItemVariants}
                    layout
                    className={cn(
                      "rounded-lg bg-[var(--bg-secondary,#F7F7F9)] p-3",
                      "flex items-start gap-2.5",
                    )}
                  >
                    {/* Type icon */}
                    <div className="flex-shrink-0 mt-0.5">{operationTypeIcon(op.operation)}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[var(--text-primary,#1A1A1E)] truncate">
                        {op.label}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary,#A1A1AA)] mt-0.5">
                        {timeAgo(op.createdAt)} &middot;{" "}
                        <span style={{ color: detail.color }}>{detail.text}</span>
                      </p>
                      {op.lastError && (
                        <p className="text-[11px] text-[var(--danger-500,#FF453A)] mt-1 truncate">
                          {op.lastError}
                        </p>
                      )}
                    </div>

                    {/* Status / Retry */}
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                      {statusIcon(op.status, offline.isSyncing && op.status === "SYNCING")}
                      {(op.status === "FAILED_BLOCKING" || op.status === "FAILED_RETRYABLE") && (
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          transition={SPRING.micro}
                          onClick={() => offline.retryOperation(op.operationId)}
                          className="text-[var(--text-tertiary)] hover:text-[var(--interactive-primary)] transition-colors"
                          title="Retry"
                        >
                          <RotateCcw size={14} />
                        </motion.button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      {offline.operations.length === 0 && !offline.isSyncing && (
        <div className="px-4 py-6 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING.bouncy}
            className="w-12 h-12 rounded-full bg-[var(--success-50)] flex items-center justify-center mx-auto mb-2"
          >
            <CloudCheck size={24} className="text-[var(--success-500)]" />
          </motion.div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">All caught up</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {offline.lastSyncedAt
              ? `Last synced ${timeAgo(offline.lastSyncedAt)}`
              : "No operations to sync"}
          </p>
        </div>
      )}

      {/* Footer Actions */}
      {(hasFailedItems || offline.operations.length > 0) && (
        <div className="px-4 py-3 border-t border-[var(--border-subtle,#F0F0F2)] flex items-center justify-between">
          {hasFailedItems && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={SPRING.micro}
              onClick={handleRetryAll}
              disabled={offline.isSyncing || offline.isOffline}
              className={cn(
                "inline-flex items-center gap-1.5 text-[13px] font-medium",
                "text-[var(--text-secondary,#6C6C70)]",
                "disabled:opacity-40 disabled:pointer-events-none",
                "hover:text-[var(--interactive-primary)] transition-colors",
              )}
            >
              <RefreshCw size={14} />
              Retry All
            </motion.button>
          )}
          {offline.isOffline && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--warning-500)]">
              <WifiOff size={12} />
              Will sync when online
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
