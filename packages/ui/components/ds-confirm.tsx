"use client";

import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@corelithzw/react";

/**
 * Imperative confirmation built on the design system's `AlertDialog`.
 *
 * `AlertDialog` in `@corelithzw/react` is a declarative compound component with
 * no static `.confirm()` — this is the promise-returning wrapper the app's call
 * sites want, composed from the package's own parts so the dialog is styled and
 * focus-managed entirely by the design system.
 */

export type DsConfirmOptions = {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * `danger` uses the design system's destructive styling. `warning` is a
   * serious-but-reversible action and stays on the neutral treatment — the
   * design system reserves red for the irreversible ones.
   * @default "default"
   */
  variant?: "default" | "warning" | "danger";
};

function ConfirmDialog({
  options,
  onResolve,
}: {
  options: DsConfirmOptions;
  onResolve: (confirmed: boolean) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const destructive = options.variant === "danger";

  // Fires for Escape, overlay dismissal and either button.
  const close = (confirmed: boolean) => {
    setOpen(false);
    onResolve(confirmed);
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && close(false)}>
      <AlertDialogContent destructive={destructive}>
        <AlertDialogTitle>{options.title}</AlertDialogTitle>
        {options.description ? (
          <AlertDialogDescription>{options.description}</AlertDialogDescription>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {options.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction destructive={destructive} onClick={() => close(true)}>
            {options.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Resolves `true` when the user confirms, `false` on cancel, Escape or overlay
 * dismissal. Resolves `false` immediately when called outside the browser.
 */
export function dsConfirm(options: DsConfirmOptions): Promise<boolean> {
  if (typeof document === "undefined") {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    const finish = (confirmed: boolean) => {
      resolve(confirmed);
      // Unmount on a later tick so the closing transition can run, and so we
      // are not tearing down a root from inside its own render pass.
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };

    root.render(<ConfirmDialog options={options} onResolve={finish} />);
  });
}
