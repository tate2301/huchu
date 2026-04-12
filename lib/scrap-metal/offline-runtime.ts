import type { ScrapTicketPhoto } from "@/lib/scrap-metal/attachments";
import { storeOfflineAttachment } from "@/lib/offline/attachment-store";
import { listOfflineLocalEntities, upsertOfflineLocalEntity } from "@/lib/offline/entity-store";
import {
  enqueueOfflineOperation,
  findOfflineOperationForLocalEntity,
  listOfflineOperationsForModule,
} from "@/lib/offline/outbox";
import type { OfflineAttachmentRef } from "@/lib/offline/types";

export const SCRAP_OFFLINE_MODULE_ID = "scrap-metal";

export type LocalScrapTicketPhoto = ScrapTicketPhoto & {
  offlineAttachmentId?: string;
};

export type ScrapLocalSellerPayload = {
  fullName: string;
  phone: string;
  nationalId: string;
  address?: string;
  notes?: string;
};

export async function createOfflineScrapSeller(
  tenantKey: string,
  payload: ScrapLocalSellerPayload,
) {
  const record = await upsertOfflineLocalEntity({
    tenantKey,
    moduleId: SCRAP_OFFLINE_MODULE_ID,
    entityType: "seller",
    displayLabel: payload.fullName,
    searchableText: [payload.fullName, payload.phone, payload.nationalId].filter(Boolean).join(" "),
    payload,
  });

  const operation = await enqueueOfflineOperation({
    tenantKey,
    moduleId: SCRAP_OFFLINE_MODULE_ID,
    clientRequestId: record.tempId,
    entityType: "seller",
    operation: "create-seller",
    dependsOn: [],
    payload,
    localRefs: {
      entityId: record.tempId,
    },
    attachments: [],
    syncPriority: 10,
  });

  return {
    record,
    operation,
  };
}

export async function listOfflineScrapSellers(tenantKey: string) {
  const records = await listOfflineLocalEntities({
    tenantKey,
    moduleId: SCRAP_OFFLINE_MODULE_ID,
    entityType: "seller",
  });
  return records.map((record) => ({
    id: record.serverId ?? record.tempId,
    fullName: String(record.payload.fullName ?? record.displayLabel),
    phone: String(record.payload.phone ?? ""),
    nationalId: String(record.payload.nationalId ?? ""),
    isOfflineEntity: true,
    offlineStatus: record.status,
    tempId: record.tempId,
  }));
}

export async function createOfflineScrapAttachment(
  tenantKey: string,
  file: File,
  context: "scrap-purchase-ticket-photo" | "scrap-sale-ticket-photo",
) {
  const { ref } = await storeOfflineAttachment(file, context, tenantKey);
  const previewUrl = URL.createObjectURL(file);
  const photo: LocalScrapTicketPhoto = {
    url: previewUrl,
    pathname: `offline-attachment:${ref.attachmentId}`,
    contentType:
      ref.contentType === "image/jpeg" ||
      ref.contentType === "image/png" ||
      ref.contentType === "image/webp"
        ? ref.contentType
        : "image/jpeg",
    size: ref.size,
    context,
    uploadedAt: new Date().toISOString(),
    offlineAttachmentId: ref.attachmentId,
  };
  return {
    ref,
    photo,
  };
}

function splitScrapAttachmentState(
  tenantKey: string,
  attachments: LocalScrapTicketPhoto[],
) {
  const remoteAttachments: ScrapTicketPhoto[] = [];
  const offlineRefs: OfflineAttachmentRef[] = [];

  for (const attachment of attachments) {
    if (attachment.offlineAttachmentId) {
      offlineRefs.push({
        tenantKey,
        attachmentId: attachment.offlineAttachmentId,
        context: attachment.context,
        fileName: attachment.pathname?.replace("offline-attachment:", "") || attachment.offlineAttachmentId,
        contentType: attachment.contentType,
        size: attachment.size,
      });
      continue;
    }
    remoteAttachments.push({
      url: attachment.url,
      pathname: attachment.pathname,
      contentType: attachment.contentType,
      size: attachment.size,
      context: attachment.context,
      uploadedAt: attachment.uploadedAt,
    });
  }

  return {
    remoteAttachments,
    offlineRefs,
  };
}

export async function queueOfflineScrapInboundTicket(input: {
  tenantKey: string;
  clientRequestId: string;
  payload: Record<string, unknown>;
  attachments: LocalScrapTicketPhoto[];
  dependsOn?: string[];
  sellerTempId?: string | null;
}) {
  const sellerCreateOperation =
    input.sellerTempId
      ? await findOfflineOperationForLocalEntity(
          SCRAP_OFFLINE_MODULE_ID,
          input.tenantKey,
          input.sellerTempId,
          "create-seller",
        )
      : null;
  const attachmentState = splitScrapAttachmentState(
    input.tenantKey,
    input.attachments,
  );
  return enqueueOfflineOperation({
    tenantKey: input.tenantKey,
    moduleId: SCRAP_OFFLINE_MODULE_ID,
    clientRequestId: input.clientRequestId,
    entityType: "scrap-inbound-ticket",
    operation: "create-inbound-ticket",
    dependsOn: [
      ...(input.dependsOn ?? []),
      ...(sellerCreateOperation ? [sellerCreateOperation.operationId] : []),
    ],
    payload: {
      ...input.payload,
      attachments: attachmentState.remoteAttachments,
    },
    localRefs: input.sellerTempId
      ? {
          sellerProfileId: input.sellerTempId,
        }
      : undefined,
    attachments: attachmentState.offlineRefs,
    syncPriority: 20,
  });
}

export async function queueOfflineScrapOutboundTicket(input: {
  tenantKey: string;
  clientRequestId: string;
  payload: Record<string, unknown>;
  attachments: LocalScrapTicketPhoto[];
  dependsOn?: string[];
}) {
  const attachmentState = splitScrapAttachmentState(
    input.tenantKey,
    input.attachments,
  );
  return enqueueOfflineOperation({
    tenantKey: input.tenantKey,
    moduleId: SCRAP_OFFLINE_MODULE_ID,
    clientRequestId: input.clientRequestId,
    entityType: "scrap-outbound-ticket",
    operation: "create-outbound-ticket",
    dependsOn: input.dependsOn ?? [],
    payload: {
      ...input.payload,
      attachments: attachmentState.remoteAttachments,
    },
    attachments: attachmentState.offlineRefs,
    syncPriority: 20,
  });
}

export function listOfflineScrapOperations(tenantKey?: string) {
  return listOfflineOperationsForModule(SCRAP_OFFLINE_MODULE_ID, tenantKey);
}

export function isOfflineScrapEntityId(value: string | null | undefined) {
  return Boolean(value && value.startsWith("local:scrap-metal:seller:"));
}
