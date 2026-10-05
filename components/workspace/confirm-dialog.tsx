"use client";

import * as React from "react";
import { AlertDialog } from "radix-ui";

import type { Ask } from "@/lib/workspace/ask";
import { Button } from "./button";

/**
 * ConfirmDialog — the confirmation before anything hard to undo (5.8).
 *
 * `role="alertdialog"`, labelled by its title and described by its body
 * (Radix wires both), centred over `--scrim`, 440px (full width less 32 on a
 * phone). Focus starts on keep and Esc keeps. Go runs `onConfirm`: while it
 * runs go shows a spinner and the dialog cannot be dismissed; when it throws,
 * the message shows under the body in `--bad` and the dialog stays; when it
 * resolves, the dialog closes.
 */
export type ConfirmDialogProps = {
  ask: Ask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
};

const FALLBACK_ERROR = "That did not work. Nothing was changed; try again.";

export function ConfirmDialog({ ask, open, onOpenChange, onConfirm }: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const change = (next: boolean) => {
    if (busy) return;
    if (!next) setError(null);
    onOpenChange(next);
  };

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
      onOpenChange(false);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error && caught.message ? caught.message : FALLBACK_ERROR);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={change}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="cx-scrim" />
        <div className="cx-confirm-layer">
          <AlertDialog.Content
            className="cx-confirm"
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <AlertDialog.Title className="cx-confirm__title">
              {ask.title}
            </AlertDialog.Title>
            <AlertDialog.Description className="cx-confirm__body">
              {ask.body}
            </AlertDialog.Description>
            {error ? (
              <p role="alert" className="cx-confirm__error">
                {error}
              </p>
            ) : null}
            <div className="cx-confirm__actions">
              <AlertDialog.Cancel asChild>
                <Button size="field" disabled={busy}>
                  {ask.keep}
                </Button>
              </AlertDialog.Cancel>
              {ask.go ? (
                <Button
                  size="field"
                  variant={ask.fill === "bad" ? "danger-fill" : "primary"}
                  busy={busy}
                  onClick={go}
                >
                  {ask.go}
                </Button>
              ) : null}
            </div>
          </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
