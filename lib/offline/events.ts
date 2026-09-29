export const OFFLINE_OUTBOX_CHANGED_EVENT = "huchu:offline-outbox-changed";
export const OFFLINE_ENTITIES_CHANGED_EVENT = "huchu:offline-entities-changed";

function emit(name: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name));
}

export function emitOfflineOutboxChanged() {
  emit(OFFLINE_OUTBOX_CHANGED_EVENT);
}

export function emitOfflineEntitiesChanged() {
  emit(OFFLINE_ENTITIES_CHANGED_EVENT);
}
