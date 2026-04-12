import { createOfflineBootstrapProgress } from "@/lib/offline/bootstrap-state";
import type { OfflineBootstrapProgress, OfflineModuleDefinition } from "@/lib/offline/types";

const moduleDefinition: OfflineModuleDefinition = {
  moduleId: "scrap-metal",
  syncPriority: 10,
  bootstrapPriority: 10,
  primaryFlowLabel: "Scrap ticketing",
  warmupBudget: "aggressive",
  criticalRoutes: ["/scrap-metal/tickets"],
  preloadQueries: [
    {
      key: "scrap-materials",
      queryKey: ["scrap-materials"],
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
      preparedRoutes: ["/scrap-metal/tickets"],
      startedAt: null,
      updatedAt: new Date().toISOString(),
      lastPreparedAt: null,
      lastSyncedAt: null,
      modules: [
        {
          moduleId: "scrap-metal",
          primaryFlowLabel: "Scrap ticketing",
          bootstrapPriority: 10,
          warmupBudget: "aggressive",
          state: "PREPARED",
          totalRoutes: 1,
          preparedRoutes: ["/scrap-metal/tickets"],
          totalQueries: 1,
          preparedQueryKeys: ["scrap-materials", "old-query-key"],
          lastPreparedAt: null,
        },
      ],
    } satisfies OfflineBootstrapProgress;

    const progress = createOfflineBootstrapProgress("tenant-a", [moduleDefinition], existing);

    expect(progress.modules[0]?.preparedQueryKeys).toEqual(["scrap-materials"]);
    expect(progress.completedSteps).toBeLessThanOrEqual(progress.totalSteps);
  });
});
