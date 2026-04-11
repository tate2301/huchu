"use client";

import { Button } from "@/components/ui/button";
import { OfflineRuntimePanel } from "@/components/layout/offline-runtime-panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useOfflineRuntime } from "@/components/providers/offline-provider";

function toneClasses(status: ReturnType<typeof useOfflineRuntime>["status"]) {
  if (status === "OFFLINE") {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }
  if (status === "PREPARING" || status === "UPDATE_READY") {
    return "border-slate-300 bg-slate-50 text-slate-900";
  }
  if (status === "SYNCING" || status === "RECONNECTING") {
    return "border-blue-300 bg-blue-50 text-blue-900";
  }
  if (status === "ATTENTION") {
    return "border-red-300 bg-red-50 text-red-900";
  }
  return "border-emerald-300 bg-emerald-50 text-emerald-900";
}

export function OfflineStatusIndicator() {
  const { status, statusLabel, pendingCount, blockingCount, syncNow } = useOfflineRuntime();

  return (
    <Sheet>
      <div className="inline-flex items-center gap-2">
        <SheetTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses(status)}`}
          >
            <span>{statusLabel}</span>
            {pendingCount > 0 ? <span className="font-mono">{pendingCount}</span> : null}
            {blockingCount > 0 ? <span className="font-mono">!{blockingCount}</span> : null}
          </button>
        </SheetTrigger>
        {status !== "SYNCING" && pendingCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 rounded-full px-2 text-[11px]"
            onClick={() => void syncNow({ force: true })}
          >
            Sync
          </Button>
        ) : null}
      </div>
      <SheetContent side="right" size="md" inset className="sm:max-w-[34rem]">
        <SheetHeader>
          <SheetTitle>Offline and updates</SheetTitle>
          <SheetDescription>
            Current connectivity, warmup readiness, queued sync activity, and app update state.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5">
          <OfflineRuntimePanel />
        </div>
      </SheetContent>
    </Sheet>
  );
}
