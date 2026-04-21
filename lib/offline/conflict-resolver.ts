/**
 * Huchu Conflict Resolver
 * ---------------------------------------------------------------------------
 * Server-Wins strategy with client notification for offline-first conflicts.
 *
 * When the same entity is edited both offline (by operator) and online (by
 * another user or same user on another device), conflicts are detected via
 * version vectors and resolved with server precedence.
 *
 * Features:
 *   • Version vector conflict detection
 *   • Field-level conflict computation
 *   • Server-wins resolution with audit logging
 *   • Conflict log storage in IndexedDB
 *   • React hook for conflict notifications
 */

import { useEffect, useState, useCallback } from "react";
import {
  getRecord,
  putRecord,
  findByIndex,
  findOneByIndex,
  DB_STORES,
  type ConflictLogEntry,
  type LocalEntityRecordV2,
  type OfflineOutboxOperationV2,
  addConflictLogEntry,
  getUnresolvedConflicts,
} from "@/lib/offline/db-v2";

// ── Types ────────────────────────────────────────────────────────────────────

export type ConflictResolution = "server_wins" | "client_wins" | "merge" | "manual";

export type ConflictType =
  | "version_mismatch"
  | "server_modified"
  | "deleted_on_server";

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictType?: ConflictType;
  serverVersion?: number;
  clientVersion?: number;
  conflictingFields?: string[];
  serverPayload?: Record<string, unknown>;
}

export interface ConflictResolutionResult {
  resolution: ConflictResolution;
  applied: boolean;
  /** User-facing message */
  notificationMessage: string | null;
  /** Whether user input is required */
  requiresUserAction: boolean;
}

export interface ConflictNotification {
  id: string;
  message: string;
  entityType: string;
  detectedAt: string;
  shown: boolean;
}

// ── Conflict Detection ───────────────────────────────────────────────────────

/**
 * Check if an operation would create a conflict.
 * Called before applying a sync result.
 */
export async function detectConflict(params: {
  operation: OfflineOutboxOperationV2;
  serverPayload: Record<string, unknown>;
  serverVersion: number;
}): Promise<ConflictDetectionResult> {
  const { operation, serverPayload, serverVersion } = params;

  const entity = operation.localRefs?.entityId
    ? await findOneByIndex<LocalEntityRecordV2>(
        DB_STORES.entityStore,
        "tempId",
        operation.localRefs.entityId,
      )
    : null;

  if (!entity) {
    return { hasConflict: false };
  }

  // Check if server has been modified since client fetched
  if (entity.serverVersion && entity.serverVersion < serverVersion) {
    const conflictingFields = computeConflictingFields(
      operation.payload,
      entity.payload,
      serverPayload,
    );

    if (conflictingFields.length > 0) {
      return {
        hasConflict: true,
        conflictType: "server_modified",
        serverVersion,
        clientVersion: entity.versionVector ?? 0,
        conflictingFields,
        serverPayload,
      };
    }
  }

  // Check if entity was deleted on server
  if (serverPayload._deleted === true) {
    return {
      hasConflict: true,
      conflictType: "deleted_on_server",
      serverVersion,
      clientVersion: entity.versionVector ?? 0,
    };
  }

  return { hasConflict: false };
}

/** Compute which fields have divergent changes */
function computeConflictingFields(
  clientChanges: Record<string, unknown>,
  originalPayload: Record<string, unknown>,
  serverPayload: Record<string, unknown>,
): string[] {
  const conflicts: string[] = [];

  for (const key of Object.keys(clientChanges)) {
    const clientValue = clientChanges[key];
    const originalValue = originalPayload[key];
    const serverValue = serverPayload[key];

    // Conflict: client changed AND server also changed to a different value
    if (
      JSON.stringify(clientValue) !== JSON.stringify(originalValue) &&
      JSON.stringify(serverValue) !== JSON.stringify(originalValue) &&
      JSON.stringify(clientValue) !== JSON.stringify(serverValue)
    ) {
      conflicts.push(key);
    }
  }

  return conflicts;
}

// ── Conflict Resolution ──────────────────────────────────────────────────────

/**
 * Resolve a detected conflict.
 * Default: server-wins with client notification.
 */
export async function resolveConflict(params: {
  operation: OfflineOutboxOperationV2;
  detectionResult: ConflictDetectionResult;
  /** If "manual", the user's chosen resolution */
  userChoice?: Record<string, unknown>;
  /** Override the default strategy */
  strategy?: ConflictResolution;
}): Promise<ConflictResolutionResult> {
  const { operation, detectionResult, userChoice, strategy } = params;

  if (!detectionResult.hasConflict) {
    return {
      resolution: "server_wins",
      applied: true,
      notificationMessage: null,
      requiresUserAction: false,
    };
  }

  const effectiveStrategy = strategy ?? "server_wins";

  switch (effectiveStrategy) {
    case "server_wins":
      await logConflict({
        operation,
        detectionResult,
        resolution: "server_wins",
      });

      if (operation.localRefs?.entityId) {
        await updateEntityWithServerData(
          operation.localRefs.entityId,
          detectionResult.serverPayload ?? {},
          detectionResult.serverVersion ?? 0,
        );
      }

      return {
        resolution: "server_wins",
        applied: true,
        notificationMessage: buildConflictNotification(
          operation,
          detectionResult,
        ),
        requiresUserAction: false,
      };

    case "client_wins":
      await logConflict({
        operation,
        detectionResult,
        resolution: "client_wins",
      });

      return {
        resolution: "client_wins",
        applied: false,
        notificationMessage: `Your changes to ${humanizeEntityType(operation.entityType)} will be re-submitted.`,
        requiresUserAction: false,
      };

    case "manual":
      await logConflict({
        operation,
        detectionResult,
        resolution: "manual",
        userResolution: userChoice,
      });

      return {
        resolution: "manual",
        applied: !!userChoice,
        notificationMessage: "Please review and resolve the conflict manually.",
        requiresUserAction: true,
      };

    default:
      return resolveConflict({ ...params, strategy: "server_wins" });
  }
}

// ── Conflict Logging ─────────────────────────────────────────────────────────

async function logConflict(params: {
  operation: OfflineOutboxOperationV2;
  detectionResult: ConflictDetectionResult;
  resolution: ConflictResolution;
  userResolution?: Record<string, unknown>;
}): Promise<void> {
  const { operation, detectionResult, resolution, userResolution } = params;

  const entry: ConflictLogEntry = {
    id: `conflict:${operation.operationId}:${Date.now()}`,
    tenantKey: operation.tenantKey,
    operationId: operation.operationId,
    entityType: operation.entityType,
    serverId: operation.localRefs?.entityId ?? null,
    clientVersion: detectionResult.clientVersion ?? 0,
    serverVersion: detectionResult.serverVersion ?? 0,
    conflictingFields: detectionResult.conflictingFields ?? [],
    clientPayload: operation.payload as Record<string, unknown>,
    serverPayload: detectionResult.serverPayload ?? {},
    resolution,
    userNotified: false,
    userResolution: userResolution ?? null,
    detectedAt: new Date().toISOString(),
    resolvedAt:
      resolution === "manual" && !userResolution
        ? null
        : new Date().toISOString(),
  };

  await addConflictLogEntry(entry);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("huchu:conflict-detected", { detail: { entry } }),
    );
  }
}

// ── Entity Update ────────────────────────────────────────────────────────────

async function updateEntityWithServerData(
  tempId: string,
  serverPayload: Record<string, unknown>,
  serverVersion: number,
): Promise<void> {
  const entity = await findOneByIndex<LocalEntityRecordV2>(
    DB_STORES.entityStore,
    "tempId",
    tempId,
  );
  if (!entity) return;

  const updated: LocalEntityRecordV2 = {
    ...entity,
    payload: { ...entity.payload, ...serverPayload },
    versionVector: serverVersion,
    status: "SYNCED",
    updatedAt: new Date().toISOString(),
  };

  await putRecord(DB_STORES.entityStore, updated);
}

// ── Notification Builder ─────────────────────────────────────────────────────

function buildConflictNotification(
  operation: OfflineOutboxOperationV2,
  detectionResult: ConflictDetectionResult,
): string {
  const entityType = humanizeEntityType(operation.entityType);

  if (detectionResult.conflictType === "deleted_on_server") {
    return `The ${entityType} you were editing has been deleted by another user. Your changes could not be saved.`;
  }

  const fields = detectionResult.conflictingFields ?? [];
  if (fields.length === 1) {
    return `Your change to "${fields[0]}" on this ${entityType} was overridden by a newer version from the server.`;
  }

  return `Some of your changes to this ${entityType} (${fields.join(", ")}) were overridden by a newer version from the server.`;
}

function humanizeEntityType(entityType: string): string {
  const map: Record<string, string> = {
    seller: "seller",
    customer: "customer",
    ticket: "ticket",
    sale: "sale",
    purchase: "purchase",
    material: "material",
    batch: "batch",
    lot: "lot",
  };
  return map[entityType] ?? entityType;
}

// ── Conflict Log Queries ─────────────────────────────────────────────────────

export { getUnresolvedConflicts };

export async function markConflictUserNotified(
  conflictId: string,
): Promise<void> {
  const conflict = await getRecord<ConflictLogEntry>(
    DB_STORES.conflictLog,
    conflictId,
  );
  if (!conflict) return;

  await putRecord(DB_STORES.conflictLog, {
    ...conflict,
    userNotified: true,
  });
}

export async function resolveConflictManually(
  conflictId: string,
  userResolution: Record<string, unknown>,
): Promise<void> {
  const conflict = await getRecord<ConflictLogEntry>(
    DB_STORES.conflictLog,
    conflictId,
  );
  if (!conflict) throw new Error("Conflict not found");

  await putRecord(DB_STORES.conflictLog, {
    ...conflict,
    resolution: "manual" as const,
    userResolution,
    resolvedAt: new Date().toISOString(),
  });

  // TODO: Re-queue the operation with merged payload
}

// ── React Hook ───────────────────────────────────────────────────────────────

export interface UseConflictNotificationsReturn {
  conflicts: ConflictNotification[];
  hasUnread: boolean;
  dismissNotification: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useConflictNotifications(
  tenantKey: string,
): UseConflictNotificationsReturn {
  const [conflicts, setConflicts] = useState<ConflictNotification[]>([]);
  const [hasUnread, setHasUnread] = useState(false);

  const loadConflicts = useCallback(async () => {
    try {
      const entries = await getUnresolvedConflicts(tenantKey);
      const notifications: ConflictNotification[] = entries.map((entry) => ({
        id: entry.id,
        message: buildMessage(entry),
        entityType: entry.entityType,
        detectedAt: entry.detectedAt,
        shown: entry.userNotified,
      }));
      setConflicts(notifications);
      setHasUnread(notifications.some((n) => !n.shown));
    } catch {
      // Non-critical
    }
  }, [tenantKey]);

  useEffect(() => {
    loadConflicts();

    const handler = () => loadConflicts();
    window.addEventListener("huchu:conflict-detected", handler);
    return () => window.removeEventListener("huchu:conflict-detected", handler);
  }, [loadConflicts]);

  const dismissNotification = useCallback(
    async (id: string) => {
      await markConflictUserNotified(id);
      setConflicts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, shown: true } : c)),
      );
      setHasUnread((prev) =>
        conflicts.some((c) => c.id !== id && !c.shown),
      );
    },
    [conflicts],
  );

  return {
    conflicts: conflicts.filter((c) => !c.shown),
    hasUnread,
    dismissNotification,
    refresh: loadConflicts,
  };
}

function buildMessage(entry: ConflictLogEntry): string {
  const fields = entry.conflictingFields;
  if (fields.length === 0) {
    return `A ${humanizeEntityType(entry.entityType)} was modified by another user.`;
  }
  return `Your changes to ${fields.join(", ")} were overridden by a newer server version.`;
}
