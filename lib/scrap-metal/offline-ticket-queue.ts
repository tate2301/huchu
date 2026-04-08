import {
  bumpOfflineRetry,
  enqueueOfflineItem,
  loadOfflineQueue,
  removeOfflineItem,
  type OfflineQueueEntry,
} from "@/lib/offline/client-storage";

export type ScrapTicketOutboxOperation =
  | {
      operation: "create-inbound-ticket";
      clientRequestId: string;
      intent: "hold" | "finalize" | "finalize_print";
      payload: Record<string, unknown>;
    }
  | {
      operation: "create-outbound-ticket";
      clientRequestId: string;
      intent: "hold" | "submit" | "submit_print" | "request_approval";
      payload: Record<string, unknown>;
    };

export type QueuedScrapTicketOperation = OfflineQueueEntry<ScrapTicketOutboxOperation>;

const SCRAP_TICKET_OUTBOX_KEY = "scrap_ticket_outbox_v1";

function isValidOperation(payload: ScrapTicketOutboxOperation) {
  return (
    Boolean(payload?.clientRequestId) &&
    (payload?.operation === "create-inbound-ticket" || payload?.operation === "create-outbound-ticket")
  );
}

export function makeScrapTicketRequestId() {
  return `scrap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadQueuedScrapTicketOperations(): QueuedScrapTicketOperation[] {
  return loadOfflineQueue({
    key: SCRAP_TICKET_OUTBOX_KEY,
    isValid: isValidOperation,
  });
}

export function queueScrapTicketOperation(payload: ScrapTicketOutboxOperation): QueuedScrapTicketOperation {
  return enqueueOfflineItem<ScrapTicketOutboxOperation>(SCRAP_TICKET_OUTBOX_KEY, payload, {
    dedupe: (existing, incoming) => existing.payload.clientRequestId === incoming.clientRequestId,
  });
}

export function removeQueuedScrapTicketOperation(id: string) {
  removeOfflineItem<ScrapTicketOutboxOperation>(SCRAP_TICKET_OUTBOX_KEY, id);
}

export function bumpQueuedScrapTicketRetry(id: string) {
  bumpOfflineRetry<ScrapTicketOutboxOperation>(SCRAP_TICKET_OUTBOX_KEY, id);
}
