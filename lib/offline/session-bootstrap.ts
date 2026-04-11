import type { AuthSessionClaims } from "@/lib/auth-core/types";
import { OFFLINE_DB_STORES, deleteOfflineRecord, getOfflineRecord, putOfflineRecord } from "@/lib/offline/db";
import { emitOfflineSessionChanged } from "@/lib/offline/events";
import type { OfflineSessionBootstrap } from "@/lib/offline/types";

const CURRENT_SESSION_BOOTSTRAP_ID = "current";

export async function saveOfflineSessionBootstrap(user: AuthSessionClaims) {
  const record: OfflineSessionBootstrap = {
    id: CURRENT_SESSION_BOOTSTRAP_ID,
    capturedAt: new Date().toISOString(),
    expiresAt: user.authExpiresAt ?? null,
    user,
  };
  await putOfflineRecord(OFFLINE_DB_STORES.sessionBootstrap, record);
  emitOfflineSessionChanged();
  return record;
}

export function getOfflineSessionBootstrap() {
  return getOfflineRecord<OfflineSessionBootstrap>(
    OFFLINE_DB_STORES.sessionBootstrap,
    CURRENT_SESSION_BOOTSTRAP_ID,
  );
}

export async function clearOfflineSessionBootstrap() {
  await deleteOfflineRecord(OFFLINE_DB_STORES.sessionBootstrap, CURRENT_SESSION_BOOTSTRAP_ID);
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
