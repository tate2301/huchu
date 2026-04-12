"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { Download, Loader2 } from "@/lib/icons";

export function OfflineRuntimeBanner() {
  const {
    bootstrapProgress,
    updateState,
    showUpdatePrompt,
    applyUpdate,
    dismissUpdate,
  } = useOfflineRuntime();

  const isPreparing = bootstrapProgress?.phase === "preparing";
  const progressValue =
    bootstrapProgress && bootstrapProgress.totalSteps > 0
      ? bootstrapProgress.completedSteps
      : 0;
  const progressMax =
    bootstrapProgress && bootstrapProgress.totalSteps > 0
      ? bootstrapProgress.totalSteps
      : 1;

  if (!isPreparing && !showUpdatePrompt && updateState !== "downloading" && updateState !== "activating") {
    return null;
  }

  return (
    <div className="border-b border-[color-mix(in_srgb,var(--edge-subtle)_78%,transparent)] bg-[color-mix(in_srgb,var(--surface-base)_95%,white)] px-4 py-3 md:px-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            <span className="size-1.5 rounded-full bg-[color-mix(in_srgb,var(--action-primary-bg)_72%,white)]" />
            {showUpdatePrompt ? "Update ready" : "Offline setup"}
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {showUpdatePrompt
              ? "A newer version is ready for this device."
              : updateState === "activating"
                ? "Applying the downloaded update."
                : bootstrapProgress?.currentStepLabel ?? "Preparing offline workspace."}
          </div>
          {isPreparing ? (
            <div className="mt-3 max-w-xl">
              <div className="flex items-center gap-3">
                <Progress
                  value={progressValue}
                  max={progressMax}
                  className="h-2 flex-1 border-0 bg-[color-mix(in_srgb,var(--surface-muted)_78%,white)] shadow-none"
                />
                <span className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
                  {bootstrapProgress?.completedSteps ?? 0}/{bootstrapProgress?.totalSteps ?? 0}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              {showUpdatePrompt
                ? "Refresh when the operator is at a safe stopping point. Offline data stays in place."
                : "The runtime is checking, downloading, or activating the new version in the background."}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {showUpdatePrompt ? (
            <>
              <Button type="button" size="sm" onClick={() => void applyUpdate()}>
                <Download className="size-4" />
                Refresh now
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={dismissUpdate}>
                Later
              </Button>
            </>
          ) : updateState === "downloading" || updateState === "activating" ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--surface-muted)_82%,white)] px-3 py-1.5 text-sm text-[var(--text-muted)]">
              <Loader2 className="size-4 animate-spin text-[var(--action-primary-bg)]" />
              {updateState === "activating" ? "Activating update" : "Downloading update"}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
