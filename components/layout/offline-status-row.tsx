"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { OfflineRuntimePanel } from "@/components/layout/offline-runtime-panel";

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
