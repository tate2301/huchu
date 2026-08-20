import { QueryClient } from "@tanstack/react-query";
import type { PersistedQueryRecord } from "@/lib/offline/types";

const stores = new Map<string, Map<string, unknown>>();

function getStore(storeName: string) {
  let store = stores.get(storeName);
  if (!store) {
    store = new Map<string, unknown>();
    stores.set(storeName, store);
  }
  return store;
}

vi.mock("@/lib/offline/db", () => ({
  OFFLINE_DB_STORES: {
    queryCache: "queryCache",
  },
  listOfflineRecords: async (storeName: string) => Array.from(getStore(storeName).values()),
  deleteOfflineRecord: async (storeName: string, key: string) => {
    getStore(storeName).delete(String(key));
  },
  putOfflineRecord: async (storeName: string, value: PersistedQueryRecord) => {
    getStore(storeName).set(value.id, value);
  },
}));

import {
  persistOfflineQueryRecord,
  pruneOfflineQueries,
  restoreOfflineQueries,
} from "@/lib/offline/query-cache";

describe("offline query cache", () => {
  beforeEach(() => {
    stores.clear();
  });

  it("restores persisted queries across client restarts", async () => {
    const sourceClient = new QueryClient();
    sourceClient.setQueryData(["retail-pos-catalog", "site-1"], [{ id: "m1" }]);
    const query = sourceClient
      .getQueryCache()
      .find({ queryKey: ["retail-pos-catalog", "site-1"] });

    expect(query).not.toBeNull();
    await persistOfflineQueryRecord(query!, "tenant-a");

    const restoredClient = new QueryClient();
    await restoreOfflineQueries(restoredClient, "tenant-a");

    expect(restoredClient.getQueryData(["retail-pos-catalog", "site-1"]))
      .toEqual([{ id: "m1" }]);
  });

  it("prunes entries only after retention window", async () => {
    const now = Date.now();
    getStore("queryCache").set("tenant-a:[\"retail-pos-catalog\"]", {
      id: "tenant-a:[\"retail-pos-catalog\"]",
      tenantKey: "tenant-a",
      queryKey: ["retail-pos-catalog"],
      data: [{ id: "m1" }],
      updatedAt: now - 31 * 24 * 60 * 60 * 1000,
      maxAgeMs: 30 * 24 * 60 * 60 * 1000,
      moduleId: "retail-pos",
    } satisfies PersistedQueryRecord);

    await pruneOfflineQueries("tenant-a");

    expect(getStore("queryCache").size).toBe(0);
  });
});
