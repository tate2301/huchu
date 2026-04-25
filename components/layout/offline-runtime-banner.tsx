"use client";

import { type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { Clock, CloudArrowDown, Spinner } from "@/lib/icons";

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

  if (
    !isPreparing &&
    !showUpdatePrompt &&
    updateState !== "activating"
  ) {
    return null;
  }

  const bannerTone = showUpdatePrompt
    ? {
        colorVar: "--action-primary-bg",
        icon: CloudArrowDown,
        text: "Update available",
        iconClassName: "",
      }
    : updateState === "activating"
      ? {
          colorVar: "--action-primary-bg",
          icon: Spinner,
          text: "Activating update",
          iconClassName: "motion-safe:animate-spin",
        }
      : {
          colorVar: "--action-primary-bg",
          icon: Clock,
          text: "Offline setup",
          iconClassName: "",
        };
  const BannerIcon = bannerTone.icon;

  return (
    <div className="border-b border-[color-mix(in_srgb,var(--edge-subtle)_78%,transparent)] bg-[color-mix(in_srgb,var(--surface-base)_95%,white)] px-4 py-3 md:px-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div
            style={{ "--status-chip": `var(${bannerTone.colorVar})` } as CSSProperties}
            className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--status-chip)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-muted)_82%,white)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]"
          >
            <BannerIcon className={["size-3", bannerTone.iconClassName].join(" ")} />
            {bannerTone.text}
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {showUpdatePrompt
              ? "A newer version is ready for this device."
              : updateState === "activating"
                ? "Applying the downloaded update."
                : bootstrapProgress?.currentStepLabel ??
                  "Preparing offline workspace."}
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
                  {bootstrapProgress?.completedSteps ?? 0}/
                  {bootstrapProgress?.totalSteps ?? 0}
                </span>
              </div>
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                {(bootstrapProgress?.completedSteps ?? 0) ===
                (bootstrapProgress?.totalSteps ?? 0)
                  ? "Core offline setup is ready."
                  : `${bootstrapProgress?.completedSteps ?? 0} of ${
                      bootstrapProgress?.totalSteps ?? 0
                    } setup steps ready.`}
              </div>
            </div>
          ) : (
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              {showUpdatePrompt
                ? "Refresh when the operator is at a safe stopping point. Offline data stays in place."
                : "Applying the downloaded update now."}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {showUpdatePrompt ? (
            <>
              <Button type="button" size="sm" onClick={() => void applyUpdate()}>
                <CloudArrowDown className="size-4" />
                Refresh now
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={dismissUpdate}
              >
                Later
              </Button>
            </>
          ) : updateState === "activating" ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--surface-muted)_82%,white)] px-3 py-1.5 text-sm text-[var(--text-muted)]">
              <Spinner className="size-4 animate-spin text-[var(--action-primary-bg)]" />
              Activating update
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
