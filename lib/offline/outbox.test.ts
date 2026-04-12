import type { OfflineOutboxOperation } from "@/lib/offline/types";

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
    outbox: "outbox",
  },
  listOfflineRecords: async (storeName: string) => Array.from(getStore(storeName).values()),
  getOfflineRecord: async (storeName: string, key: string) =>
    (getStore(storeName).get(String(key)) as unknown) ?? null,
  putOfflineRecord: async (storeName: string, value: OfflineOutboxOperation) => {
    getStore(storeName).set(value.operationId, value);
  },
  deleteOfflineRecord: async (storeName: string, key: string) => {
    getStore(storeName).delete(String(key));
  },
}));

import {
  enqueueOfflineOperation,
  listPendingOfflineOperations,
  listOfflineOperations,
} from "@/lib/offline/outbox";

function baseInput(overrides?: Partial<OfflineOutboxOperation>) {
  return {
    tenantKey: "tenant-a",
    moduleId: "scrap-metal",
    clientRequestId: "req-1",
    entityType: "scrap-inbound-ticket",
    operation: "create-inbound-ticket",
    dependsOn: [],
    payload: { amount: 1 },
    localRefs: undefined,
    attachments: [],
    syncPriority: 10,
    ...overrides,
  };
}

describe("offline outbox", () => {
  beforeEach(() => {
    stores.clear();
  });

  it("dedupes queued operations by tenant+module+operation+clientRequestId", async () => {
    const first = await enqueueOfflineOperation(baseInput());
    const second = await enqueueOfflineOperation(baseInput({ payload: { amount: 2 } }));

    expect(second.operationId).toBe(first.operationId);

    const operations = await listOfflineOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]?.operationId).toBe(first.operationId);
  });

  it("sorts pending operations by sync priority and creation order", async () => {
    await enqueueOfflineOperation(baseInput({ operationId: "a", syncPriority: 20, clientRequestId: "req-a" }));
    await enqueueOfflineOperation(baseInput({ operationId: "b", syncPriority: 10, clientRequestId: "req-b" }));

    const ordered = await listPendingOfflineOperations({ tenantKey: "tenant-a" });
    expect(ordered.map((operation) => operation.operationId)).toEqual(["b", "a"]);
  });
});
