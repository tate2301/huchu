"use client";

import { type CSSProperties } from "react";

import { getOfflineStatusTone } from "@/components/layout/offline-status-tone";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { cn } from "@/lib/utils";

function clampedPercent(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export function OfflineStatusIndicator() {
  const { status, bootstrapProgress, showUpdatePrompt } = useOfflineRuntime();
  const tone = getOfflineStatusTone(status);
  const StatusIcon = tone.icon;

  const shouldShow =
    status === "PREPARING" ||
    status === "SYNCING" ||
    status === "RECONNECTING" ||
    status === "OFFLINE" ||
    status === "ATTENTION" ||
    (status === "UPDATE_READY" && showUpdatePrompt);

  if (!shouldShow) {
    return null;
  }

  const startedAtMs = bootstrapProgress?.startedAt
    ? Date.parse(bootstrapProgress.startedAt)
    : Number.NaN;
  const updatedAtMs = bootstrapProgress?.updatedAt
    ? Date.parse(bootstrapProgress.updatedAt)
    : Number.NaN;
  const setupRunningLong =
    status === "PREPARING" &&
    Number.isFinite(startedAtMs) &&
    Number.isFinite(updatedAtMs) &&
    updatedAtMs - startedAtMs > 20_000;
  const percent = clampedPercent(
    bootstrapProgress?.completedSteps ?? 0,
    bootstrapProgress?.totalSteps ?? 0,
  );

  const label = (() => {
    if (status === "PREPARING") {
      return setupRunningLong ? `Setting up ${percent}%` : "Setting up";
    }
    if (status === "SYNCING" || status === "RECONNECTING") {
      return "Updating";
    }
    if (status === "UPDATE_READY") {
      return "Update available";
    }
    if (status === "OFFLINE") {
      return "Offline";
    }
    if (status === "ATTENTION") {
      return "Action needed";
    }
    return tone.text;
  })();

  const isActivityState =
    status === "SYNCING" || status === "RECONNECTING" || status === "PREPARING";

  return (
    <div
      style={{ "--status-chip": `var(${tone.colorVar})` } as CSSProperties}
      className={cn(
        "inline-flex items-center gap-2 pl-4 rounded-lg px-2.5 font-semibold tracking-[-0.01em] py-1.5",
        isActivityState && "bg-surface-muted text-text-muted",
        status === "UPDATE_READY" &&
          " bg-status-success-bg text-status-success-text",
        status === "OFFLINE" &&
          " bg-status-warning-bg text-status-warning-text",
        status === "ATTENTION" && " bg-status-error-bg text-status-error-text",
      )}
    >
      <span>{label}</span>
      <StatusIcon className={cn("size-4", tone.iconClassName)} />
    </div>
  );
}
