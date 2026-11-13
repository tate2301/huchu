"use client";

/**
 * Device sync — the mission-control view behind the sidebar foot's sync word
 * and the till's sync button.
 *
 * One row per thing that has to be true for this device to work offline, each
 * with a canonical status and the numbers behind it, then the queue itself.
 * Nothing decorative: a cashier opens this to answer "is my work safe, and can
 * I keep going without the line?", and every row is part of that answer. The
 * words are the Offline and sync page's; the panel explains nothing about itself.
 */

import { Button, Meter, Status, SyncPanel, type StatusTone, type SyncGroup } from "@corelithzw/react";

import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { deriveOfflineStatus, type OfflineSnapshot } from "@/lib/offline/runtime-store";
import { OFFLINE_STATUS_WORD } from "@/lib/offline/status-words";
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

  const appRow: SyncRow = (() => {
    const base = { id: "bundle" as const, label: "App" };
    if (bundle.state === "unsupported") return { ...base, status: "Not started", detail: "Not supported in this browser" };
    if (bundle.state === "disabled") return { ...base, status: "Not started", detail: "Off in development" };
    if (bundle.state === "failed") return { ...base, status: "Needs input", detail: "Not installed. Reload to try again" };
    const files = bundle.total > 0 ? `${bundle.cached.toLocaleString()} of ${plural(bundle.total, "file")}` : "Checking";
    const complete = bundle.total > 0 && bundle.cached >= bundle.total;
    return {
      ...base,
      status: complete && bundle.state === "ready" ? "Completed" : "Running",
      detail: bundle.updateWaiting ? `${files} · Update ready` : files,
      progress: bundle.total > 0 ? Math.min(1, bundle.cached / bundle.total) : undefined,
    };
  })();

  const pagesRow: SyncRow = (() => {
    const base = { id: "pages" as const, label: "Pages" };
    // Pages are kept by the service worker; without one, nothing is.
    if (bundle.state === "disabled" || bundle.state === "unsupported" || bundle.state === "failed") {
      return { ...base, status: "Not started", detail: "None kept" };
    }
    if (pages.routes.length === 0) {
      return {
        ...base,
        status: pages.warming ? "Running" : pages.keptCount > 0 ? "Completed" : "Idle",
        detail: `${pages.keptCount.toLocaleString()} kept`,
      };
    }
    const ready = `${readyRoutes} of ${pages.routes.length} ready`;
    if (pages.warming) return { ...base, status: "Running", detail: ready, progress: readyRoutes / pages.routes.length };
    if (missingRoutes.length === 0) return { ...base, status: "Completed", detail: ready, progress: 1 };
    return {
      ...base,
      status: state.online ? "Needs input" : "Not started",
      detail: `${ready} · Missing ${missingRoutes.slice(0, 3).join(", ")}${missingRoutes.length > 3 ? ` and ${missingRoutes.length - 3} more` : ""}`,
      progress: readyRoutes / pages.routes.length,
    };
  })();

  const queueRow: SyncRow = (() => {
    const base = { id: "queue" as const, label: "Waiting actions" };
    if (queue.pending === 0) return { ...base, status: "Completed", detail: "None" };
    const waiting = plural(queue.pending, "action");
    if (queue.blocking > 0) return { ...base, status: "Needs input", detail: `${waiting} · ${queue.blocking} to review` };
    if (state.syncing) return { ...base, status: "Running", detail: `${waiting} · Sending` };
    return { ...base, status: "Idle", detail: waiting };
  })();

  return [
    {
      id: "connection",
      label: "Connection",
      status: state.online ? "Completed" : "Needs input",
      detail: state.online ? "Online" : lastOnline ? `Offline since ${lastOnline}` : "Offline",
    },
    appRow,
    pagesRow,
    {
      id: "data",
      label: "Saved data",
      status: state.data.queryCount > 0 ? "Completed" : "Idle",
      detail: state.data.queryCount > 0 ? plural(state.data.queryCount, "result") : "None yet",
    },
    queueRow,
    {
      id: "sync",
      label: "Last sync",
      status: state.lastSyncError ? "Needs input" : lastSynced ? "Completed" : "Not started",
      detail: state.lastSyncError ? `Failed: ${state.lastSyncError}` : (lastSynced ?? "Not yet"),
    },
  ];
}

/** What sits beside the state word in the header: since when, how many, how far. */
export function buildSyncMeta(state: OfflineSnapshot, now = new Date()): string | null {
  const status = deriveOfflineStatus(state);
  if (status === "OFFLINE") {
    const since = formatSyncTime(state.lastOnlineAt, now);
    return since ? `since ${since}` : null;
  }
  if ((status === "ATTENTION" || status === "SYNCING") && state.queue.pending > 0) {
    return plural(state.queue.pending, "action");
  }
  if (status === "PREPARING") {
    if (state.bundle.state === "installing" && state.bundle.total > 0) {
      return `${state.bundle.cached.toLocaleString()} of ${state.bundle.total.toLocaleString()}`;
    }
    if (state.pages.routes.length > 0) {
      return `${state.pages.routes.filter((route) => route.kept).length} of ${state.pages.routes.length}`;
    }
  }
  return null;
}

/** The word on a queue row: what is happening to it, and nothing else. */
export function queueRowWord(item: OfflineOutboxSummaryItem, now = new Date()): string {
  if (item.status === "SYNCING") return "Sending";
  if (item.waitingOn) return `Waiting on ${item.waitingOn}`;
  if (item.status === "FAILED_RETRYABLE") {
    const next = formatSyncTime(item.nextRetryAt ?? null, now);
    return next ? `Will be tried again at ${next}` : "Will be tried again";
  }
  return "Waiting";
}

/** The cash is already in the drawer when a sale is queued; losing it loses the sale. */
function removeDescription(item: OfflineOutboxSummaryItem) {
  return item.operation === "create-sale"
    ? "The customer has already paid. Removing it loses the sale"
    : "It has not reached the server. Removing it cannot be undone";
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
  const meta = buildSyncMeta(runtime);
  const now = new Date();

  const removeItem = async (item: OfflineOutboxSummaryItem) => {
    const confirmed = await dsConfirm({
      title: `Remove ${item.label}`,
      description: removeDescription(item),
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

  const needsReview = runtime.operations.filter((item) => item.status === "FAILED_BLOCKING");
  const waiting = runtime.operations.filter((item) => item.status !== "FAILED_BLOCKING");
  const candidateGroups: (SyncGroup | null)[] = [
    needsReview.length > 0
      ? {
          label: `Needs review · ${needsReview.length}`,
          danger: true,
          items: needsReview.map((item) => ({
            label: item.label,
            time: formatSyncTime(item.createdAt, now) ?? undefined,
            failed: true,
            detail: item.lastError ?? "Refused",
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
            value: queueRowWord(item, now),
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
        <DialogTitle className="flex items-baseline gap-2 text-base font-semibold text-[var(--text-strong)]">
          {OFFLINE_STATUS_WORD[runtime.status]}
          {meta ? <span className="text-sm font-normal text-[var(--text-muted)] tabular-nums">{meta}</span> : null}
        </DialogTitle>
        <DialogDescription className="sr-only">Device sync</DialogDescription>
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
                    Keep pages
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
            title="Queue"
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
