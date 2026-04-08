import { clearOfflineDraft, loadOfflineDraft, saveOfflineDraft } from "@/lib/offline/client-storage";

type TicketDraftType = "inbound" | "outbound";

const KEY_PREFIX = "scrap_ticket_draft";

function key(type: TicketDraftType) {
  return `${KEY_PREFIX}:${type}`;
}

export function saveLocalTicketDraft(type: TicketDraftType, payload: unknown): void {
  saveOfflineDraft(key(type), payload);
}

export function loadLocalTicketDraft<T>(type: TicketDraftType): { savedAt: string; payload: T } | null {
  return loadOfflineDraft<T>(key(type));
}

export function clearLocalTicketDraft(type: TicketDraftType): void {
  clearOfflineDraft(key(type));
}
