"use client";

/**
 * Device sync — the mission-control view behind the app bar's sync icon.
 *
 * One row per thing that has to be true for this device to work offline, each
 * with a canonical status and the numbers behind it, then the queue itself.
 * Nothing decorative: a cashier opens this to answer "is my work safe, and can
 * I keep going without the line?", and every row is part of that answer.
 */

import { Button, Meter, Status, SyncPanel, type StatusTone, type SyncGroup } from "@corelithzw/react";

import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { deriveOfflineStatus, type OfflineSnapshot } from "@/lib/offline/runtime-store";
import type { OfflineOutboxSummaryItem } from "@/lib/offline/types";

type CanonicalStatus = "Needs input" | "Running" | "Completed" | "Idle" | "Not started";

const STATUS_TONE: Record<CanonicalStatus, StatusTone> = {
  "Needs input": "danger",
  Running: "info",
  Completed: "success",
  Idle: "neutral",
  "Not started": "neutral",
};

export type SyncRow = {
  id: "connection" | "bundle" | "pages" | "data" | "queue" | "sync";
  label: string;
  status: CanonicalStatus;
  detail: string;
  /** 0–1, for the rows that fill up. */
  progress?: number;
};

function plural(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** "1 needs" / "2 need" — the verb agrees with the count. */
function needs(count: number) {
  return count === 1 ? "needs" : "need";
}

/** 24-hour clock today; the date as well for anything older. */
export function formatSyncTime(iso: string | null, now = new Date()) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const clock = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (date.toDateString() === now.toDateString()) return clock;
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `${day}, ${clock}`;
}

/**
 * The rows, from the snapshot alone — kept pure so the wording of every state
 * is testable without a browser.
 */
export function buildSyncRows(state: OfflineSnapshot, now = new Date()): SyncRow[] {
  const lastOnline = formatSyncTime(state.lastOnlineAt, now);
  const lastSynced = formatSyncTime(state.lastSyncedAt, now);
  const { bundle, pages, queue } = state;
  const readyRoutes = pages.routes.filter((route) => route.kept).length;
  const missingRoutes = pages.routes.filter((route) => !route.kept).map((route) => route.label);

  const bundleRow: SyncRow = (() => {
    const base = { id: "bundle" as const, label: "App bundle" };
    if (bundle.state === "unsupported") {
      return { ...base, status: "Not started", detail: "This browser cannot keep the app offline" };
    }
    if (bundle.state === "disabled") {
      return { ...base, status: "Not started", detail: "Switched off in development builds" };
    }
    if (bundle.state === "failed") {
      return { ...base, status: "Needs input", detail: "Could not install. Reload the page to try again" };
    }
    const files = bundle.total > 0 ? `${bundle.cached.toLocaleString()} of ${plural(bundle.total, "file")} on this device` : "Checking what is on this device";
    const complete = bundle.total > 0 && bundle.cached >= bundle.total;
    return {
      ...base,
      status: complete && bundle.state === "ready" ? "Completed" : "Running",
      detail: bundle.updateWaiting ? `${files} · a newer version is downloaded` : files,
      progress: bundle.total > 0 ? Math.min(1, bundle.cached / bundle.total) : undefined,
    };
  })();

  const pagesRow: SyncRow = (() => {
    const base = { id: "pages" as const, label: "Offline pages" };
    // Pages are kept by the service worker; without one, nothing is.
    if (bundle.state === "disabled" || bundle.state === "unsupported" || bundle.state === "failed") {
      return { ...base, status: "Not started", detail: "Not kept while the app bundle is off" };
    }
    const total = `${plural(pages.keptCount, "page")} kept in total`;
    if (pages.routes.length === 0) {
      if (pages.warming) return { ...base, status: "Running", detail: `Keeping pages now · ${total}` };
      return { ...base, status: pages.keptCount > 0 ? "Completed" : "Idle", detail: `Pages you open are kept · ${total}` };
    }
    const ready = `${readyRoutes} of ${plural(pages.routes.length, "workspace page")} ready`;
    if (pages.warming) return { ...base, status: "Running", detail: `${ready} · keeping the rest now`, progress: readyRoutes / pages.routes.length };
    if (missingRoutes.length === 0) return { ...base, status: "Completed", detail: `${ready} · ${total}`, progress: 1 };
    return {
      ...base,
      status: state.online ? "Needs input" : "Not started",
      detail: `${ready} · not yet kept: ${missingRoutes.slice(0, 3).join(", ")}${missingRoutes.length > 3 ? ` and ${missingRoutes.length - 3} more` : ""}`,
      progress: readyRoutes / pages.routes.length,
    };
  })();

  const queueRow: SyncRow = (() => {
    const base = { id: "queue" as const, label: "Pending actions" };
    if (queue.pending === 0) return { ...base, status: "Completed", detail: "Nothing waiting to go up" };
    const waiting = `${plural(queue.pending, "action")} waiting`;
    if (queue.blocking > 0) return { ...base, status: "Needs input", detail: `${waiting} · ${queue.blocking} ${needs(queue.blocking)} review before ${queue.blocking === 1 ? "it" : "they"} can go up` };
    if (state.syncing) return { ...base, status: "Running", detail: `${waiting} · sending now` };
    return { ...base, status: "Idle", detail: state.online ? `${waiting} · next attempt within a minute` : `${waiting} · they go up when the line is back` };
  })();

  return [
    {
      id: "connection",
      label: "Connection",
      status: state.online ? "Completed" : "Needs input",
      detail: state.online ? "Online" : lastOnline ? `Offline since ${lastOnline}` : "Offline",
    },
    bundleRow,
    pagesRow,
    {
      id: "data",
      label: "Saved data",
      status: state.data.queryCount > 0 ? "Completed" : "Idle",
      detail:
        state.data.queryCount > 0
          ? `${plural(state.data.queryCount, "result")} kept for this workspace`
          : "Nothing kept yet — pages save their data as they load",
    },
    queueRow,
    {
      id: "sync",
      label: "Last sync",
      status: state.lastSyncError ? "Needs input" : lastSynced ? "Completed" : "Not started",
      detail: state.lastSyncError
        ? `Failed: ${state.lastSyncError}`
        : lastSynced
          ? `${lastSynced}${state.online ? "" : lastOnline ? ` · last online ${lastOnline}` : ""}`
          : "Not yet on this device",
    },
  ];
}

function headline(state: OfflineSnapshot) {
  const status = deriveOfflineStatus(state);
  if (status === "OFFLINE") {
    return state.queue.pending > 0
      ? `Offline. ${plural(state.queue.pending, "action")} saved on this device and will go up when the line is back.`
      : "Offline. Kept pages still open, and new work is saved on this device.";
  }
  if (status === "ATTENTION") {
    const count = state.queue.blocking;
    return `${plural(count, "action")} ${needs(count)} review before ${count === 1 ? "it" : "they"} can go up.`;
  }
  if (status === "SYNCING") return "Sending waiting actions now.";
  if (status === "PREPARING") return "Keeping the pages and data this device needs offline.";
  if (status === "UPDATE_READY") return "Everything is in order. A newer version is ready to apply.";
  return "Everything is in order. This device can keep working without the line.";
}

function QueueRowActions({
  item,
  disabled,
  onRetry,
  onRemove,
}: {
  item: OfflineOutboxSummaryItem;
  disabled: boolean;
  onRetry: (id: string) => void;
  onRemove: (item: OfflineOutboxSummaryItem) => void;
}) {
  return (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onRetry(item.operationId)}>
        Retry
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onRemove(item)}>
        Remove
      </Button>
    </span>
  );
}

export function OfflineRuntimePanel() {
  const runtime = useOfflineRuntime();
  const rows = buildSyncRows(runtime);
  const now = new Date();

  const removeItem = async (item: OfflineOutboxSummaryItem) => {
    const confirmed = await dsConfirm({
      title: `Remove ${item.label}`,
      description: "It has not reached the server. Removing it cannot be undone",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (confirmed) await runtime.removeOperation(item.operationId);
  };

  const clearQueue = async () => {
    const one = runtime.pendingCount === 1;
    const confirmed = await dsConfirm({
      title: `Discard ${plural(runtime.pendingCount, "waiting action")}`,
      description: one
        ? "It has not reached the server. Discarding it cannot be undone"
        : "None of them has reached the server. Discarding them cannot be undone",
      confirmLabel: "Discard",
      variant: "danger",
    });
    if (confirmed) await runtime.clearQueue();
  };

  const needsReview = runtime.operations.filter(
    (item) => item.status === "FAILED_BLOCKING" || Boolean(item.blockedByOperationId),
  );
  const waiting = runtime.operations.filter((item) => !needsReview.includes(item));
  const candidateGroups: (SyncGroup | null)[] = [
    needsReview.length > 0
      ? {
          label: `Needs review · ${needsReview.length}`,
          danger: true,
          items: needsReview.map((item) => ({
            label: item.label,
            time: formatSyncTime(item.createdAt, now) ?? undefined,
            failed: true,
            detail: item.blockedReason ?? item.lastError ?? "The server refused it",
            action: (
              <QueueRowActions
                item={item}
                disabled={runtime.isOffline || runtime.isSyncing}
                onRetry={(id) => void runtime.retryOperation(id)}
                onRemove={(target) => void removeItem(target)}
              />
            ),
          })),
        }
      : null,
    waiting.length > 0
      ? {
          label: `Waiting · ${waiting.length}`,
          items: waiting.map((item) => ({
            label: item.label,
            value: item.status === "FAILED_RETRYABLE" ? "Will be tried again" : undefined,
            time: formatSyncTime(item.createdAt, now) ?? undefined,
            status: item.status === "SYNCING" ? "progress" : "attention",
          })),
        }
      : null,
  ];
  const groups = candidateGroups.filter((group): group is SyncGroup => group !== null);

  return (
    <div className="flex flex-col">
      <DialogHeader className="gap-1 border-b border-[var(--border-default)] px-5 py-4 pr-12">
        <DialogTitle className="text-base font-semibold text-[var(--text-strong)]">Device sync</DialogTitle>
        <DialogDescription className="not-sr-only text-sm text-[var(--text-muted)]">
          {headline(runtime)}
        </DialogDescription>
      </DialogHeader>

      <dl className="divide-y divide-[var(--border-default)]">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-5 py-2.5">
            <dt className="text-sm font-medium text-[var(--text-strong)]">{row.label}</dt>
            <dd className="flex min-w-0 flex-col gap-1.5">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <span className="min-w-0 text-sm text-[var(--text-muted)] tabular-nums">{row.detail}</span>
                <Status tone={STATUS_TONE[row.status]} size="sm" className="shrink-0">
                  {row.status}
                </Status>
              </div>
              {row.progress !== undefined && row.progress < 1 ? (
                <Meter value={Math.round(row.progress * 100)} max={100} label={`${row.label} progress`} />
              ) : null}
              {row.id === "bundle" && runtime.bundle.updateWaiting ? (
                <div>
                  <Button size="sm" variant="secondary" loading={runtime.bundle.updating} onClick={runtime.applyUpdate}>
                    Apply update
                  </Button>
                </div>
              ) : null}
              {row.id === "pages" && row.status === "Needs input" ? (
                <div>
                  <Button size="sm" variant="secondary" onClick={() => void runtime.warmNow()}>
                    Keep pages now
                  </Button>
                </div>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {groups.length > 0 ? (
        <div className="border-t border-[var(--border-default)] px-5 py-3">
          <SyncPanel
            title={`Queue · ${plural(runtime.pendingCount, "action")}`}
            action={
              <Button size="sm" variant="ghost" onClick={() => void clearQueue()}>
                Clear queue
              </Button>
            }
            groups={groups}
          />
        </div>
      ) : null}

      <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-[var(--border-default)] px-5 py-3">
        <div>
          {runtime.installAvailable ? (
            <Button size="sm" variant="ghost" onClick={() => void runtime.installApp()}>
              Install app
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            loading={runtime.isSyncing}
            disabled={runtime.isOffline || !runtime.tenantKey}
            onClick={() =>
              // Everything, not just the queue: "is this device synced?"
              // covers the pages and data it keeps as well.
              void Promise.all([runtime.syncNow({ force: true }), runtime.warmNow(), runtime.refreshBundle()])
            }
          >
            {runtime.isSyncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </DialogFooter>
    </div>
  );
}
