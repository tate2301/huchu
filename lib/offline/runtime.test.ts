import type { OfflineOutboxOperation } from "@/lib/offline/types";

const syncSpy = vi.fn();
const listPendingSpy = vi.fn();

vi.mock("@/lib/offline/module-registry", () => ({
  getEnabledOfflineModules: vi.fn(() => [{ moduleId: "scrap-metal" }]),
  syncOfflineOperation: (operation: OfflineOutboxOperation) => syncSpy(operation),
}));

vi.mock("@/lib/offline/outbox", () => ({
  listPendingOfflineOperations: (options?: { tenantKey?: string }) => listPendingSpy(options),
}));

import { syncOfflineRuntime } from "@/lib/offline/runtime";

describe("syncOfflineRuntime", () => {
  beforeEach(() => {
    syncSpy.mockReset();
    listPendingSpy.mockReset();
  });

  it("replays operations in dependency-safe order and accumulates invalidations", async () => {
    const op1: OfflineOutboxOperation = {
      operationId: "op-1",
      tenantKey: "tenant-a",
      moduleId: "scrap-metal",
      clientRequestId: "req-1",
      entityType: "seller",
      operation: "create-seller",
      dependsOn: [],
      payload: {},
      syncPriority: 10,
      status: "QUEUED",
      retryCount: 0,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    };
    const op2: OfflineOutboxOperation = {
      ...op1,
      operationId: "op-2",
      clientRequestId: "req-2",
      operation: "create-inbound-ticket",
      dependsOn: ["op-1"],
      createdAt: new Date(2).toISOString(),
      updatedAt: new Date(2).toISOString(),
    };

    listPendingSpy.mockResolvedValue([op1, op2]);
    syncSpy
      .mockResolvedValueOnce({
        moduleId: "scrap-metal",
        outcome: "synced",
        invalidateQueryKeys: [["scrap-sellers"]],
      })
      .mockResolvedValueOnce({
        moduleId: "scrap-metal",
        outcome: "synced",
        invalidateQueryKeys: [["scrap-metal-purchases"]],
      });

    const result = await syncOfflineRuntime({ tenantKey: "tenant-a" });

    expect(syncSpy).toHaveBeenCalledTimes(2);
    expect(result.syncedCount).toBe(2);
    expect(result.invalidateQueryKeys).toEqual([
      ["scrap-sellers"],
      ["scrap-metal-purchases"],
    ]);
  });

  it("skips retryable items that are still inside retry window", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const pending: OfflineOutboxOperation = {
      operationId: "op-1",
      tenantKey: "tenant-a",
      moduleId: "scrap-metal",
      clientRequestId: "req-1",
      entityType: "seller",
      operation: "create-seller",
      dependsOn: [],
      payload: {},
      syncPriority: 10,
      status: "FAILED_RETRYABLE",
      retryCount: 1,
      nextRetryAt: future,
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    };

    listPendingSpy.mockResolvedValue([pending]);
    const result = await syncOfflineRuntime({ tenantKey: "tenant-a" });

    expect(syncSpy).not.toHaveBeenCalled();
    expect(result.syncedCount).toBe(0);
    expect(result.retryableCount).toBe(0);
    expect(result.blockingCount).toBe(0);
  });
});
