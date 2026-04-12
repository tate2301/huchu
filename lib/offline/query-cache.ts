import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";
import {
  OFFLINE_DB_STORES,
  deleteOfflineRecord,
  listOfflineRecords,
  putOfflineRecord,
} from "@/lib/offline/db";
import type { PersistedQueryRecord } from "@/lib/offline/types";

const DEFAULT_QUERY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function serializeQueryKey(queryKey: QueryKey) {
  return JSON.stringify(queryKey);
}

function inferModuleId(queryKey: QueryKey) {
  const first = queryKey[0];
  if (typeof first !== "string") return null;
  if (
    first.startsWith("scrap-") ||
    first === "sites" ||
    first === "employees"
  ) {
    return "scrap-metal";
  }
  if (
    first.startsWith("hr-") ||
    first === "shift-groups" ||
    first === "shift-group-schedules" ||
    first === "disciplinary-actions"
  ) {
    return "hr-workforce-core";
  }
  if (first.startsWith("retail-") || first === "pos-sites") {
    return "retail-pos";
  }
  return null;
}

export async function persistOfflineQueryRecord(
  query: Query,
  tenantKey: string,
) {
  if (query.state.status !== "success") return;
  if (typeof query.state.data === "undefined") return;

  const queryKey = query.queryKey;
  const record: PersistedQueryRecord = {
    id: `${tenantKey}:${serializeQueryKey(queryKey)}`,
    tenantKey,
    queryKey: [...queryKey],
    data: query.state.data,
    updatedAt: Date.now(),
    maxAgeMs: DEFAULT_QUERY_MAX_AGE_MS,
    moduleId: inferModuleId(queryKey),
  };
  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, record);
}

export async function restoreOfflineQueries(
  queryClient: QueryClient,
  tenantKey: string,
) {
  const records = await listOfflineRecords<PersistedQueryRecord>(OFFLINE_DB_STORES.queryCache);
  const now = Date.now();
  for (const record of records) {
    if (record.tenantKey !== tenantKey) {
      continue;
    }
    if (record.updatedAt + record.maxAgeMs < now) {
      await deleteOfflineRecord(OFFLINE_DB_STORES.queryCache, record.id);
      continue;
    }
    queryClient.setQueryData(record.queryKey, record.data, {
      updatedAt: record.updatedAt,
    });
  }
}

export async function pruneOfflineQueries(tenantKey?: string) {
  const records = await listOfflineRecords<PersistedQueryRecord>(OFFLINE_DB_STORES.queryCache);
  const now = Date.now();
  await Promise.all(
    records
      .filter(
        (record) =>
          (!tenantKey || record.tenantKey === tenantKey) &&
          record.updatedAt + record.maxAgeMs < now,
      )
      .map((record) => deleteOfflineRecord(OFFLINE_DB_STORES.queryCache, record.id)),
  );
}
