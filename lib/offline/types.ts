import type { AuthSessionClaims } from "@/lib/auth-core/types";

export type OfflineTenantKey = string;

export type OfflineSessionBootstrap = {
  id: string;
  tenantKey: OfflineTenantKey;
  capturedAt: string;
  expiresAt?: string | null;
  user: AuthSessionClaims;
};

export type PersistedQueryRecord = {
  id: string;
  tenantKey: OfflineTenantKey;
  queryKey: unknown[];
  data: unknown;
  updatedAt: number;
  maxAgeMs: number;
  moduleId?: string | null;
};

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
};

export type OfflineRouteDefinition = {
  canonicalRoute: string;
  matchPaths: string[];
  warmupUrls: string[];
  critical?: boolean;
};

export type OfflineWarmupBudget = "light" | "standard" | "aggressive";

export type OfflineModulePreparationState =
  | "NOT_PREPARED"
  | "PREPARING"
  | "PREPARED";

export type OfflineModulePreparation = {
  moduleId: string;
  primaryFlowLabel: string;
  bootstrapPriority: number;
  warmupBudget: OfflineWarmupBudget;
  state: OfflineModulePreparationState;
  totalRoutes: number;
  preparedRoutes: string[];
  totalQueries: number;
  preparedQueryKeys: string[];
  lastPreparedAt?: string | null;
};

export type OfflineBootstrapProgress = {
  id: string;
  tenantKey: OfflineTenantKey;
  phase: "idle" | "preparing" | "complete";
  currentStepLabel?: string | null;
  totalSteps: number;
  completedSteps: number;
  preparedRoutes: string[];
  startedAt?: string | null;
  updatedAt: string;
  lastPreparedAt?: string | null;
  lastSyncedAt?: string | null;
  modules: OfflineModulePreparation[];
};

export type OfflineUpdateState =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "activating";

export type OfflineModuleDefinition = {
  moduleId: string;
  syncPriority: number;
  bootstrapPriority: number;
  primaryFlowLabel: string;
  warmupBudget: OfflineWarmupBudget;
  criticalRoutes: string[];
  warmupRoutes?: string[];
  routes?: OfflineRouteDefinition[];
  shellAssets?: string[];
  preloadQueries: OfflinePreloadQuery[];
  entityAdapters: OfflineEntityAdapter[];
  mutationAdapters: OfflineMutationAdapter[];
};

export type OfflineActiveTenantContext = {
  id: "active";
  tenantKey: OfflineTenantKey;
  companySlug?: string | null;
  workspaceProfile?: string | null;
  host?: string | null;
  updatedAt: string;
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
  | "RECONNECTING"
  | "SYNCING"
  | "ATTENTION"
  | "UPDATE_READY";
