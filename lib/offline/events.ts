export const OFFLINE_OUTBOX_CHANGED_EVENT = "huchu:offline-outbox-changed";
export const OFFLINE_ENTITIES_CHANGED_EVENT = "huchu:offline-entities-changed";
export const OFFLINE_SESSION_CHANGED_EVENT = "huchu:offline-session-changed";
export const OFFLINE_BOOTSTRAP_CHANGED_EVENT = "huchu:offline-bootstrap-changed";

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

export function emitOfflineSessionChanged() {
  emit(OFFLINE_SESSION_CHANGED_EVENT);
}

export function emitOfflineBootstrapChanged() {
  emit(OFFLINE_BOOTSTRAP_CHANGED_EVENT);
}
