/**
 * Scale Integration — Offline Support
 *
 * Caches the last scale reading locally so operators can
 * continue working even when the scale connection drops.
 * Provides manual weight entry as a universal fallback.
 */

import { OFFLINE_DB_STORES, getOfflineRecord, putOfflineRecord } from "@/lib/offline/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScaleReading {
  /** Weight in kilograms */
  weightKg: number;
  /** Timestamp of reading */
  timestamp: string;
  /** Scale device identifier */
  deviceId?: string;
  /** Whether the reading was manually entered */
  isManualEntry: boolean;
  /** Tare weight subtracted */
  tareKg?: number;
  /** Gross weight before tare */
  grossWeightKg?: number;
  /** Number of decimal places from scale */
  precision: number;
  /** Scale connection status at time of reading */
  scaleConnected: boolean;
  /** Site ID */
  siteId?: string;
}

export interface ScaleDeviceInfo {
  deviceId: string;
  name: string;
  type: "bluetooth" | "usb" | "serial" | "network";
  pairedAt: string;
  lastConnectedAt: string;
  isConnected: boolean;
  siteId?: string;
}

export interface ManualWeightEntry {
  weightKg: number;
  enteredAt: string;
  enteredBy: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAST_WEIGHT_CACHE_KEY = "scrap:scale:last-weight";
const SCALE_DEVICE_CACHE_KEY = "scrap:scale:device";
const SCALE_READING_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Weight caching
// ---------------------------------------------------------------------------

/**
 * Cache the latest weight reading from the scale.
 * Called whenever a new reading arrives (via Bluetooth/USB/serial).
 */
export async function cacheWeight(reading: Omit<ScaleReading, "timestamp">): Promise<ScaleReading> {
  const fullReading: ScaleReading = {
    ...reading,
    timestamp: new Date().toISOString(),
  };

  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: LAST_WEIGHT_CACHE_KEY,
    tenantKey: "",
    queryKey: ["scrap-scale-last-weight"],
    data: fullReading,
    updatedAt: Date.now(),
    maxAgeMs: SCALE_READING_MAX_AGE_MS,
    moduleId: "scrap-metal",
  });

  return fullReading;
}

/**
 * Get the last cached weight reading.
 * Returns null if no reading is cached or if the cache is stale (> 30 min).
 */
export async function getLastWeight(): Promise<ScaleReading | null> {
  const record = await getOfflineRecord<{
    data: ScaleReading;
    updatedAt: number;
    maxAgeMs: number;
  }>(OFFLINE_DB_STORES.queryCache, LAST_WEIGHT_CACHE_KEY);

  if (!record?.data) return null;

  const ageMs = Date.now() - record.updatedAt;
  if (ageMs > record.maxAgeMs) {
    // Reading is stale — still return it but the caller should show a warning
    return {
      ...record.data,
      scaleConnected: false,
    };
  }

  return record.data;
}

/**
 * Get the last weight value as a simple number.
 * Returns 0 if no cached reading.
 */
export async function getLastWeightValue(): Promise<number> {
  const reading = await getLastWeight();
  return reading?.weightKg ?? 0;
}

/**
 * Get the age of the last weight reading in milliseconds.
 */
export async function getLastWeightAgeMs(): Promise<number> {
  const record = await getOfflineRecord<{
    data: ScaleReading;
    updatedAt: number;
  }>(OFFLINE_DB_STORES.queryCache, LAST_WEIGHT_CACHE_KEY);

  if (!record) return Infinity;
  return Date.now() - record.updatedAt;
}

/**
 * Check if the last weight reading is fresh (< 30 min old).
 */
export async function isLastWeightFresh(): Promise<boolean> {
  const ageMs = await getLastWeightAgeMs();
  return ageMs < SCALE_READING_MAX_AGE_MS;
}

// ---------------------------------------------------------------------------
// Scale connection status
// ---------------------------------------------------------------------------

/**
 * Check if a scale device is currently connected.
 * This checks the cached device status — actual connectivity
 * requires a hardware check via the scale adapter.
 */
export async function isScaleConnected(): Promise<boolean> {
  const device = await getCachedScaleDevice();
  return device?.isConnected ?? false;
}

/**
 * Get the cached scale device info.
 */
export async function getCachedScaleDevice(): Promise<ScaleDeviceInfo | null> {
  const record = await getOfflineRecord<{
    data: ScaleDeviceInfo;
  }>(OFFLINE_DB_STORES.queryCache, SCALE_DEVICE_CACHE_KEY);

  return record?.data ?? null;
}

/**
 * Cache the paired scale device info.
 */
export async function cacheScaleDevice(device: ScaleDeviceInfo): Promise<void> {
  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: SCALE_DEVICE_CACHE_KEY,
    tenantKey: "",
    queryKey: ["scrap-scale-device"],
    data: device,
    updatedAt: Date.now(),
    maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    moduleId: "scrap-metal",
  });
}

/**
 * Mark the scale as disconnected.
 */
export async function markScaleDisconnected(): Promise<void> {
  const device = await getCachedScaleDevice();
  if (device) {
    await cacheScaleDevice({
      ...device,
      isConnected: false,
      lastConnectedAt: new Date().toISOString(),
    });
  }
}

/**
 * Mark the scale as connected.
 */
export async function markScaleConnected(deviceId: string): Promise<void> {
  const device = await getCachedScaleDevice();
  if (device && device.deviceId === deviceId) {
    await cacheScaleDevice({
      ...device,
      isConnected: true,
      lastConnectedAt: new Date().toISOString(),
    });
  }
}

/**
 * Forget the paired scale device.
 */
export async function forgetScaleDevice(): Promise<void> {
  const { deleteOfflineRecord } = await import("@/lib/offline/db");
  await deleteOfflineRecord(OFFLINE_DB_STORES.queryCache, SCALE_DEVICE_CACHE_KEY);
}

// ---------------------------------------------------------------------------
// Manual weight entry (universal fallback)
// ---------------------------------------------------------------------------

/**
 * Store a manually-entered weight.
 * This is the fallback when no scale is connected.
 */
export async function manualWeightEntry(
  weightKg: number,
  operatorId: string,
  reason?: string,
): Promise<ScaleReading> {
  const entry: ManualWeightEntry = {
    weightKg,
    enteredAt: new Date().toISOString(),
    enteredBy: operatorId,
    reason: reason ?? "Manual entry (no scale)",
  };

  const reading = await cacheWeight({
    weightKg,
    isManualEntry: true,
    precision: 3,
    scaleConnected: false,
    deviceId: "manual",
  });

  // Also store the manual entry record for audit
  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: `scrap:scale:manual:${Date.now()}`,
    tenantKey: "",
    queryKey: ["scrap-scale-manual-entries"],
    data: entry,
    updatedAt: Date.now(),
    maxAgeMs: 90 * 24 * 60 * 60 * 1000, // 90 days retention
    moduleId: "scrap-metal",
  });

  return reading;
}

/**
 * Validate a manual weight entry.
 * Returns validation errors, or empty array if valid.
 */
export function validateManualWeight(weightKg: number): string[] {
  const errors: string[] = [];

  if (Number.isNaN(weightKg) || weightKg === undefined || weightKg === null) {
    errors.push("Weight is required");
    return errors;
  }

  if (weightKg <= 0) {
    errors.push("Weight must be greater than zero");
  }

  if (weightKg > 100000) {
    errors.push("Weight exceeds maximum (100,000 kg)");
  }

  if (!Number.isFinite(weightKg)) {
    errors.push("Weight must be a valid number");
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Weight staleness indicators
// ---------------------------------------------------------------------------

export type WeightStaleness = "fresh" | "stale" | "very-stale" | "none";

/**
 * Get a user-friendly staleness classification for the cached weight.
 */
export async function getWeightStaleness(): Promise<{
  status: WeightStaleness;
  label: string;
  ageSeconds: number;
}> {
  const reading = await getLastWeight();
  if (!reading) {
    return { status: "none", label: "No weight reading", ageSeconds: Infinity };
  }

  const ageMs = Date.now() - new Date(reading.timestamp).getTime();
  const ageSeconds = Math.round(ageMs / 1000);

  if (ageSeconds < 60) {
    return { status: "fresh", label: "Just now", ageSeconds };
  }
  if (ageSeconds < 1800) {
    return {
      status: "stale",
      label: `${Math.floor(ageSeconds / 60)} min ago`,
      ageSeconds,
    };
  }
  return {
    status: "very-stale",
    label: `${Math.floor(ageSeconds / 3600)}h ago — re-weigh recommended`,
    ageSeconds,
  };
}

// ---------------------------------------------------------------------------
// Scale adapter bridge
// ---------------------------------------------------------------------------

/**
 * Attempt to read from the physical scale.
 * Falls back to cached reading if scale is not connected.
 */
export async function readScaleWithFallback(
  scaleReadFn: () => Promise<ScaleReading>,
): Promise<ScaleReading> {
  try {
    const liveReading = await scaleReadFn();
    await cacheWeight(liveReading);
    return liveReading;
  } catch {
    // Scale read failed — return cached reading
    const cached = await getLastWeight();
    if (cached) {
      return {
        ...cached,
        scaleConnected: false,
      };
    }
    // No cached reading either — return zero
    return {
      weightKg: 0,
      timestamp: new Date().toISOString(),
      isManualEntry: false,
      precision: 3,
      scaleConnected: false,
    };
  }
}
