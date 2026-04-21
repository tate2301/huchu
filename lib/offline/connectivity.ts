/**
 * Huchu Enhanced Connectivity Detection
 * ---------------------------------------------------------------------------
 * 3-layer detection system:
 *   1. navigator.onLine      — instant but unreliable
 *   2. Heartbeat ping        — lightweight HEAD request to /api/health
 *   3. Fetch timeout         — detect slow/degraded connections
 *
 * Features:
 *   • Latency-based quality estimation (online / degraded / offline)
 *   • Debounced state transitions (2 consecutive failures before offline)
 *   • EventTarget-based architecture for loose coupling
 *   • Historical latency tracking
 *   • IndexedDB logging for audit trail
 */

import { useEffect, useState, useCallback } from "react";
import {
  addConnectivityLogEntry,
  type ConnectivityLogEntry,
} from "@/lib/offline/db-v2";

// ── Constants ────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;
const HEARTBEAT_URL = "/api/health";
const DEGRADED_LATENCY_THRESHOLD_MS = 1000;
const OFFLINE_LATENCY_THRESHOLD_MS = 5000;
const HISTORY_WINDOW_SIZE = 10;

// ── Types ────────────────────────────────────────────────────────────────────

export type ConnectivityQuality = "online" | "degraded" | "offline";

export interface ConnectivityState {
  isOnline: boolean;
  quality: ConnectivityQuality;
  /** Estimated round-trip latency in ms */
  latencyMs: number;
  /** Timestamp of last successful heartbeat (ISO string) */
  lastHeartbeatAt: string | null;
  /** Number of consecutive failed heartbeats */
  consecutiveFailures: number;
  /** Number of consecutive successful heartbeats */
  consecutiveSuccesses: number;
}

export interface LatencyMeasurement {
  timestamp: number;
  latencyMs: number;
  success: boolean;
}

/** Event fired when connectivity state changes meaningfully */
export class ConnectivityChangeEvent extends Event {
  readonly state: ConnectivityState;

  constructor(state: ConnectivityState) {
    super("connectivitychange");
    this.state = state;
  }
}

// ── Internal State ───────────────────────────────────────────────────────────

const defaultState: ConnectivityState = {
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  quality: typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline",
  latencyMs: 0,
  lastHeartbeatAt: null,
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
};

let currentState: ConnectivityState = { ...defaultState };
const latencyHistory: LatencyMeasurement[] = [];
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isDestroyed = false;

// ── EventTarget ──────────────────────────────────────────────────────────────

const eventTarget = new EventTarget();

export function onConnectivityChange(
  listener: (state: ConnectivityState) => void,
): () => void {
  const handler = (e: Event) => {
    listener((e as ConnectivityChangeEvent).state);
  };
  eventTarget.addEventListener("connectivitychange", handler);
  // Emit current state immediately
  listener({ ...currentState });
  return () => eventTarget.removeEventListener("connectivitychange", handler);
}

function emitStateChange(): void {
  eventTarget.dispatchEvent(new ConnectivityChangeEvent({ ...currentState }));
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getCurrentConnectivityState(): ConnectivityState {
  return { ...currentState };
}

/** Initialize the connectivity detector */
export function initConnectivityDetector(): void {
  if (heartbeatTimer) return;
  isDestroyed = false;

  if (typeof window === "undefined") return;

  window.addEventListener("online", handleBrowserOnline);
  window.addEventListener("offline", handleBrowserOffline);

  heartbeatTimer = setInterval(runHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Run initial heartbeat after a short delay
  setTimeout(runHeartbeat, 500);
}

/** Destroy the detector */
export function destroyConnectivityDetector(): void {
  isDestroyed = true;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("online", handleBrowserOnline);
    window.removeEventListener("offline", handleBrowserOffline);
  }
  latencyHistory.length = 0;
}

/** Manually trigger a connectivity check */
export async function checkConnectivity(): Promise<ConnectivityState> {
  await runHeartbeat();
  return { ...currentState };
}

// ── Heartbeat ────────────────────────────────────────────────────────────────

async function runHeartbeat(): Promise<void> {
  if (isDestroyed) return;
  if (typeof fetch === "undefined") return;

  const startTime = performance.now();
  let success = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      HEARTBEAT_TIMEOUT_MS,
    );

    await fetch(HEARTBEAT_URL, {
      method: "HEAD",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    success = true;
  } catch {
    success = false;
  }

  const latencyMs = Math.round(performance.now() - startTime);
  recordMeasurement({ timestamp: Date.now(), latencyMs, success });
  updateState(success, latencyMs);
}

function recordMeasurement(measurement: LatencyMeasurement): void {
  latencyHistory.push(measurement);
  if (latencyHistory.length > HISTORY_WINDOW_SIZE) {
    latencyHistory.shift();
  }
}

function updateState(success: boolean, latencyMs: number): void {
  const previousState = { ...currentState };

  if (success) {
    currentState.consecutiveSuccesses++;
    currentState.consecutiveFailures = 0;
    currentState.lastHeartbeatAt = new Date().toISOString();
    currentState.latencyMs = computeAverageLatency();

    if (latencyMs > OFFLINE_LATENCY_THRESHOLD_MS) {
      currentState.quality = "offline";
      currentState.isOnline = false;
    } else if (latencyMs > DEGRADED_LATENCY_THRESHOLD_MS) {
      currentState.quality = "degraded";
      currentState.isOnline = true;
    } else {
      currentState.quality = "online";
      currentState.isOnline = true;
    }
  } else {
    currentState.consecutiveFailures++;
    currentState.consecutiveSuccesses = 0;

    // Require 2 consecutive failures before declaring offline
    if (currentState.consecutiveFailures >= 2) {
      currentState.isOnline = false;
      currentState.quality = "offline";
    } else {
      // Single failure — stay in previous state but mark degraded
      if (currentState.quality === "online") {
        currentState.quality = "degraded";
      }
    }
  }

  if (stateChangedMeaningfully(previousState, currentState)) {
    emitStateChange();
    logConnectivityChange(currentState);
  }
}

function computeAverageLatency(): number {
  const successful = latencyHistory.filter((m) => m.success);
  if (successful.length === 0) return 0;
  const sum = successful.reduce((acc, m) => acc + m.latencyMs, 0);
  return Math.round(sum / successful.length);
}

function stateChangedMeaningfully(
  previous: ConnectivityState,
  current: ConnectivityState,
): boolean {
  if (previous.quality !== current.quality) return true;
  if (previous.isOnline !== current.isOnline) return true;
  return false;
}

async function logConnectivityChange(state: ConnectivityState): Promise<void> {
  try {
    const entry: ConnectivityLogEntry = {
      id: `conn:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      state: state.quality,
      detectionMethod: "heartbeat",
      latencyMs: state.latencyMs || null,
      detail: `Success streak: ${state.consecutiveSuccesses}, Failure streak: ${state.consecutiveFailures}`,
    };
    await addConnectivityLogEntry(entry);
  } catch {
    // Non-critical — don't crash if logging fails
  }
}

// ── Browser Event Handlers ───────────────────────────────────────────────────

function handleBrowserOnline(): void {
  // Don't trust it immediately — verify with heartbeat
  runHeartbeat();
}

function handleBrowserOffline(): void {
  currentState.isOnline = false;
  currentState.quality = "offline";
  currentState.consecutiveFailures = 2;
  emitStateChange();
}

// ── Utility: Wait for online ─────────────────────────────────────────────────

export function waitForOnline(timeoutMs?: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (currentState.isOnline) {
      resolve(true);
      return;
    }

    const unsubscribe = onConnectivityChange((state) => {
      if (state.isOnline) {
        unsubscribe();
        resolve(true);
      }
    });

    if (timeoutMs) {
      setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeoutMs);
    }
  });
}

// ── Utility: Get latency history ─────────────────────────────────────────────

export function getLatencyHistory(): readonly LatencyMeasurement[] {
  return [...latencyHistory];
}

// ── React Hook ─────────────────────────────────────────────────────────────────

export interface UseConnectivityReturn extends ConnectivityState {
  isOffline: boolean;
  isDegraded: boolean;
  recheck: () => void;
}

export function useConnectivity(): UseConnectivityReturn {
  const [state, setState] = useState<ConnectivityState>(
    getCurrentConnectivityState(),
  );

  useEffect(() => {
    initConnectivityDetector();
    const unsubscribe = onConnectivityChange(setState);
    return () => {
      unsubscribe();
    };
  }, []);

  const recheck = useCallback(() => {
    checkConnectivity().then(setState);
  }, []);

  return {
    ...state,
    isOffline: !state.isOnline,
    isDegraded: state.quality === "degraded",
    recheck,
  };
}
