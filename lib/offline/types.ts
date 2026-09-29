export type OfflineTenantKey = string;

export type LocalEntityStatus = "LOCAL" | "SYNCED";

export type LocalEntityRecord<TPayload = Record<string, unknown>> = {
  id: string;
  tenantKey: OfflineTenantKey;
  moduleId: string;
  entityType: string;
  tempId: string;
  serverId?: string | null;
  status: LocalEntityStatus;
  displayLabel: string;
  searchableText: string;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
};

export type OfflineAttachmentRecord = {
  tenantKey: OfflineTenantKey;
  attachmentId: string;
  context: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
  blob: Blob;
};

export type OfflineAttachmentRef = Omit<
  OfflineAttachmentRecord,
  "blob" | "createdAt"
>;

export type OfflineOutboxStatus =
  | "QUEUED"
  | "SYNCING"
  | "FAILED_BLOCKING"
  | "FAILED_RETRYABLE"
  | "SYNCED";

export type OfflineOutboxOperation<TPayload = Record<string, unknown>> = {
  operationId: string;
  tenantKey: OfflineTenantKey;
  moduleId: string;
  clientRequestId: string;
  entityType: string;
  operation: string;
  dependsOn: string[];
  payload: TPayload;
  localRefs?: Record<string, string>;
  attachments?: OfflineAttachmentRef[];
  syncPriority: number;
  status: OfflineOutboxStatus;
  retryCount: number;
  lastAttemptAt?: string;
  lastError?: string;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type OfflineSyncOutcome =
  | {
      status: "synced";
      serverEntityId?: string | null;
      invalidateQueryKeys?: unknown[][];
    }
  | {
      status: "retryable";
      message: string;
      retryAt?: string;
      invalidateQueryKeys?: unknown[][];
    }
  | {
      status: "blocking";
      message: string;
      invalidateQueryKeys?: unknown[][];
    };

export type OfflineMutationSyncContext = {
  operation: OfflineOutboxOperation;
  resolvedPayload: Record<string, unknown>;
};

export type OfflineEntityAdapter = {
  entityType: string;
  displayLabel: (payload: Record<string, unknown>) => string;
  searchableText?: (payload: Record<string, unknown>) => string;
};

export type OfflineMutationAdapter = {
  operation: string;
  sync: (context: OfflineMutationSyncContext) => Promise<OfflineSyncOutcome>;
};

export type OfflinePreloadQuery = {
  key: string;
  queryKey: unknown[] | (() => unknown[] | null | Promise<unknown[] | null>);
  maxAgeMs?: number;
  fetcher: (queryKey: unknown[]) => Promise<unknown>;
  enabled?: () => boolean;
  /**
   * The feature this preload needs, if its endpoint is gated.
   *
   * Skipped when the session does not hold it. Without this the preloader
   * fetched everything it listed for everybody: a gold clerk took 403s on
   * `/api/sites`, a cashier on `/api/v2/retail/promotions`, on pages that do
   * not mention either. Checked against the session's features by
   * `prefetchOfflineModuleQueries` in `lib/offline/module-registry.ts`.
   *
   * Only needed where `lib/platform/gating/route-registry.ts` gates the route
   * the fetcher calls. An ungated endpoint needs nothing here.
   */
  featureKey?: string;
};

export type OfflineRouteDefinition = {
  canonicalRoute: string;
  matchPaths: string[];
  warmupUrls: string[];
  critical?: boolean;
};

export type OfflineWarmupScope = "required" | "snapshot";

export type OfflineWorkflowCatalogEntry = {
  workflowId: string;
  vertical: string;
  audience: string;
  warmupScope: OfflineWarmupScope;
  routes: string[];
  queryKeys: string[];
  moduleIds: string[];
  excludedRoutes?: string[];
};

export type OfflineModuleDefinition = {
  moduleId: string;
  syncPriority: number;
  primaryFlowLabel: string;
  criticalRoutes: string[];
  warmupRoutes?: string[];
  routes?: OfflineRouteDefinition[];
  preloadQueries: OfflinePreloadQuery[];
  entityAdapters: OfflineEntityAdapter[];
  mutationAdapters: OfflineMutationAdapter[];
};

export type OfflineOutboxSummaryItem = {
  operationId: string;
  tenantKey: OfflineTenantKey;
  moduleId: string;
  entityType: string;
  operation: string;
  label: string;
  status: OfflineOutboxStatus;
  createdAt: string;
  lastError?: string;
  blockedByOperationId?: string;
  blockedReason?: string;
};

export type OfflineStatus =
  | "ONLINE"
  | "OFFLINE"
  | "PREPARING"
  | "SYNCING"
  | "ATTENTION"
  | "UPDATE_READY";
