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
    return {
      dot: "bg-[color-mix(in_srgb,var(--status-warning-text)_72%,white)]",
      capsule:
        "border-[color-mix(in_srgb,var(--border-default)_76%,transparent)] bg-[color-mix(in_srgb,var(--surface-muted)_84%,white)] text-[var(--text-strong)]",
    };
  }
  if (status === "ATTENTION") {
    return {
      dot: "bg-[color-mix(in_srgb,var(--status-error-text)_76%,white)]",
      capsule:
        "border-[color-mix(in_srgb,var(--border-default)_76%,transparent)] bg-[color-mix(in_srgb,var(--surface-muted)_84%,white)] text-[var(--text-strong)]",
    };
  }
  if (status === "PREPARING" || status === "UPDATE_READY" || status === "SYNCING" || status === "RECONNECTING") {
    return {
      dot: "bg-[color-mix(in_srgb,var(--action-primary-bg)_72%,white)]",
      capsule:
        "border-[color-mix(in_srgb,var(--border-default)_76%,transparent)] bg-[color-mix(in_srgb,var(--surface-muted)_84%,white)] text-[var(--text-strong)]",
    };
  }
  return {
    dot: "bg-[color-mix(in_srgb,var(--status-success-text)_72%,white)]",
    capsule:
      "border-[color-mix(in_srgb,var(--border-default)_76%,transparent)] bg-[color-mix(in_srgb,var(--surface-muted)_84%,white)] text-[var(--text-strong)]",
  };
}

export function OfflineStatusIndicator() {
  const { status, statusLabel, pendingCount, blockingCount, syncNow } = useOfflineRuntime();
  const tone = toneClasses(status);

  return (
    <Sheet>
      <div className="inline-flex items-center gap-2">
        <SheetTrigger asChild>
          <button
            type="button"
            className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors hover:bg-[color-mix(in_srgb,var(--surface-muted)_92%,white)] ${tone.capsule}`}
          >
            <span className={`size-1.5 rounded-full ${tone.dot}`} />
            <span>{statusLabel}</span>
            {pendingCount > 0 ? (
              <span className="font-mono tabular-nums text-[var(--text-muted)]">
                {pendingCount}
              </span>
            ) : null}
            {blockingCount > 0 ? (
              <span className="font-mono tabular-nums text-[var(--text-muted)]">
                !{blockingCount}
              </span>
            ) : null}
          </button>
        </SheetTrigger>
        {status !== "SYNCING" && pendingCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3 text-[12px] font-medium text-[var(--text-muted)] hover:text-foreground"
            onClick={() => void syncNow({ force: true })}
          >
            Sync
          </Button>
        ) : null}
      </div>
      <SheetContent
        side="right"
        size="md"
        inset
        className="overflow-hidden bg-[color-mix(in_srgb,var(--surface-base)_96%,white)] p-0 shadow-[var(--shadow-popover)] sm:max-w-[36rem]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Sync and offline</SheetTitle>
          <SheetDescription>
            Current connectivity, warmup readiness, queued sync activity, and app update state.
          </SheetDescription>
        </SheetHeader>
        <OfflineRuntimePanel />
      </SheetContent>
    </Sheet>
  );
}
