const OFFLINE_DB_NAME = "huchu-offline";
const OFFLINE_DB_VERSION = 2;

export const OFFLINE_DB_STORES = {
  sessionBootstrap: "sessionBootstrap",
  bootstrapState: "bootstrapState",
  queryCache: "queryCache",
  entityStore: "entityStore",
  outbox: "outbox",
  attachmentStore: "attachmentStore",
} as const;

type StoreName = (typeof OFFLINE_DB_STORES)[keyof typeof OFFLINE_DB_STORES];

let openPromise: Promise<IDBDatabase> | null = null;

function promisifyRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function createStores(database: IDBDatabase) {
  if (!database.objectStoreNames.contains(OFFLINE_DB_STORES.sessionBootstrap)) {
    database.createObjectStore(OFFLINE_DB_STORES.sessionBootstrap, {
      keyPath: "id",
    });
  }

  if (!database.objectStoreNames.contains(OFFLINE_DB_STORES.bootstrapState)) {
    database.createObjectStore(OFFLINE_DB_STORES.bootstrapState, {
      keyPath: "id",
    });
  }

  if (!database.objectStoreNames.contains(OFFLINE_DB_STORES.queryCache)) {
    const store = database.createObjectStore(OFFLINE_DB_STORES.queryCache, {
      keyPath: "id",
    });
    store.createIndex("updatedAt", "updatedAt");
  }

  if (!database.objectStoreNames.contains(OFFLINE_DB_STORES.entityStore)) {
    const store = database.createObjectStore(OFFLINE_DB_STORES.entityStore, {
      keyPath: "id",
    });
    store.createIndex("tempId", "tempId", { unique: true });
    store.createIndex("moduleId", "moduleId");
    store.createIndex("entityType", "entityType");
    store.createIndex("status", "status");
  }

  if (!database.objectStoreNames.contains(OFFLINE_DB_STORES.outbox)) {
    const store = database.createObjectStore(OFFLINE_DB_STORES.outbox, {
      keyPath: "operationId",
    });
    store.createIndex("status", "status");
    store.createIndex("moduleId", "moduleId");
    store.createIndex("nextRetryAt", "nextRetryAt");
  }

  if (!database.objectStoreNames.contains(OFFLINE_DB_STORES.attachmentStore)) {
    database.createObjectStore(OFFLINE_DB_STORES.attachmentStore, {
      keyPath: "attachmentId",
    });
  }
}

export function openOfflineDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }

  if (!openPromise) {
    openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
      request.onupgradeneeded = () => {
        createStores(request.result);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
    });
  }

  return openPromise;
}

export async function getOfflineRecord<T>(storeName: StoreName, key: IDBValidKey) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const result = await promisifyRequest(store.get(key));
  await waitForTransaction(transaction);
  return (result ?? null) as T | null;
}

export async function putOfflineRecord<T>(storeName: StoreName, value: T) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  await promisifyRequest(store.put(value));
  await waitForTransaction(transaction);
}

export async function deleteOfflineRecord(storeName: StoreName, key: IDBValidKey) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  await promisifyRequest(store.delete(key));
  await waitForTransaction(transaction);
}

export async function listOfflineRecords<T>(storeName: StoreName) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const result = await promisifyRequest(store.getAll());
  await waitForTransaction(transaction);
  return result as T[];
}

export async function findOfflineRecordByIndex<T>(
  storeName: StoreName,
  indexName: string,
  key: IDBValidKey,
) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const result = await promisifyRequest(store.index(indexName).get(key));
  await waitForTransaction(transaction);
  return (result ?? null) as T | null;
}

export async function clearOfflineStore(storeName: StoreName) {
  const database = await openOfflineDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  await promisifyRequest(store.clear());
  await waitForTransaction(transaction);
}
