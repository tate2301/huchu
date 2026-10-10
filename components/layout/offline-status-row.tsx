"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { OfflineRuntimePanel } from "@/components/layout/offline-runtime-panel";
import { useOfflineRuntime } from "@/components/offline/offline-runtime";

export type DeviceTone = "ok" | "warn" | "bad";

/**
 * "This device" in the account menu (00-foundations 5.3.6): one status word
 * and its tone. Anything but Ready also tints the logo tile's dot.
 */
export function useDeviceStatus(): { word: string; tone: DeviceTone; ready: boolean } {
  const { status, showUpdatePrompt } = useOfflineRuntime();
  if (status === "ATTENTION") return { word: "Needs attention", tone: "bad", ready: false };
  if (status === "OFFLINE") return { word: "Offline", tone: "warn", ready: false };
  if (status === "UPDATE_READY" || showUpdatePrompt) return { word: "Update available", tone: "warn", ready: false };
  if (status === "SYNCING" || status === "PREPARING") return { word: "Syncing", tone: "warn", ready: false };
  return { word: "Ready", tone: "ok", ready: true };
}

export const DEVICE_TONE_COLOR: Record<DeviceTone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn-dot)",
  bad: "var(--bad-dot)",
};

/** The device's sync state in full: what is queued, last sync, Sync now. */
export function OfflineStatusDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[34rem] gap-0 overflow-hidden p-0">
        <OfflineRuntimePanel />
      </DialogContent>
    </Dialog>
  );
}
