import type { OfflineOutboxSummaryItem, OfflineStatus } from "@/lib/offline/types";

/**
 * Everything the device knows about its offline state, as one snapshot.
 *
 * Read through `useSyncExternalStore` (see `useOfflineRuntime`), never through
 * context. That is the hydration fix, and the reason is worth keeping:
 *
 * Every field here comes from something the server cannot see — the service
 * worker, IndexedDB, `navigator.onLine`. The server renders
 * `SERVER_SNAPSHOT`. The previous provider held its context at the server's
 * answer until *it* had hydrated, then flipped. But the navbar sits in a later
 * Suspense boundary than the provider, so by the time the device-sync button
 * hydrated, the context had already flipped to "Preparing" and the button's
 * markup disagreed with the server's "Ready".
 *
 * `useSyncExternalStore` answers per consumer: React hands every hydrating
 * reader `getServerSnapshot()`, whenever and wherever it hydrates, and moves
 * it to the live snapshot in the render straight after. No boundary can see
 * the client's value early.
 */
export type BundleState =
  /** The browser has no service worker. */
  | "unsupported"
  /** Development build — the worker is switched off on purpose. */
  | "disabled"
  /** Registering, or not heard from yet. */
  | "checking"
  /** Downloading the precache. */
  | "installing"
  | "ready"
  | "failed";

export type KeptRoute = {
  /** What a person calls it, from the module's route list. */
  label: string;
  /** Whether a copy is in the page cache. */
  kept: boolean;
};

export type OfflineSnapshot = {
  online: boolean;
  /** The last moment this device was known to be connected. */
  lastOnlineAt: string | null;
  tenantKey: string | null;
  queue: {
    pending: number;
    blocking: number;
    operations: OfflineOutboxSummaryItem[];
  };
  syncing: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  bundle: {
    state: BundleState;
    /** Precache entries on the device, out of `total`. */
    cached: number;
    total: number;
    updateWaiting: boolean;
    updating: boolean;
  };
  pages: {
    warming: boolean;
    /** The routes the enabled modules need offline. */
    routes: KeptRoute[];
    /** Every page in the page cache, warmed or visited. */
    keptCount: number;
  };
  data: {
    /** Query results held in memory and persisted for this tenant. */
    queryCount: number;
  };
  installAvailable: boolean;
};

/**
 * What the server renders, and what every client render hydrates against.
 *
 * One object, never rebuilt: `useSyncExternalStore` compares snapshots by
 * identity and treats a fresh object as a change.
 */
export const SERVER_SNAPSHOT: OfflineSnapshot = Object.freeze({
  online: true,
  lastOnlineAt: null,
  tenantKey: null,
  queue: Object.freeze({ pending: 0, blocking: 0, operations: [] }),
  syncing: false,
  lastSyncedAt: null,
  lastSyncError: null,
  bundle: Object.freeze({
    state: "checking",
    cached: 0,
    total: 0,
    updateWaiting: false,
    updating: false,
  }),
  pages: Object.freeze({ warming: false, routes: [], keptCount: 0 }),
  data: Object.freeze({ queryCount: 0 }),
  installAvailable: false,
}) as OfflineSnapshot;

let snapshot: OfflineSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

export function subscribeOfflineRuntime(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOfflineSnapshot() {
  return snapshot;
}

export function getServerOfflineSnapshot() {
  return SERVER_SNAPSHOT;
}

/** Replace part of the snapshot. Nested sections are replaced whole. */
export function updateOfflineSnapshot(
  patch: Partial<OfflineSnapshot> | ((current: OfflineSnapshot) => Partial<OfflineSnapshot>),
) {
  const next = typeof patch === "function" ? patch(snapshot) : patch;
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

/** Back to the server's answer — for tests, and for a sign-out. */
export function resetOfflineSnapshot() {
  snapshot = SERVER_SNAPSHOT;
  for (const listener of listeners) listener();
}

/**
 * The one word the app bar and the till show for the whole state.
 *
 * Ordered by what a person has to act on first. `SYNCING` sits below
 * `ATTENTION` because a sync that runs past a blocked item does not unblock it.
 */
export function deriveOfflineStatus(state: OfflineSnapshot): OfflineStatus {
  if (!state.online) return "OFFLINE";
  if (state.queue.blocking > 0) return "ATTENTION";
  if (state.syncing) return "SYNCING";
  if (state.pages.warming || state.bundle.state === "installing") return "PREPARING";
  if (state.bundle.updateWaiting) return "UPDATE_READY";
  return "ONLINE";
}

export function getOfflineStatusLabel(state: OfflineSnapshot) {
  const status = deriveOfflineStatus(state);
  const pending = state.queue.pending;
  if (status === "OFFLINE") return "Offline";
  if (status === "ATTENTION") return `Attention ${state.queue.blocking}`;
  if (status === "SYNCING") return pending > 0 ? `Syncing ${pending}` : "Syncing";
  if (status === "PREPARING") return "Preparing";
  if (status === "UPDATE_READY") return "Update available";
  return "Ready";
}
