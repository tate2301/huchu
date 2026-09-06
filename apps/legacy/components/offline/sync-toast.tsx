"use client";

/**
 * Sync Toast Notifications — huchu App
 *
 * Success: green left border, checkmark, slides in from top
 * Error: red border, shake animation, stays until action
 * Info: blue border, for queued operations
 * Warning: amber border
 * Auto-dismiss with progress bar
 * Stacking support for multiple toasts
 */

import { useEffect, useCallback, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  X,
  Loader2,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/animation/tokens";
import { toastVariants, toastProgressVariants } from "./animations";

// ---------------------------------------------------------------------------
// Toast Store (singleton for stacking)
// ---------------------------------------------------------------------------

export type ToastType = "success" | "error" | "info" | "warning";

export interface SyncToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, undefined = no auto-dismiss
  actionLabel?: string;
  onAction?: () => void;
}

export interface SyncToastProps {
  toasts: SyncToastItem[];
  onDismiss: (id: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Individual Toast
// ---------------------------------------------------------------------------

function ToastItem({
  toast,
  onDismiss,
  index,
}: {
  toast: SyncToastItem;
  onDismiss: (id: string) => void;
  index: number;
}) {
  const prefersReduced = useReducedMotion();
  const [progress, setProgress] = useState(1);

  const handleDismiss = useCallback(() => {
    onDismiss(toast.id);
  }, [toast.id, onDismiss]);

  const handleAction = useCallback(() => {
    toast.onAction?.();
    handleDismiss();
  }, [toast.onAction, handleDismiss]);

  // Auto-dismiss
  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1 - elapsed / toast.duration!);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        handleDismiss();
      }
    }, 50);

    return () => clearInterval(timer);
  }, [toast.duration, handleDismiss]);

  const config = {
    success: {
      icon: <CheckCircle2 size={18} />,
      borderClass: "border-l-[3px] border-l-[var(--success-500,#34C759)]",
      iconColor: "text-[var(--success-500,#34C759)]",
      bgColor: "bg-[var(--success-50,#edf9f2)]",
      shake: false,
    },
    error: {
      icon: <AlertCircle size={18} />,
      borderClass: "border-l-[3px] border-l-[var(--danger-500,#FF453A)]",
      iconColor: "text-[var(--danger-500,#FF453A)]",
      bgColor: "bg-[var(--danger-50,#fef0f1)]",
      shake: true,
    },
    info: {
      icon: <Info size={18} />,
      borderClass: "border-l-[3px] border-l-[var(--info-500,#007AFF)]",
      iconColor: "text-[var(--info-500,#007AFF)]",
      bgColor: "bg-[var(--info-50,#eef7ff)]",
      shake: false,
    },
    warning: {
      icon: <AlertTriangle size={18} />,
      borderClass: "border-l-[3px] border-l-[var(--warning-500,#FF9F0A)]",
      iconColor: "text-[var(--warning-500,#FF9F0A)]",
      bgColor: "bg-[var(--warning-50,#fef6ea)]",
      shake: false,
    },
  }[toast.type];

  return (
    <motion.div
      layout
      variants={prefersReduced ? {} : toastVariants}
      initial="initial"
      animate={config.shake && !prefersReduced ? ["animate", "shake"] : "animate"}
      exit="exit"
      transition={{ ...SPRING.toastEnter, delay: index * 0.05 }}
      className={cn(
        "relative w-full rounded-lg shadow-[var(--shadow-md,0_4px_12px_rgba(0,0,0,0.08))]",
        "border border-[var(--border-subtle,#F0F0F2)]",
        config.borderClass,
        config.bgColor,
        "flex items-start gap-3 px-4 py-3",
      )}
    >
      {/* Icon */}
      <div className={cn("flex-shrink-0 mt-0.5", config.iconColor)}>{config.icon}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[var(--text-primary,#1A1A1E)]">
          {toast.title}
        </p>
        {toast.message && (
          <p className="text-xs text-[var(--text-secondary,#6C6C70)] mt-0.5">
            {toast.message}
          </p>
        )}
        {toast.actionLabel && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={SPRING.micro}
            onClick={handleAction}
            className={cn(
              "mt-2 text-xs font-semibold",
              toast.type === "error"
                ? "text-[var(--danger-500)]"
                : "text-[var(--interactive-primary,#007AFF)]",
            )}
          >
            {toast.actionLabel}
          </motion.button>
        )}
      </div>

      {/* Close button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        transition={SPRING.micro}
        onClick={handleDismiss}
        className="flex-shrink-0 p-1 rounded-md hover:bg-black/5 text-[var(--text-tertiary)] transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </motion.button>

      {/* Progress bar (auto-dismiss) */}
      {toast.duration && toast.duration > 0 && (
        <motion.div
          className={cn(
            "absolute bottom-0 left-0 right-0 h-[2px] rounded-b-lg",
            toast.type === "success" && "bg-[var(--success-500)]",
            toast.type === "error" && "bg-[var(--danger-500)]",
            toast.type === "info" && "bg-[var(--info-500)]",
            toast.type === "warning" && "bg-[var(--warning-500)]",
          )}
          style={{ transformOrigin: "left" }}
          variants={prefersReduced ? {} : toastProgressVariants}
          initial="initial"
          animate="animate"
        />
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Toast Container
// ---------------------------------------------------------------------------

export function SyncToast({ toasts, onDismiss, className = "" }: SyncToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className={cn(
        "fixed top-4 left-4 right-4 z-[100] flex flex-col gap-2 items-center pointer-events-none",
        "sm:left-auto sm:right-4 sm:w-[380px] sm:max-w-full",
        className,
      )}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast, index) => (
          <div key={toast.id} className="w-full pointer-events-auto">
            <ToastItem toast={toast} onDismiss={onDismiss} index={index} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook for managing toasts
// ---------------------------------------------------------------------------

let toastIdCounter = 0;

export function useSyncToast() {
  const [toasts, setToasts] = useState<SyncToastItem[]>([]);

  const addToast = useCallback((toast: Omit<SyncToastItem, "id">) => {
    const id = `toast-${++toastIdCounter}-${Date.now()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback(
    (title: string, message?: string, duration = 4000) => {
      return addToast({ type: "success", title, message, duration });
    },
    [addToast],
  );

  const error = useCallback(
    (title: string, message?: string, actionLabel?: string, onAction?: () => void) => {
      return addToast({
        type: "error",
        title,
        message,
        duration: 0, // Errors don't auto-dismiss
        actionLabel,
        onAction,
      });
    },
    [addToast],
  );

  const info = useCallback(
    (title: string, message?: string, duration = 3000) => {
      return addToast({ type: "info", title, message, duration });
    },
    [addToast],
  );

  const warning = useCallback(
    (title: string, message?: string, duration = 5000) => {
      return addToast({ type: "warning", title, message, duration });
    },
    [addToast],
  );

  const syncing = useCallback(
    (count?: number) => {
      return addToast({
        type: "info",
        title: count ? `Syncing ${count} operations...` : "Syncing...",
        message: "Please don't close the app",
        duration: 0, // No auto-dismiss during sync
      });
    },
    [addToast],
  );

  return { toasts, addToast, dismissToast, success, error, info, warning, syncing };
}
