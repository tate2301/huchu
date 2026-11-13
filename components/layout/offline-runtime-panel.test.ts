import { describe, expect, it } from "vitest";

import { buildSyncMeta, buildSyncRows, formatSyncTime, queueRowWord } from "./offline-runtime-panel";
import { SERVER_SNAPSHOT, type OfflineSnapshot } from "@/lib/offline/runtime-store";

const NOW = new Date("2026-09-28T14:40:00");

function state(patch: Partial<OfflineSnapshot>): OfflineSnapshot {
  return { ...SERVER_SNAPSHOT, ...patch };
}

function row(snapshot: OfflineSnapshot, id: string) {
  const found = buildSyncRows(snapshot, NOW).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no ${id} row`);
  return found;
}

const HEALTHY = state({
  lastOnlineAt: "2026-09-28T14:39:00",
  lastSyncedAt: "2026-09-28T14:38:00",
  bundle: { state: "ready", cached: 412, total: 412, updateWaiting: false, updating: false },
  pages: {
    warming: false,
    routes: [
      { label: "/portal/pos", kept: true },
      { label: "/portal/pos/held", kept: true },
    ],
    keptCount: 9,
  },
  data: { queryCount: 86 },
});

describe("the device sync rows", () => {
  it("shows every part of the sync state, in a fixed order", () => {
    expect(buildSyncRows(HEALTHY, NOW).map((entry) => entry.id)).toEqual([
      "connection",
      "bundle",
      "pages",
      "data",
      "queue",
      "sync",
    ]);
  });

  it("reads as completed across the board when everything is in order", () => {
    const rows = buildSyncRows(HEALTHY, NOW);
    expect(rows.every((entry) => entry.status === "Completed")).toBe(true);
    expect(row(HEALTHY, "bundle").detail).toBe("412 of 412 files");
    expect(row(HEALTHY, "pages").detail).toBe("2 of 2 ready");
    expect(row(HEALTHY, "data").detail).toBe("86 results");
    expect(row(HEALTHY, "sync").detail).toBe("14:38");
  });

  it("uses only the five canonical status labels", () => {
    const allowed = new Set(["Needs input", "Running", "Completed", "Idle", "Not started"]);
    const variants = [
      HEALTHY,
      state({}),
      state({ online: false }),
      state({ bundle: { ...HEALTHY.bundle, state: "failed" } }),
      state({ queue: { pending: 3, blocking: 1, operations: [] } }),
      state({ syncing: true, queue: { pending: 3, blocking: 0, operations: [] } }),
    ];
    for (const variant of variants) {
      for (const entry of buildSyncRows(variant, NOW)) expect(allowed).toContain(entry.status);
    }
  });

  it("says when the line went, and counts what is waiting, while offline", () => {
    const offline = state({
      ...HEALTHY,
      online: false,
      lastOnlineAt: "2026-09-28T13:05:00",
      queue: { pending: 3, blocking: 0, operations: [] },
    });
    expect(row(offline, "connection")).toMatchObject({
      status: "Needs input",
      detail: "Offline since 13:05",
    });
    expect(row(offline, "queue").detail).toBe("3 actions");
  });

  it("asks for a person when an action is blocked", () => {
    const blocked = state({ queue: { pending: 2, blocking: 1, operations: [] } });
    expect(row(blocked, "queue")).toMatchObject({
      status: "Needs input",
      detail: "2 actions · 1 to review",
    });
  });

  it("names the pages not yet kept, and how far it has got", () => {
    const partial = state({
      ...HEALTHY,
      pages: {
        warming: false,
        routes: [
          { label: "/overview", kept: true },
          { label: "/held", kept: false },
          { label: "/shift", kept: false },
        ],
        keptCount: 1,
      },
    });
    const pages = row(partial, "pages");
    expect(pages.status).toBe("Needs input");
    expect(pages.detail).toBe("1 of 3 ready · Missing /held, /shift");
    expect(pages.progress).toBeCloseTo(1 / 3);
  });

  it("reports a switched-off worker as not started rather than broken", () => {
    const dev = state({ bundle: { ...SERVER_SNAPSHOT.bundle, state: "disabled" } });
    expect(row(dev, "bundle")).toMatchObject({
      status: "Not started",
      detail: "Off in development",
    });
    // …and does not claim pages are being kept when nothing can keep them.
    expect(row(dev, "pages")).toMatchObject({ status: "Not started", detail: "None kept" });
  });

  it("shows a warm-up as running even on a workspace with no module pages", () => {
    const warming = state({ ...HEALTHY, pages: { warming: true, routes: [], keptCount: 4 } });
    expect(row(warming, "pages")).toMatchObject({
      status: "Running",
      detail: "4 kept",
    });
  });

  it("reports a downloading bundle as running, with its progress", () => {
    const installing = state({
      bundle: { state: "installing", cached: 100, total: 400, updateWaiting: false, updating: false },
    });
    expect(row(installing, "bundle")).toMatchObject({ status: "Running", progress: 0.25 });
  });

  it("mentions a downloaded update in the bundle row", () => {
    const update = state({ ...HEALTHY, bundle: { ...HEALTHY.bundle, updateWaiting: true } });
    expect(row(update, "bundle").detail).toBe(
      "412 of 412 files · Update ready",
    );
  });

  it("names the rows as the design does", () => {
    expect(buildSyncRows(HEALTHY, NOW).map((entry) => entry.label)).toEqual([
      "Connection",
      "App",
      "Pages",
      "Saved data",
      "Waiting actions",
      "Last sync",
    ]);
  });

  it("shows a failed sync with its reason", () => {
    const failed = state({ ...HEALTHY, lastSyncError: "Failed to fetch" });
    expect(row(failed, "sync")).toMatchObject({
      status: "Needs input",
      detail: "Failed: Failed to fetch",
    });
  });
});

describe("sync times", () => {
  it("is a 24-hour clock today", () => {
    expect(formatSyncTime("2026-09-28T09:05:00", NOW)).toBe("09:05");
  });

  it("carries the date for anything older", () => {
    expect(formatSyncTime("2026-09-03T18:30:00", NOW)).toBe("3 September 2026, 18:30");
  });

  it("says nothing rather than inventing a time", () => {
    expect(formatSyncTime(null, NOW)).toBeNull();
    expect(formatSyncTime("not a date", NOW)).toBeNull();
  });
});

describe("the header beside the state word", () => {
  it("says since when while offline", () => {
    const offline = state({ ...HEALTHY, online: false, lastOnlineAt: "2026-09-28T08:12:00" });
    expect(buildSyncMeta(offline, NOW)).toBe("since 08:12");
  });

  it("counts actions while syncing or needing attention", () => {
    expect(buildSyncMeta(state({ syncing: true, queue: { pending: 2, blocking: 0, operations: [] } }), NOW)).toBe("2 actions");
    expect(buildSyncMeta(state({ queue: { pending: 1, blocking: 1, operations: [] } }), NOW)).toBe("1 action");
  });

  it("counts how far it has got while getting ready", () => {
    const installing = state({
      bundle: { state: "installing", cached: 2, total: 5, updateWaiting: false, updating: false },
    });
    expect(buildSyncMeta(installing, NOW)).toBe("2 of 5");
  });

  it("says nothing when the device is up to date", () => {
    expect(buildSyncMeta(HEALTHY, NOW)).toBeNull();
  });
});

describe("the queue row words", () => {
  const item = {
    operationId: "op:1",
    tenantKey: "t",
    moduleId: "retail-pos",
    entityType: "sale",
    operation: "create-sale",
    label: "Sale",
    createdAt: "2026-09-28T09:00:00",
  } as const;

  it("uses the design's vocabulary", () => {
    expect(queueRowWord({ ...item, status: "QUEUED" }, NOW)).toBe("Waiting");
    expect(queueRowWord({ ...item, status: "SYNCING" }, NOW)).toBe("Sending");
    expect(queueRowWord({ ...item, status: "FAILED_RETRYABLE" }, NOW)).toBe("Will be tried again");
    expect(
      queueRowWord({ ...item, status: "FAILED_RETRYABLE", nextRetryAt: "2026-09-28T14:41:00" }, NOW),
    ).toBe("Will be tried again at 14:41");
  });

  it("names what a dependent item is waiting on", () => {
    expect(queueRowWord({ ...item, status: "QUEUED", waitingOn: "New customer" }, NOW)).toBe(
      "Waiting on New customer",
    );
  });
});
