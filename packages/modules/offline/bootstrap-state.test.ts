import { createOfflineBootstrapProgress } from "./bootstrap-state";
import type { OfflineBootstrapProgress, OfflineModuleDefinition } from "./types";

const moduleDefinition: OfflineModuleDefinition = {
  moduleId: "retail-pos",
  syncPriority: 10,
  bootstrapPriority: 10,
  primaryFlowLabel: "POS checkout",
  warmupBudget: "aggressive",
  criticalRoutes: ["/portal/pos"],
  preloadQueries: [
    {
      key: "retail-pos-catalog",
      queryKey: ["retail-pos-catalog"],
      fetcher: async () => [],
    },
  ],
  entityAdapters: [],
  mutationAdapters: [],
};

describe("createOfflineBootstrapProgress", () => {
  it("filters stale prepared query keys and keeps progress bounded", () => {
    const existing = {
      id: "bootstrap:tenant-a",
      tenantKey: "tenant-a",
      phase: "preparing",
      currentStepLabel: null,
      totalSteps: 1,
      completedSteps: 2,
      preparedRoutes: ["/portal/pos"],
      startedAt: null,
      updatedAt: new Date().toISOString(),
      lastPreparedAt: null,
      lastSyncedAt: null,
      modules: [
        {
          moduleId: "retail-pos",
          primaryFlowLabel: "POS checkout",
          bootstrapPriority: 10,
          warmupBudget: "aggressive",
          state: "PREPARED",
          totalRoutes: 1,
          preparedRoutes: ["/portal/pos"],
          totalQueries: 1,
          preparedQueryKeys: ["retail-pos-catalog", "old-query-key"],
          lastPreparedAt: null,
        },
      ],
    } satisfies OfflineBootstrapProgress;

    const progress = createOfflineBootstrapProgress("tenant-a", [moduleDefinition], existing);

    expect(progress.modules[0]?.preparedQueryKeys).toEqual(["retail-pos-catalog"]);
    expect(progress.completedSteps).toBeLessThanOrEqual(progress.totalSteps);
  });
});
