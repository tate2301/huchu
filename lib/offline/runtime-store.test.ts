import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SERVER_SNAPSHOT,
  deriveOfflineStatus,
  getOfflineSnapshot,
  getServerOfflineSnapshot,
  resetOfflineSnapshot,
  subscribeOfflineRuntime,
  updateOfflineSnapshot,
  type OfflineSnapshot,
} from "./runtime-store";
import { OFFLINE_STATUS_WORD } from "./status-words";

function state(patch: Partial<OfflineSnapshot>): OfflineSnapshot {
  return { ...SERVER_SNAPSHOT, ...patch };
}

const queue = (pending: number, blocking = 0) => ({ pending, blocking, operations: [] });

afterEach(() => resetOfflineSnapshot());

describe("the server snapshot", () => {
  it("is one object, so useSyncExternalStore never sees a change during hydration", () => {
    expect(getServerOfflineSnapshot()).toBe(getServerOfflineSnapshot());
    expect(getServerOfflineSnapshot()).toBe(SERVER_SNAPSHOT);
  });

  it("does not move when the client state does", () => {
    updateOfflineSnapshot({ online: false, queue: queue(3, 1) });
    expect(getOfflineSnapshot()).not.toBe(SERVER_SNAPSHOT);
    expect(getServerOfflineSnapshot()).toBe(SERVER_SNAPSHOT);
    expect(deriveOfflineStatus(getServerOfflineSnapshot())).toBe("ONLINE");
  });

  it("reads as up to date — the state the app bar renders on the server", () => {
    expect(OFFLINE_STATUS_WORD[deriveOfflineStatus(SERVER_SNAPSHOT)]).toBe("Up to date");
  });
});

describe("the store", () => {
  it("notifies subscribers and returns a new snapshot on every change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOfflineRuntime(listener);
    const before = getOfflineSnapshot();

    updateOfflineSnapshot({ syncing: true });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getOfflineSnapshot()).not.toBe(before);
    expect(getOfflineSnapshot().syncing).toBe(true);
    unsubscribe();
  });

  it("goes back to the server's answer on reset", () => {
    updateOfflineSnapshot({ online: false });
    resetOfflineSnapshot();
    expect(getOfflineSnapshot()).toBe(SERVER_SNAPSHOT);
  });
});

describe("the one word for the whole state", () => {
  it("puts the line being down above everything", () => {
    expect(deriveOfflineStatus(state({ online: false, queue: queue(2, 2), syncing: true }))).toBe(
      "OFFLINE",
    );
  });

  it("puts work that needs a person above a running sync", () => {
    expect(deriveOfflineStatus(state({ queue: queue(2, 1), syncing: true }))).toBe("ATTENTION");
    expect(OFFLINE_STATUS_WORD.ATTENTION).toBe("Needs attention");
  });

  it("names all six states once", () => {
    expect(Object.values(OFFLINE_STATUS_WORD)).toEqual([
      "Up to date",
      "Offline",
      "Needs attention",
      "Syncing",
      "Getting ready to work offline",
      "Update ready",
    ]);
  });

  it("is preparing while pages are being kept or the bundle is downloading", () => {
    expect(deriveOfflineStatus(state({ pages: { warming: true, routes: [], keptCount: 0 } }))).toBe(
      "PREPARING",
    );
    expect(
      deriveOfflineStatus(state({ bundle: { ...SERVER_SNAPSHOT.bundle, state: "installing" } })),
    ).toBe("PREPARING");
  });

  it("offers an update only when nothing more pressing is going on", () => {
    const update = { bundle: { ...SERVER_SNAPSHOT.bundle, updateWaiting: true } };
    expect(deriveOfflineStatus(state(update))).toBe("UPDATE_READY");
    expect(deriveOfflineStatus(state({ ...update, syncing: true }))).toBe("SYNCING");
  });
});
