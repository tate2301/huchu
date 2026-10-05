"use client";

import type * as React from "react";
import { toast as dsToast, type ToastTone } from "@corelithzw/react";

/**
 * useToast — the app's toast call: `toast({ title, description, variant })`.
 *
 * It writes to the design system's store, which `toaster.tsx` renders one at
 * a time (00-foundations 5.9). `variant` picks the mark: `success` and
 * `default` a check in `--ok`, `warning` a triangle in `--warn` (a partial
 * result), `destructive` an alert in `--bad`. `action` is the one follow-up
 * ("Open", "Undo"). New code may call `toast` from `@corelithzw/react`
 * directly; both land in the same place.
 */
export type ToastVariant = "default" | "success" | "warning" | "destructive";

const VARIANT_TO_TONE: Record<ToastVariant, ToastTone> = {
  default: "default",
  success: "success",
  warning: "warn",
  destructive: "danger",
};

export type ToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss timeout in ms (default 5000). */
  duration?: number;
};

function emit(id: string | undefined, { title, description, variant, action, duration }: ToastInput) {
  return dsToast(title, {
    id,
    description,
    tone: VARIANT_TO_TONE[variant ?? "default"],
    action,
    ...(duration === undefined ? {} : { duration }),
  });
}

function toast(input: ToastInput) {
  const id = emit(undefined, input);
  return {
    id,
    dismiss: () => dsToast.dismiss(id),
    // The store upserts when an id is reused, so an update is a re-emit.
    update: (next: ToastInput) => emit(id, next),
  };
}

function useToast() {
  return { toast, dismiss: (toastId?: string) => dsToast.dismiss(toastId) };
}

export { useToast, toast };
