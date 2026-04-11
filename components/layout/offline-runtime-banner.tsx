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
    <div className="border-b border-[var(--edge-subtle)] bg-[color-mix(in_srgb,var(--surface-base)_94%,white)] px-3 py-2 md:px-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-base)_82%,white)] px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {showUpdatePrompt ? "App update" : "Offline bootstrap"}
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {showUpdatePrompt
              ? "A newer version is ready for this device."
              : updateState === "activating"
                ? "Applying the downloaded update."
                : bootstrapProgress?.currentStepLabel ?? "Preparing offline workspace."}
          </div>
          {isPreparing ? (
            <div className="mt-3 max-w-xl space-y-2">
              <Progress value={progressValue} max={progressMax} />
              <div className="text-xs text-[var(--text-muted)]">
                {bootstrapProgress?.completedSteps ?? 0} of {bootstrapProgress?.totalSteps ?? 0} warmup steps complete
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
              <Button type="button" size="sm" variant="outline" onClick={dismissUpdate}>
                Later
              </Button>
            </>
          ) : updateState === "downloading" || updateState === "activating" ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-muted)]">
              <Loader2 className="size-4 animate-spin text-[var(--action-primary-bg)]" />
              {updateState === "activating" ? "Activating update" : "Downloading update"}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
