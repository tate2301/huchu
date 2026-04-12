import type { AuthSessionClaims } from "@/lib/auth-core/types";
import { OFFLINE_DB_STORES, deleteOfflineRecord, getOfflineRecord, putOfflineRecord } from "@/lib/offline/db";
import { emitOfflineSessionChanged } from "@/lib/offline/events";
import { buildTenantScopedSessionId } from "@/lib/offline/tenant-context";
import type { OfflineSessionBootstrap } from "@/lib/offline/types";

export async function saveOfflineSessionBootstrap(
  tenantKey: string,
  user: AuthSessionClaims,
) {
  const record: OfflineSessionBootstrap = {
    id: buildTenantScopedSessionId(tenantKey),
    tenantKey,
    capturedAt: new Date().toISOString(),
    expiresAt: user.authExpiresAt ?? null,
    user,
  };
  await putOfflineRecord(OFFLINE_DB_STORES.sessionBootstrap, record);
  emitOfflineSessionChanged();
  return record;
}

export function getOfflineSessionBootstrap(tenantKey: string) {
  return getOfflineRecord<OfflineSessionBootstrap>(
    OFFLINE_DB_STORES.sessionBootstrap,
    buildTenantScopedSessionId(tenantKey),
  );
}

export async function clearOfflineSessionBootstrap(tenantKey: string) {
  await deleteOfflineRecord(
    OFFLINE_DB_STORES.sessionBootstrap,
    buildTenantScopedSessionId(tenantKey),
  );
  emitOfflineSessionChanged();
}

export function isOfflineSessionBootstrapExpired(
  record: OfflineSessionBootstrap | null | undefined,
) {
  if (!record?.expiresAt) return false;
  const parsed = Date.parse(record.expiresAt);
  if (Number.isNaN(parsed)) return false;
  return parsed <= Date.now();
}
