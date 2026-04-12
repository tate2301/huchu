"use client";

import { type CSSProperties } from "react";

import { getOfflineStatusTone } from "@/components/layout/offline-status-tone";
import { useOfflineRuntime } from "@/components/providers/offline-provider";

function clampedPercent(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export function OfflineStatusIndicator() {
  const { status, pendingCount, blockingCount, bootstrapProgress } = useOfflineRuntime();
  const tone = getOfflineStatusTone(status);
  const StatusIcon = tone.icon;

  const shouldShow = status !== "ONLINE" || blockingCount > 0 || pendingCount > 0;
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

  const label =
    status === "PREPARING"
      ? setupRunningLong
        ? `Setting up ${percent}%`
        : "Setting up"
      : status === "SYNCING" || status === "RECONNECTING"
        ? "Updating"
        : status === "OFFLINE"
          ? "Offline"
          : status === "ATTENTION"
            ? "Needs attention"
            : tone.text;

  const useMutedSurface =
    status === "SYNCING" ||
    status === "RECONNECTING" ||
    status === "PREPARING";

  return (
    <div
      style={{ "--status-chip": `var(${tone.colorVar})` } as CSSProperties}
      className={[
        "inline-flex h-9 items-center gap-2 rounded-full px-2.5 pr-3 text-sm font-medium",
        useMutedSurface
          ? "border border-[color-mix(in_srgb,var(--border-default)_76%,transparent)] bg-[color-mix(in_srgb,var(--surface-muted)_84%,white)] text-[var(--text-muted)]"
          : "bg-[color-mix(in_srgb,var(--status-chip)_14%,var(--surface-base))] text-[var(--status-chip)]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex size-5 items-center justify-center rounded-full",
          useMutedSurface
            ? "bg-[color-mix(in_srgb,var(--surface-base)_88%,white)] text-[var(--text-muted)]"
            : "bg-[var(--status-chip)] text-[var(--surface-base)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--status-chip)_18%,transparent)]",
        ].join(" ")}
      >
        <StatusIcon
          className={[
            "size-3.5",
            tone.iconClassName ?? "",
          ].join(" ")}
        />
      </span>
      <span>{label}</span>
    </div>
  );
}
