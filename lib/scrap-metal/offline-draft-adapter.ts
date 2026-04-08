type TicketDraftType = "inbound" | "outbound";

const KEY_PREFIX = "scrap_ticket_draft";

function key(type: TicketDraftType) {
  return `${KEY_PREFIX}:${type}`;
}

export function saveLocalTicketDraft(type: TicketDraftType, payload: unknown): void {
  if (typeof window === "undefined") return;
  const envelope = {
    savedAt: new Date().toISOString(),
    payload,
  };
  window.localStorage.setItem(key(type), JSON.stringify(envelope));
}

export function loadLocalTicketDraft<T>(type: TicketDraftType): { savedAt: string; payload: T } | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key(type));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { savedAt: string; payload: T };
  } catch {
    return null;
  }
}

export function clearLocalTicketDraft(type: TicketDraftType): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(type));
}

