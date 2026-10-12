import { listOfflineLocalEntities, searchOfflineLocalEntities, upsertOfflineLocalEntity } from "@/lib/offline/entity-store";
import {
  enqueueOfflineOperation,
  findOfflineOperationForLocalEntity,
  listOfflineOperationsForModule,
} from "@/lib/offline/outbox";
import type { OfflineOutboxOperation } from "@/lib/offline/types";
import { newPosCustomer } from "@/lib/retail/customers/pos-customer";
import type { PosReversalQueuePayload, PosSaleQueuePayload } from "@/lib/retail/pos-offline-queue";

export const RETAIL_POS_OFFLINE_MODULE_ID = "retail-pos";

export type RetailOfflineCustomerPayload = {
  name: string;
  phone: string;
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
    searchableText: [payload.name, payload.phone].filter(Boolean).join(" "),
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
    ...newPosCustomer({
      id: record.serverId ?? record.tempId,
      name: String(record.payload.name ?? record.displayLabel),
      phone: (record.payload.phone as string | null | undefined) ?? null,
    }),
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

/** A refund or void done while the line was down (FLR-09): it goes in for review if a manager it needed is still missing. */
export function queueOfflineRetailReversal(input: { tenantKey: string; payload: PosReversalQueuePayload }) {
  return enqueueOfflineOperation({
    tenantKey: input.tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    clientRequestId: `${input.payload.kind}:${input.payload.saleId}:${input.payload.at}`,
    entityType: "retail-sale",
    operation: "reverse-sale",
    dependsOn: [],
    payload: input.payload,
    attachments: [],
    syncPriority: 30,
  });
}

export function listOfflineRetailReversals(tenantKey?: string) {
  return listOfflineOperationsForModule(RETAIL_POS_OFFLINE_MODULE_ID, tenantKey).then((operations) =>
    operations.filter((operation): operation is OfflineOutboxOperation<PosReversalQueuePayload> => operation.operation === "reverse-sale"),
  );
}

export function isOfflineRetailCustomerId(value: string | null | undefined) {
  return Boolean(value && value.startsWith("local:retail-pos:customer:"));
}
