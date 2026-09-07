"use client";

import * as React from "react";
import { toast as dsToast, useToasts, type ToastTone } from "@corelithzw/react";

import type { ToastProps, ToastActionElement } from "./toast";

/**
 * useToast — the design system's toast store, behind this repo's older shape.
 *
 * 134 files call `const { toast } = useToast()` and then `toast({ title,
 * description, variant })`, so that object-argument signature is preserved
 * exactly rather than migrated call site by call site. The DS takes
 * `toast(title, { description, tone })` and returns a bare id string; this
 * module does the translation in both directions.
 *
 * Behaviour that changes, deliberately:
 *   - The old store closed a toast visually and only garbage-collected it five
 *     minutes later. The DS drives both from one `duration` (default 5s), and
 *     pauses the countdown while the pointer is over the toast.
 *   - The stack renders oldest-first at the top rather than newest-first.
 *
 * New code should import `toast` from `@corelithzw/react` directly.
 */
const VARIANT_TO_TONE: Record<string, ToastTone> = {
  default: "default",
  success: "success",
  warning: "warn",
  destructive: "danger",
};

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type ToastInput = Omit<ToasterToast, "id">;

interface State {
  toasts: ToasterToast[];
}

/**
 * The DS action is data (`{ label, onClick }`); the local one was a React
 * element. No call site in this repo passes one, but the shape is read off the
 * element's props rather than dropped outright so anything that does keeps
 * working.
 */
function toActionData(action: ToastActionElement | undefined) {
  if (!React.isValidElement(action)) return undefined;
  const props = action.props as { children?: React.ReactNode; onClick?: () => void };
  if (typeof props.children !== "string" || !props.onClick) return undefined;
  return { label: props.children, onClick: props.onClick };
}

function emit(id: string | undefined, { title, description, variant, action, duration }: ToastInput) {
  return dsToast(title, {
    id,
    description,
    tone: VARIANT_TO_TONE[variant ?? "default"] ?? "default",
    action: toActionData(action),
    ...(duration === undefined ? {} : { duration }),
  });
}

function toast(props: ToastInput) {
  const id = emit(undefined, props);

  return {
    id,
    dismiss: () => dsToast.dismiss(id),
    // The DS store upserts when an id is reused, so an update is just a
    // re-emit under the same id.
    update: (next: ToasterToast) => emit(id, next),
  };
}

function useToast(): State & {
  toast: typeof toast;
  dismiss: (toastId?: string) => void;
} {
  const entries = useToasts();

  const toasts = React.useMemo<ToasterToast[]>(
    () =>
      entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        open: true,
      })),
    [entries],
  );

  return { toasts, toast, dismiss: (toastId?: string) => dsToast.dismiss(toastId) };
}

export { useToast, toast };
