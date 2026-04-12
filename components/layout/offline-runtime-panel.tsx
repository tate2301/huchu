"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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

function statusDotClasses(status: ReturnType<typeof useOfflineRuntime>["status"]) {
  if (status === "OFFLINE") return "bg-[color-mix(in_srgb,var(--status-warning-text)_70%,white)]";
  if (status === "ATTENTION") return "bg-[color-mix(in_srgb,var(--status-error-text)_78%,white)]";
  if (status === "PREPARING" || status === "UPDATE_READY") {
    return "bg-[color-mix(in_srgb,var(--action-primary-bg)_76%,white)]";
  }
  if (status === "SYNCING" || status === "RECONNECTING") {
    return "bg-[color-mix(in_srgb,var(--action-primary-bg)_62%,white)]";
  }
  return "bg-[color-mix(in_srgb,var(--status-success-text)_72%,white)]";
}

function statusPillClasses(status: ReturnType<typeof useOfflineRuntime>["status"]) {
  if (status === "OFFLINE") {
    return "bg-[color-mix(in_srgb,var(--status-warning-bg)_82%,var(--surface-base))] text-[color-mix(in_srgb,var(--status-warning-text)_78%,var(--text-strong))]";
  }
  if (status === "ATTENTION") {
    return "bg-[color-mix(in_srgb,var(--status-error-bg)_78%,var(--surface-base))] text-[color-mix(in_srgb,var(--status-error-text)_78%,var(--text-strong))]";
  }
  if (status === "PREPARING" || status === "UPDATE_READY" || status === "SYNCING" || status === "RECONNECTING") {
    return "bg-[color-mix(in_srgb,var(--action-secondary-bg)_86%,var(--surface-base))] text-[color-mix(in_srgb,var(--action-primary-bg)_82%,var(--text-strong))]";
  }
  return "bg-[color-mix(in_srgb,var(--status-success-bg)_84%,var(--surface-base))] text-[color-mix(in_srgb,var(--status-success-text)_82%,var(--text-strong))]";
}

function moduleStateDotClasses(
  state: ReturnType<typeof useOfflineRuntime>["preparedModules"][number]["state"],
) {
  if (state === "PREPARED") {
    return "bg-[color-mix(in_srgb,var(--status-success-text)_72%,white)]";
  }
  if (state === "PREPARING") {
    return "bg-[color-mix(in_srgb,var(--action-primary-bg)_72%,white)]";
  }
  return "bg-[color-mix(in_srgb,var(--status-warning-text)_72%,white)]";
}

function moduleStateLabel(
  state: ReturnType<typeof useOfflineRuntime>["preparedModules"][number]["state"],
) {
  if (state === "PREPARED") return "Prepared";
  if (state === "PREPARING") return "Preparing";
  return "Not ready";
}

function MetricBlock({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[18px] bg-[color-mix(in_srgb,var(--surface-muted)_76%,white)] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className={[
          "mt-1 text-sm font-medium text-foreground",
          mono ? "font-mono tabular-nums" : "",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
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
    <div className="flex h-full flex-col bg-[color-mix(in_srgb,var(--surface-base)_94%,white)]">
      <div className="px-6 pb-5 pt-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--surface-muted)_86%,white)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <span className={`size-1.5 rounded-full ${statusDotClasses(status)}`} />
                Sync and offline
              </div>
              <h2 className="mt-3 text-[1.625rem] font-semibold tracking-[-0.02em] text-foreground">
                {statusLabel}
              </h2>
              <p className="mt-1 max-w-[34ch] text-sm leading-6 text-[var(--text-muted)]">
                Prepared routes stay available on this device, and queued work can
                replay quietly in the background when the connection settles.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${statusPillClasses(status)}`}
              >
                <span className={`size-1.5 rounded-full ${statusDotClasses(status)}`} />
                {status}
              </div>
              <Button
                type="button"
                size="sm"
                variant={pendingCount > 0 || blockingCount > 0 ? "default" : "outline"}
                onClick={() => void syncNow({ force: true })}
              >
                <RefreshCcw className="size-4" />
                Sync now
              </Button>
              {updateState === "ready" ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void applyUpdate()}>
                  <Download className="size-4" />
                  Refresh
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricBlock label="Pending sync" value={pendingCount} mono />
            <MetricBlock label="Blocking items" value={blockingCount} mono />
            <MetricBlock label="Last sync" value={formatTimestamp(lastSyncedAt)} mono />
          </div>
        </div>
      </div>

      {bootstrapProgress ? (
        <>
          <Separator />
          <section className="px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Prepared workspace
                </div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {bootstrapProgress.currentStepLabel ?? "Offline packs ready"}
                </div>
              </div>
              <div className="rounded-full bg-[color-mix(in_srgb,var(--surface-muted)_84%,white)] px-3 py-1 text-xs font-mono font-medium tabular-nums text-[var(--text-muted)]">
                {bootstrapPercent}%
              </div>
            </div>
            <div className="mt-4 rounded-[18px] bg-[color-mix(in_srgb,var(--surface-muted)_72%,white)] px-4 py-4">
              <Progress
                value={bootstrapProgress.completedSteps}
                max={Math.max(bootstrapProgress.totalSteps, 1)}
                className="h-2 border-0 bg-[color-mix(in_srgb,var(--surface-base)_78%,white)] shadow-none"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                <span className="font-mono tabular-nums">
                  {bootstrapProgress.completedSteps} of {bootstrapProgress.totalSteps} warmup steps
                </span>
                <span className="font-mono tabular-nums">
                  {formatTimestamp(bootstrapProgress.lastPreparedAt ?? null)}
                </span>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <Separator />
      <section className="px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Primary flows
          </div>
          <div className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
            {preparedModules.length} modules
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-[20px] bg-[color-mix(in_srgb,var(--surface-muted)_74%,white)]">
          {preparedModules.map((modulePreparation, index) => (
            <div key={modulePreparation.moduleId}>
              {index > 0 ? <Separator className="bg-[color-mix(in_srgb,var(--border-default)_72%,transparent)]" /> : null}
              <div className="flex items-start justify-between gap-4 px-4 py-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {modulePreparation.primaryFlowLabel}
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    <span className="font-mono tabular-nums">
                      {modulePreparation.preparedRoutes.length}/{modulePreparation.totalRoutes}
                    </span>{" "}
                    routes
                    {" · "}
                    <span className="font-mono tabular-nums">
                      {modulePreparation.preparedQueryKeys.length}/{modulePreparation.totalQueries}
                    </span>{" "}
                    data packs
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--surface-base)_72%,white)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
                  <span
                    className={`size-1.5 rounded-full ${moduleStateDotClasses(modulePreparation.state)}`}
                  />
                  {moduleStateLabel(modulePreparation.state)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {(updateState === "ready" || updateState === "downloading" || updateState === "activating") ? (
        <>
          <Separator />
          <section className="px-6 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              App updates
            </div>
            <div className="mt-4 rounded-[20px] bg-[color-mix(in_srgb,var(--surface-muted)_74%,white)] px-4 py-4">
              <div className="flex items-start gap-3">
                {updateState === "ready" ? (
                  <Download className="mt-0.5 size-4 text-[var(--action-primary-bg)]" />
                ) : updateState === "activating" ? (
                  <Loader2 className="mt-0.5 size-4 animate-spin text-[var(--action-primary-bg)]" />
                ) : (
                  <Clock className="mt-0.5 size-4 text-[var(--action-primary-bg)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {updateState === "ready"
                      ? "A new version is ready on this device."
                      : updateState === "activating"
                        ? "Applying the downloaded update."
                        : "Checking and downloading app updates."}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                    {updateState === "ready"
                      ? "Refresh when you have a safe moment. Your offline queue stays intact."
                      : updateState === "activating"
                        ? "The app will reload into the new version once activation completes."
                        : "The current session stays usable while the new version prepares in the background."}
                  </p>
                </div>
              </div>
              {updateState === "ready" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => void applyUpdate()}>
                    <Download className="size-4" />
                    Refresh now
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={dismissUpdate}>
                    Later
                  </Button>
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      <div className="mt-auto border-t border-[color-mix(in_srgb,var(--border-default)_72%,transparent)] px-6 py-5">
        <div className="flex items-start gap-3 rounded-[18px] bg-[color-mix(in_srgb,var(--surface-muted)_74%,white)] px-4 py-4 text-sm text-[var(--text-muted)]">
          {blockingCount > 0 ? (
            <AlertTriangle className="mt-0.5 size-4 text-[var(--status-warning-text)]" />
          ) : pendingCount > 0 ? (
            <Clock className="mt-0.5 size-4 text-[var(--action-primary-bg)]" />
          ) : (
            <ShieldCheck className="mt-0.5 size-4 text-[var(--status-success-text)]" />
          )}
          <div className="min-w-0">
            <div className="font-medium text-foreground">
              {blockingCount > 0
                ? "A few queued changes need operator attention."
                : pendingCount > 0
                  ? "Queued work will replay automatically when the link is stable."
                  : "This device is ready for normal offline-first operation."}
            </div>
            <div className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              Prepared flows stay available offline after a successful online bootstrap.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
