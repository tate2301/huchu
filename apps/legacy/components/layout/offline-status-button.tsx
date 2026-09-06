"use client";

/**
 * The whole offline runtime, behind one quiet icon.
 *
 * ── What this replaces ─────────────────────────────────────────────────────
 *
 * Offline state used to announce itself in two places at once, and both were
 * too loud for what they were saying:
 *
 *  - `OfflineRuntimeBanner` — a full-width block in the document flow, roughly
 *    120px tall, carrying a progress bar for a service-worker cache warm. It
 *    appeared on every page while the device prepared, and the reader could do
 *    nothing about any of it. On the POS terminal — a fixed-height 1024×768
 *    layout — it took that 120px straight out of the selling screen.
 *  - a floating pill pinned bottom-right at `z-70`, which on the till landed
 *    exactly on the keypad's backspace key.
 *
 * Both are gone. This button is the single surface, and `OfflineRuntimePanel`
 * — which was written for this and had been imported by nothing — is what it
 * opens. Everything the banner said is in there, plus queued counts, last sync,
 * per-module readiness and Sync now.
 *
 * ── Why it is always rendered ──────────────────────────────────────────────
 *
 * Even when everything is fine. A control that only exists during trouble is a
 * control nobody can find when they need it, and "is this device synced?" is a
 * question people ask precisely when nothing looks wrong. Idle costs one muted
 * glyph; it earns a tint and a dot only when there is something to say.
 */

import { useState } from "react";

import { Dialog, DialogContent } from "@corelithzw/ui/components/dialog";
import { OfflineRuntimePanel } from "@/components/layout/offline-runtime-panel";
import { getOfflineStatusTone } from "@/components/layout/offline-status-tone";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { cn } from "@corelithzw/ui/lib/utils";

export function OfflineStatusButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { status, pendingCount, blockingCount, showUpdatePrompt } = useOfflineRuntime();

  const tone = getOfflineStatusTone(status);
  const StatusIcon = tone.icon;

  /**
   * Whether this is worth a colour.
   *
   * `SYNCING` and `RECONNECTING` are deliberately absent: they resolve on their
   * own in seconds and a badge that blinks on every background sync is one
   * people learn to stop seeing. What earns attention is a state that persists
   * until somebody acts — the line is down, something will not sync, an update
   * is waiting, or work is queued.
   */
  const notable =
    status === "OFFLINE" ||
    status === "ATTENTION" ||
    showUpdatePrompt ||
    pendingCount > 0 ||
    blockingCount > 0;

  const label = (() => {
    if (blockingCount > 0) {
      return `Device sync — ${blockingCount} item${blockingCount === 1 ? "" : "s"} need review`;
    }
    if (pendingCount > 0) {
      return `Device sync — ${pendingCount} change${pendingCount === 1 ? "" : "s"} queued`;
    }
    return `Device sync — ${tone.text.toLowerCase()}`;
  })();

  /*
    The trigger is a plain button rather than `DialogTrigger`. This repo's
    `Dialog` is the design-system one, not Radix, and its trigger renders its
    own element with no `asChild` to defer to — which would cost the badge dot
    and the tone styling. The dialog is already state-controlled, so opening it
    by hand loses nothing.
  */
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          "relative inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
          "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          className,
        )}
        style={notable ? { color: `var(${tone.colorVar})` } : undefined}
      >
        <StatusIcon className={cn("size-[18px]", tone.iconClassName)} />
        {notable ? (
          <span
            aria-hidden
            /*
              The ring punches the dot out of whatever it sits on. The POS rail
              is near-black, so the colour is a variable the caller can redefine
              rather than a hard-coded light surface.
            */
            className="absolute right-1 top-1 size-1.5 rounded-full ring-2 ring-[var(--offline-dot-ring,var(--surface-base))]"
            style={{ background: `var(${tone.colorVar})` }}
          />
        ) : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/*
          `p-0` because the panel brings its own header, body and footer
          padding — it was built as a dialog body and never mounted in one.
        */}
        <DialogContent className="max-w-[34rem] gap-0 overflow-hidden p-0">
          <OfflineRuntimePanel />
        </DialogContent>
      </Dialog>
    </>
  );
}
