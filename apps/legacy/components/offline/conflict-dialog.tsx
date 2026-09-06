"use client";

/**
 * Conflict Resolution Dialog — huchu App
 *
 * Dialog showing server vs client changes side-by-side.
 * Server version (read-only) on left.
 * Client version on right.
 * "Accept Server" / "Keep Mine" buttons.
 * Field-level diff highlighting.
 * Spring animation on open.
 */

import { useCallback, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Server, User, Check, X, AlertTriangle, GitCompare } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/animation/tokens";
import { fadeScaleVariants, staggerContainerVariants, staggerItemVariants } from "./animations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConflictField {
  key: string;
  label: string;
  serverValue: string | number | boolean | null;
  clientValue: string | number | boolean | null;
}

export interface ConflictData {
  entityType: string;
  entityId: string;
  entityLabel: string;
  fields: ConflictField[];
  serverUpdatedAt: string;
  clientUpdatedAt: string;
}

export interface ConflictDialogProps {
  isOpen: boolean;
  conflict: ConflictData | null;
  onAcceptServer: (entityId: string) => void;
  onKeepMine: (entityId: string) => void;
  onClose: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Diff Helpers
// ---------------------------------------------------------------------------

function formatValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function valuesEqual(
  a: string | number | boolean | null,
  b: string | number | boolean | null,
): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return String(a) === String(b);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConflictDialog({
  isOpen,
  conflict,
  onAcceptServer,
  onKeepMine,
  onClose,
  className = "",
}: ConflictDialogProps) {
  const prefersReduced = useReducedMotion();

  const handleAcceptServer = useCallback(() => {
    if (conflict) {
      onAcceptServer(conflict.entityId);
    }
  }, [conflict, onAcceptServer]);

  const handleKeepMine = useCallback(() => {
    if (conflict) {
      onKeepMine(conflict.entityId);
    }
  }, [conflict, onKeepMine]);

  const changedFields = useMemo(() => {
    if (!conflict) return [];
    return conflict.fields.filter((f) => !valuesEqual(f.serverValue, f.clientValue));
  }, [conflict]);

  return (
    <AnimatePresence>
      {isOpen && conflict && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-[var(--surface-overlay,rgba(0,0,0,0.35))] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            variants={prefersReduced ? {} : fadeScaleVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              "relative w-full max-w-lg rounded-[var(--card-radius,16px)]",
              "bg-[var(--bg-elevated,#FFFFFF)] shadow-[var(--shadow-xl,0_16px_40px_rgba(0,0,0,0.12))]",
              "border border-[var(--border-subtle,#F0F0F2)]",
              "overflow-hidden",
              className,
            )}
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={SPRING.bouncy}
                  className="w-10 h-10 rounded-full bg-[var(--warning-50,#fef6ea)] flex items-center justify-center flex-shrink-0"
                >
                  <AlertTriangle size={20} className="text-[var(--warning-500)]" />
                </motion.div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary,#1A1A1E)]">
                    Sync Conflict
                  </h2>
                  <p className="text-sm text-[var(--text-secondary,#6C6C70)]">
                    {conflict.entityLabel} &middot;{" "}
                    <span className="capitalize">{conflict.entityType}</span>
                  </p>
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)] mt-3">
                This item was modified on the server after your local changes. Please choose which
                version to keep.
              </p>
            </div>

            {/* Comparison */}
            <motion.div
              variants={prefersReduced ? {} : staggerContainerVariants}
              initial="hidden"
              animate="visible"
              className="px-6 pb-4 space-y-2 max-h-[320px] overflow-y-auto"
            >
              {/* Column headers */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--info-50,#eef7ff)] border border-[var(--info-100)]">
                  <Server size={14} className="text-[var(--info-500)]" />
                  <span className="text-xs font-semibold text-[var(--info-700)]">
                    Server Version
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">
                    {new Date(conflict.serverUpdatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent-50,#edf9f7)] border border-[var(--accent-100)]">
                  <User size={14} className="text-[var(--accent-600)]" />
                  <span className="text-xs font-semibold text-[var(--accent-600)]">
                    Your Changes
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">
                    {new Date(conflict.clientUpdatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Fields */}
              {changedFields.length === 0 ? (
                <div className="text-center py-6 text-sm text-[var(--text-tertiary)]">
                  <GitCompare size={24} className="mx-auto mb-2 opacity-50" />
                  No differences found
                </div>
              ) : (
                changedFields.map((field) => (
                  <motion.div
                    key={field.key}
                    variants={prefersReduced ? {} : staggerItemVariants}
                    className="grid grid-cols-2 gap-3"
                  >
                    {/* Server value */}
                    <div className="px-3 py-2.5 rounded-lg bg-[var(--bg-secondary,#F7F7F9)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                        {field.label}
                      </span>
                      <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">
                        {formatValue(field.serverValue)}
                      </p>
                    </div>

                    {/* Client value (highlighted if different) */}
                    <div className="px-3 py-2.5 rounded-lg bg-[var(--warning-50,#fef6ea)] border border-[var(--warning-200)]">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--warning-600)]">
                        {field.label}
                      </span>
                      <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">
                        {formatValue(field.clientValue)}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center gap-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={SPRING.button}
                onClick={handleAcceptServer}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl",
                  "bg-[var(--info-50,#eef7ff)] text-[var(--info-700)]",
                  "hover:bg-[var(--info-100)] transition-colors",
                  "font-semibold text-sm",
                  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/30",
                )}
              >
                <Server size={16} />
                Accept Server
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={SPRING.button}
                onClick={handleKeepMine}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl",
                  "bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)]",
                  "hover:bg-[var(--action-primary-hover)] transition-colors",
                  "font-semibold text-sm",
                  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/30",
                )}
              >
                <User size={16} />
                Keep Mine
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={SPRING.micro}
                onClick={onClose}
                className={cn(
                  "inline-flex items-center justify-center h-11 w-11 rounded-xl",
                  "bg-[var(--bg-secondary)] text-[var(--text-secondary)]",
                  "hover:bg-[var(--bg-tertiary)] transition-colors",
                  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/30",
                )}
                aria-label="Close"
              >
                <X size={16} />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
