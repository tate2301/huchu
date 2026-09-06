"use client";

import * as React from "react";

import { X } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Toast — the design system's markup contract, kept compound.
 *
 * The live toast stack is now the DS's: `toaster.tsx` renders `<Toaster />`
 * from `@corelithzw/react` and the store lives in `use-toast.ts`. Nothing
 * outside `components/ui/` imports this file, so the Radix dependency is gone
 * and these are plain elements carrying the DS classes (`.toast`, `.t-title`,
 * `.t-body`, `.t-action`, `.x`, `.toast-viewport`).
 *
 * They are kept for two reasons: `ToastProps` and `ToastActionElement` are the
 * types `use-toast.ts` is written against, and a caller that wants to render a
 * toast body inline still can.
 */
const VARIANT_TO_TONE: Record<string, string | undefined> = {
  default: undefined,
  success: "tone-success",
  warning: "tone-warn",
  destructive: "tone-danger",
};

export type ToastVariant = keyof typeof VARIANT_TO_TONE;

// `title` is omitted from the div props: a toast title is a ReactNode here,
// which collides with the native `title` (a tooltip string).
export type ToastProps = Omit<React.ComponentProps<"div">, "title"> & {
  variant?: ToastVariant;
  /** Auto-dismiss timeout in ms. Read by `use-toast`, not by this element. */
  duration?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const ToastProvider = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

const ToastViewport = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  function ToastViewport({ className, ...props }, ref) {
    return <div ref={ref} className={cn("toast-viewport top-right", className)} {...props} />;
  },
);

const Toast = React.forwardRef<HTMLDivElement, ToastProps>(function Toast(
  { className, variant, duration, open, onOpenChange, ...props },
  ref,
) {
  // Lifecycle props belong to the store, not to this element — pulled out of
  // the spread so React never sees them as DOM attributes.
  void duration;
  void open;
  void onOpenChange;

  return (
    <div
      ref={ref}
      role="status"
      className={cn("toast", VARIANT_TO_TONE[variant ?? "default"], className)}
      {...props}
    />
  );
});

const ToastAction = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
  function ToastAction({ className, ...props }, ref) {
    return <button ref={ref} type="button" className={cn("t-action", className)} {...props} />;
  },
);

const ToastClose = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button">>(
  function ToastClose({ className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label="Dismiss notification"
        className={cn("x", className)}
        {...props}
      >
        <X className="h-4 w-4" />
      </button>
    );
  },
);

const ToastTitle = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  function ToastTitle({ className, ...props }, ref) {
    return <div ref={ref} className={cn("t-title", className)} {...props} />;
  },
);

const ToastDescription = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  function ToastDescription({ className, ...props }, ref) {
    return <div ref={ref} className={cn("t-body", className)} {...props} />;
  },
);

export type ToastActionElement = React.ReactElement<React.ComponentProps<typeof ToastAction>>;

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
