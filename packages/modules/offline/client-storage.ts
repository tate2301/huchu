export type OfflineQueueEntry<TPayload> = {
  id: string;
  queuedAt: string;
  retryCount: number;
  status?: "QUEUED" | "RETRYING" | "FAILED";
  lastAttemptAt?: string;
  lastError?: string;
  payload: TPayload;
};

type LoadOptions<TPayload> = {
  key: string;
  isValid: (payload: TPayload) => boolean;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function makeQueueId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: T) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function read<T>(key: string): T | null {
  if (!isBrowser()) return null;
  return safeParse<T>(window.localStorage.getItem(key));
}

export function loadOfflineQueue<TPayload>(options: LoadOptions<TPayload>): Array<OfflineQueueEntry<TPayload>> {
  const parsed = read<Array<OfflineQueueEntry<TPayload>>>(options.key);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry) => Boolean(entry?.id) && Boolean(entry?.queuedAt) && options.isValid(entry.payload))
    .map((entry) => ({
      ...entry,
      retryCount: Number.isFinite(entry.retryCount) ? Math.max(0, entry.retryCount) : 0,
      status:
        entry.status === "FAILED" || entry.status === "RETRYING" || entry.status === "QUEUED"
          ? entry.status
          : "QUEUED",
      lastAttemptAt: typeof entry.lastAttemptAt === "string" ? entry.lastAttemptAt : undefined,
      lastError: typeof entry.lastError === "string" ? entry.lastError : undefined,
    }));
}

export function saveOfflineQueue<TPayload>(key: string, queue: Array<OfflineQueueEntry<TPayload>>) {
  write(key, queue);
}

export function enqueueOfflineItem<TPayload>(
  key: string,
  payload: TPayload,
  options?: { dedupe?: (existing: OfflineQueueEntry<TPayload>, incoming: TPayload) => boolean },
): OfflineQueueEntry<TPayload> {
  const queue = loadOfflineQueue<TPayload>({ key, isValid: () => true });
  const existing = options?.dedupe ? queue.find((entry) => options.dedupe?.(entry, payload)) : null;
  if (existing) return existing;

  const next: OfflineQueueEntry<TPayload> = {
    id: makeQueueId(),
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    payload,
  };
  saveOfflineQueue(key, [...queue, next]);
  return next;
}

export function removeOfflineItem<TPayload>(key: string, id: string) {
  const queue = loadOfflineQueue<TPayload>({ key, isValid: () => true });
  saveOfflineQueue(
    key,
    queue.filter((entry) => entry.id !== id),
  );
}

export function bumpOfflineRetry<TPayload>(key: string, id: string) {
  const queue = loadOfflineQueue<TPayload>({ key, isValid: () => true });
  saveOfflineQueue(
    key,
    queue.map((entry) =>
      entry.id === id
        ? { ...entry, retryCount: entry.retryCount + 1, status: "RETRYING", lastAttemptAt: new Date().toISOString() }
        : entry,
    ),
  );
}

export function failOfflineItem<TPayload>(key: string, id: string, message: string) {
  const queue = loadOfflineQueue<TPayload>({ key, isValid: () => true });
  saveOfflineQueue(
    key,
    queue.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            status: "FAILED",
            lastAttemptAt: new Date().toISOString(),
            lastError: message.slice(0, 220),
          }
        : entry,
    ),
  );
}

export function markOfflineItemQueued<TPayload>(key: string, id: string) {
  const queue = loadOfflineQueue<TPayload>({ key, isValid: () => true });
  saveOfflineQueue(
    key,
    queue.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            status: "QUEUED",
            lastError: undefined,
          }
        : entry,
    ),
  );
}

export function saveOfflineDraft<TPayload>(key: string, payload: TPayload): void {
  write(key, {
    savedAt: new Date().toISOString(),
    payload,
  });
}

export function loadOfflineDraft<TPayload>(key: string): { savedAt: string; payload: TPayload } | null {
  const parsed = read<{ savedAt: string; payload: TPayload }>(key);
  if (!parsed || typeof parsed.savedAt !== "string") return null;
  return parsed;
}

export function clearOfflineDraft(key: string): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(key);
}
