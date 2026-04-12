import { listOfflineLocalEntities, searchOfflineLocalEntities, upsertOfflineLocalEntity } from "@/lib/offline/entity-store";
import {
  enqueueOfflineOperation,
  findOfflineOperationForLocalEntity,
  listOfflineOperationsForModule,
} from "@/lib/offline/outbox";
import type { OfflineOutboxOperation } from "@/lib/offline/types";
import type { PosSaleQueuePayload } from "@/lib/retail/pos-offline-queue";

export const RETAIL_POS_OFFLINE_MODULE_ID = "retail-pos";

export type RetailOfflineCustomerPayload = {
  name: string;
  phone?: string | null;
  email?: string | null;
};

export async function createOfflineRetailCustomer(
  tenantKey: string,
  payload: RetailOfflineCustomerPayload,
) {
  const record = await upsertOfflineLocalEntity({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    entityType: "customer",
    displayLabel: payload.name,
    searchableText: [payload.name, payload.phone, payload.email].filter(Boolean).join(" "),
    payload,
  });

  const operation = await enqueueOfflineOperation({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    clientRequestId: record.tempId,
    entityType: "customer",
    operation: "create-customer",
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

export async function searchOfflineRetailCustomers(
  tenantKey: string,
  search: string,
) {
  const records = await listOfflineLocalEntities({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    entityType: "customer",
  });
  return searchOfflineLocalEntities(records, search).map((record) => ({
    id: record.serverId ?? record.tempId,
    name: String(record.payload.name ?? record.displayLabel),
    phone: (record.payload.phone as string | null | undefined) ?? null,
    email: (record.payload.email as string | null | undefined) ?? null,
    loyaltyPoints: 0,
    loyaltyTier: "BRONZE",
    isOfflineEntity: true,
    tempId: record.tempId,
    offlineStatus: record.status,
  }));
}

export async function queueOfflineRetailSale(input: {
  tenantKey: string;
  payload: Record<string, unknown>;
  customerTempId?: string | null;
}) {
  const customerCreateOperation =
    input.customerTempId
      ? await findOfflineOperationForLocalEntity(
          RETAIL_POS_OFFLINE_MODULE_ID,
          input.tenantKey,
          input.customerTempId,
          "create-customer",
        )
      : null;

  return enqueueOfflineOperation({
    tenantKey: input.tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    clientRequestId: String(input.payload.saleNo ?? `sale:${Date.now()}`),
    entityType: "retail-sale",
    operation: "create-sale",
    dependsOn: customerCreateOperation ? [customerCreateOperation.operationId] : [],
    payload: input.payload,
    localRefs: input.customerTempId
      ? {
          customerId: input.customerTempId,
        }
      : undefined,
    attachments: [],
    syncPriority: 20,
  });
}

export function listOfflineRetailOperations(tenantKey?: string) {
  return listOfflineOperationsForModule(
    RETAIL_POS_OFFLINE_MODULE_ID,
    tenantKey,
  ).then((operations) =>
    operations.filter(
      (operation): operation is OfflineOutboxOperation<PosSaleQueuePayload> =>
        operation.operation === "create-sale",
    ),
  );
}

export function isOfflineRetailCustomerId(value: string | null | undefined) {
  return Boolean(value && value.startsWith("local:retail-pos:customer:"));
}
