"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import {
  AlertTriangle,
  Clock,
  Download,
  Loader2,
  RefreshCcw,
  ShieldCheck,
} from "@/lib/icons";

function formatTimestamp(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return date.toLocaleString();
}

function moduleStateVariant(state: ReturnType<typeof useOfflineRuntime>["preparedModules"][number]["state"]) {
  if (state === "PREPARED") return "success";
  if (state === "PREPARING") return "info";
  return "warning";
}

function moduleStateLabel(state: ReturnType<typeof useOfflineRuntime>["preparedModules"][number]["state"]) {
  if (state === "PREPARED") return "Prepared";
  if (state === "PREPARING") return "Preparing";
  return "Not ready";
}

export function OfflineRuntimePanel() {
  const {
    status,
    statusLabel,
    pendingCount,
    blockingCount,
    preparedModules,
    bootstrapProgress,
    lastSyncedAt,
    updateState,
    syncNow,
    applyUpdate,
    dismissUpdate,
  } = useOfflineRuntime();

  const bootstrapPercent =
    bootstrapProgress && bootstrapProgress.totalSteps > 0
      ? Math.round(
          (bootstrapProgress.completedSteps / bootstrapProgress.totalSteps) * 100,
        )
      : 0;

  return (
    <div className="flex h-full flex-col gap-4 bg-[color-mix(in_srgb,var(--surface-base)_92%,white)]">
      <Card className="border-[color-mix(in_srgb,var(--border-default)_82%,transparent)] bg-[color-mix(in_srgb,var(--surface-base)_94%,white)] shadow-none">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Offline runtime
              </p>
              <CardTitle className="mt-1 text-xl">{statusLabel}</CardTitle>
            </div>
            <Badge variant={status === "ATTENTION" ? "danger" : status === "OFFLINE" ? "warning" : "neutral"}>
              {status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-base)_86%,white)] px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Pending sync
              </div>
              <div className="mt-1 text-2xl font-semibold">{pendingCount}</div>
            </div>
            <div className="rounded-2xl border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-base)_86%,white)] px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Last sync
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {formatTimestamp(lastSyncedAt)}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-base)_84%,white)] px-3 py-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-[var(--text-muted)]">Connectivity</span>
              <span className="font-medium text-foreground">
                {status === "OFFLINE" ? "Offline" : "Connected"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-[var(--text-muted)]">Blocking failures</span>
              <span className="font-medium text-foreground">{blockingCount}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => void syncNow({ force: true })}>
                <RefreshCcw className="size-4" />
                Sync now
              </Button>
              {updateState === "ready" ? (
                <Button type="button" className="flex-1" onClick={() => void applyUpdate()}>
                  <Download className="size-4" />
                  Refresh
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {bootstrapProgress ? (
        <Card className="border-[color-mix(in_srgb,var(--border-default)_82%,transparent)] bg-[color-mix(in_srgb,var(--surface-base)_95%,white)] shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Prepared workspace
                </p>
                <CardTitle className="mt-1 text-base">
                  {bootstrapProgress.currentStepLabel ?? "Offline packs ready"}
                </CardTitle>
              </div>
              <Badge variant={bootstrapProgress.phase === "preparing" ? "info" : "success"}>
                {bootstrapPercent}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={bootstrapProgress.completedSteps} max={Math.max(bootstrapProgress.totalSteps, 1)} />
            <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
              <span>
                {bootstrapProgress.completedSteps} of {bootstrapProgress.totalSteps} warmup steps
              </span>
              <span>{formatTimestamp(bootstrapProgress.lastPreparedAt ?? null)}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-[color-mix(in_srgb,var(--border-default)_82%,transparent)] bg-[color-mix(in_srgb,var(--surface-base)_95%,white)] shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Primary flows</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {preparedModules.map((modulePreparation) => (
            <div
              key={modulePreparation.moduleId}
              className="rounded-2xl border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-base)_82%,white)] px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">
                    {modulePreparation.primaryFlowLabel}
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {modulePreparation.preparedRoutes.length}/{modulePreparation.totalRoutes} routes ·{" "}
                    {modulePreparation.preparedQueryKeys.length}/{modulePreparation.totalQueries} data packs
                  </div>
                </div>
                <Badge variant={moduleStateVariant(modulePreparation.state)}>
                  {moduleStateLabel(modulePreparation.state)}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {(updateState === "ready" || updateState === "downloading" || updateState === "activating") ? (
        <Card className="border-[color-mix(in_srgb,var(--border-default)_82%,transparent)] bg-[color-mix(in_srgb,var(--surface-base)_95%,white)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">App updates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-base)_82%,white)] px-3 py-3">
              {updateState === "ready" ? (
                <Download className="mt-0.5 size-4 text-[var(--action-primary-bg)]" />
              ) : updateState === "activating" ? (
                <Loader2 className="mt-0.5 size-4 animate-spin text-[var(--action-primary-bg)]" />
              ) : (
                <Clock className="mt-0.5 size-4 text-[var(--action-primary-bg)]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground">
                  {updateState === "ready"
                    ? "A new version is ready on this device."
                    : updateState === "activating"
                      ? "Applying the downloaded update."
                      : "Checking and downloading app updates."}
                </div>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {updateState === "ready"
                    ? "Refresh when you have a safe moment. Your offline queue stays intact."
                    : updateState === "activating"
                      ? "The app will reload into the new version once activation completes."
                      : "The current session stays usable while the new version prepares in the background."}
                </p>
              </div>
            </div>
            {updateState === "ready" ? (
              <div className="flex gap-2">
                <Button type="button" className="flex-1" onClick={() => void applyUpdate()}>
                  <Download className="size-4" />
                  Refresh now
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={dismissUpdate}>
                  Later
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="rounded-2xl border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-base)_84%,white)] px-4 py-3 text-sm text-[var(--text-muted)]">
        <div className="flex items-center gap-2 text-foreground">
          {blockingCount > 0 ? (
            <AlertTriangle className="size-4 text-[var(--status-warning-text)]" />
          ) : pendingCount > 0 ? (
            <Clock className="size-4 text-[var(--action-primary-bg)]" />
          ) : (
            <ShieldCheck className="size-4 text-[var(--status-success-text)]" />
          )}
          <span className="font-medium">
            {blockingCount > 0
              ? "A few queued changes need operator attention."
              : pendingCount > 0
                ? "Queued work will replay automatically when the link is stable."
                : "This device is ready for normal offline-first operation."}
          </span>
        </div>
        <div className="mt-2 text-xs text-[var(--text-muted)]">
          Prepared flows stay available offline after a successful online bootstrap.
        </div>
      </div>
    </div>
  );
}
