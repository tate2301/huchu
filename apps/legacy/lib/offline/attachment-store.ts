import { OFFLINE_DB_STORES, deleteOfflineRecord, getOfflineRecord, listOfflineRecords, putOfflineRecord } from "@/lib/offline/db";
import type { OfflineAttachmentRecord, OfflineAttachmentRef } from "@/lib/offline/types";

export function createOfflineAttachmentId(context: string) {
  return `attachment:${context}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export async function storeOfflineAttachment(
  file: File,
  context: string,
  tenantKey: string,
) {
  const attachmentId = createOfflineAttachmentId(context);
  const record: OfflineAttachmentRecord = {
    tenantKey,
    attachmentId,
    context,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    createdAt: new Date().toISOString(),
    blob: file,
  };
  await putOfflineRecord(OFFLINE_DB_STORES.attachmentStore, record);
  const ref: OfflineAttachmentRef = {
    tenantKey,
    attachmentId,
    context,
    fileName: record.fileName,
    contentType: record.contentType,
    size: record.size,
  };
  return {
    record,
    ref,
  };
}

export async function getOfflineAttachmentRecord(
  attachmentId: string,
  tenantKey?: string,
) {
  const record = await getOfflineRecord<OfflineAttachmentRecord>(
    OFFLINE_DB_STORES.attachmentStore,
    attachmentId,
  );
  if (!record) return null;
  if (tenantKey && record.tenantKey !== tenantKey) return null;
  return record;
}

export function listOfflineAttachmentRecords(tenantKey?: string) {
  return listOfflineRecords<OfflineAttachmentRecord>(
    OFFLINE_DB_STORES.attachmentStore,
  ).then((records) =>
    tenantKey
      ? records.filter((record) => record.tenantKey === tenantKey)
      : records,
  );
}

export async function deleteOfflineAttachmentRecord(attachmentId: string) {
  await deleteOfflineRecord(OFFLINE_DB_STORES.attachmentStore, attachmentId);
}
