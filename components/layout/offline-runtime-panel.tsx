"use client";

import { type CSSProperties } from "react";

import {
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { getOfflineStatusTone } from "@/components/layout/offline-status-tone";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { Loader2 } from "@/lib/icons";
import { cn } from "@/lib/utils";

function formatTimestamp(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return date.toLocaleString();
}

function getStatusMessage(
  status: ReturnType<typeof useOfflineRuntime>["status"],
  pendingCount: number,
  blockingCount: number,
) {
  if (status === "OFFLINE") {
    return "This device is offline. Saved work will stay here until the connection comes back.";
  }
  if (status === "PREPARING") {
    return "The device is still getting its offline data ready. Keep the app open until setup finishes.";
  }
  if (status === "SYNCING") {
    return pendingCount > 0
      ? `Sending ${pendingCount} queued change${pendingCount === 1 ? "" : "s"} now.`
      : "Sending queued changes now.";
  }
  if (status === "RECONNECTING") {
    return "The connection is returning. Queued work will resume once the link is stable.";
  }
  if (status === "ATTENTION") {
    return blockingCount > 0
      ? `${blockingCount} queued item${blockingCount === 1 ? "" : "s"} need review before they can sync.`
      : "A few queued changes need review before they can sync.";
  }
  if (status === "UPDATE_READY") {
    return "This device is ready to sync. A newer app version can be applied when you have a safe moment.";
  }
  return "This device is ready for normal offline work.";
}

function SummaryItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-medium text-[var(--text-strong)]",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function StatusChip({
  colorVar,
  icon: Icon,
  label,
  iconClassName,
}: {
  colorVar: string;
  icon: ReturnType<typeof getOfflineStatusTone>["icon"];
  label: string;
  iconClassName?: string;
}) {
  return (
    <div
      style={{ "--status-chip": `var(${colorVar})` } as CSSProperties}
      className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--status-chip)_18%,var(--surface-base))] px-2.5 py-2 pr-3.5 text-sm font-semibold text-[var(--status-chip)]"
    >
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--status-chip)] text-[var(--surface-base)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--status-chip)_18%,transparent)]">
        <Icon className={cn("size-4", iconClassName)} />
      </span>
      <span className="leading-none">{label}</span>
    </div>
  );
}

export function OfflineRuntimePanel() {
  const {
    status,
    canInstallApp,
    pendingCount,
    blockingCount,
    preparedModules,
    bootstrapProgress,
    lastSyncedAt,
    updateState,
    syncNow,
    applyUpdate,
    installApp,
  } = useOfflineRuntime();

  const statusTone = getOfflineStatusTone(status);
  const readyModules = preparedModules.filter(
    (modulePreparation) => modulePreparation.state === "PREPARED",
  ).length;
  const unreadyModules = preparedModules.filter(
    (modulePreparation) => modulePreparation.state !== "PREPARED",
  );
  const bootstrapProgressValue =
    bootstrapProgress && bootstrapProgress.totalSteps > 0
      ? Math.round(
          (bootstrapProgress.completedSteps / bootstrapProgress.totalSteps) * 100,
        )
      : 0;
  const stillPreparingLabels = unreadyModules
    .slice(0, 3)
    .map((modulePreparation) => modulePreparation.primaryFlowLabel);
  const showReadiness =
    preparedModules.length > 0 &&
    (bootstrapProgress !== null || unreadyModules.length > 0);
  const showUpdateCard =
    updateState === "ready" ||
    updateState === "downloading" ||
    updateState === "activating";
  const showInstallCard = canInstallApp;

  return (
    <div className="flex flex-col">
      <DialogHeader className="gap-3 border-b border-[color-mix(in_srgb,var(--border-default)_72%,transparent)] px-6 py-6 pr-14">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="text-[1.35rem] font-semibold tracking-[-0.025em] text-[var(--text-strong)]">
              Device sync
            </DialogTitle>
            <p className="mt-2 max-w-[52ch] text-sm leading-6 text-[var(--text-muted)]">
              {getStatusMessage(status, pendingCount, blockingCount)}
            </p>
          </div>
          <StatusChip
            colorVar={statusTone.colorVar}
            icon={statusTone.icon}
            iconClassName={statusTone.iconClassName}
            label={statusTone.text}
          />
        </div>
      </DialogHeader>

      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="rounded-[18px] bg-[color-mix(in_srgb,var(--surface-muted)_74%,white)] px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryItem label="Queued changes" value={pendingCount} mono />
            <SummaryItem label="Need review" value={blockingCount} mono />
            <SummaryItem label="Last synced" value={formatTimestamp(lastSyncedAt)} mono />
          </div>
        </div>

        {showReadiness ? (
          <div className="rounded-[18px] bg-[color-mix(in_srgb,var(--surface-muted)_66%,white)] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-[var(--text-strong)]">
                  Offline readiness
                </h3>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                  {unreadyModules.length > 0
                    ? `Ready on ${readyModules} of ${preparedModules.length} enabled flow${
                        preparedModules.length === 1 ? "" : "s"
                      }.`
                    : `All ${preparedModules.length} enabled flow${
                        preparedModules.length === 1 ? " is" : "s are"
                      } ready on this device.`}
                </p>
              </div>
              {bootstrapProgress ? (
                <span className="rounded-full bg-[color-mix(in_srgb,var(--surface-base)_72%,white)] px-3 py-1 text-xs font-mono tabular-nums text-[var(--text-muted)]">
                  {bootstrapProgressValue}%
                </span>
              ) : null}
            </div>
            {bootstrapProgress ? (
              <div className="mt-4">
                <Progress
                  value={bootstrapProgress.completedSteps}
                  max={Math.max(bootstrapProgress.totalSteps, 1)}
                  className="h-2 border-0 bg-[color-mix(in_srgb,var(--surface-base)_78%,white)] shadow-none"
                />
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {bootstrapProgress.currentStepLabel ?? "Preparing offline data."}
                </p>
              </div>
            ) : null}
            {stillPreparingLabels.length > 0 ? (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Still preparing: {stillPreparingLabels.join(", ")}
                {unreadyModules.length > stillPreparingLabels.length ? ", and more." : "."}
              </p>
            ) : null}
          </div>
        ) : null}

        {showUpdateCard || showInstallCard ? (
          <div className="rounded-[18px] bg-[color-mix(in_srgb,var(--surface-muted)_66%,white)] px-4 py-4">
            {showUpdateCard ? (
              <div className={cn("flex items-start justify-between gap-3", showInstallCard && "pb-4")}>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-[var(--text-strong)]">
                    App update
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                    {updateState === "ready"
                      ? "A newer version is ready. Refresh when the operator reaches a safe stopping point."
                      : updateState === "activating"
                        ? "Applying the downloaded update now."
                        : "Downloading the latest version in the background."}
                  </p>
                </div>
                {updateState === "ready" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => void applyUpdate()}>
                    Apply update
                  </Button>
                ) : (
                  <StatusChip
                    colorVar="--action-primary-bg"
                    icon={Loader2}
                    label={updateState === "activating" ? "Updating" : "Downloading"}
                    iconClassName="motion-safe:animate-spin"
                  />
                )}
              </div>
            ) : null}

            {showUpdateCard && showInstallCard ? (
              <Separator className="bg-[color-mix(in_srgb,var(--border-default)_70%,transparent)]" />
            ) : null}

            {showInstallCard ? (
              <div className={cn("flex items-start justify-between gap-3", showUpdateCard && "pt-4")}>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-[var(--text-strong)]">
                    Install on this device
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                    Install the app for quicker launch and better offline reliability on this device.
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => void installApp()}>
                  Install app
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogFooter className="border-t border-[color-mix(in_srgb,var(--border-default)_72%,transparent)] px-6 py-4 sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          Queued changes stay on the device until they can sync safely.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <DialogClose className="inline-flex h-9 items-center justify-center rounded-[var(--button-radius)] px-3 text-sm font-semibold text-[var(--text-muted)] transition-[background-color,color] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)] hover:bg-[var(--button-ghost-hover-bg)] hover:text-[var(--text-strong)] focus:outline-none focus:ring-2 focus:ring-ring/20">
            Close
          </DialogClose>
          {status !== "SYNCING" ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void syncNow({ force: true })}
            >
              Sync now
            </Button>
          ) : null}
        </div>
      </DialogFooter>
    </div>
  );
}
