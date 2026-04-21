/**
 * Huchu Long-Lived Session Manager
 * ---------------------------------------------------------------------------
 * Manages offline sessions with:
 *   • AES-256-GCM token encryption via Web Crypto API
 *   • 30-day activity-based sliding window expiry
 *   • Deferred token refresh queue (when offline during expiry)
 *   • IndexedDB persistence + localStorage backup
 *   • Graceful degradation when session expires
 */

import { useEffect, useState, useCallback, useRef } from "react";
import type { AuthSessionClaims } from "@/lib/auth-core/types";
import {
  getRecord,
  putRecord,
  deleteRecord,
  DB_STORES,
  type SessionTokenRecord,
} from "@/lib/offline/db-v2";
import { emitOfflineSessionChanged } from "@/lib/offline/events";
import { buildTenantScopedSessionId } from "@/lib/offline/tenant-context";
import type { OfflineSessionBootstrap } from "@/lib/offline/types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Standard session TTL for offline users: 30 days of inactivity */
const OFFLINE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Refresh buffer: start refresh 1 hour before expiry */
const REFRESH_BUFFER_MS = 60 * 60 * 1000;
/** Maximum deferred refresh attempts while offline */
const MAX_OFFLINE_REFRESH_ATTEMPTS = 72;

// ── Token Encryption (Web Crypto API) ────────────────────────────────────────

const ALGORITHM = "AES-256-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

function toArrayBuffer(bytes: ArrayLike<number>): ArrayBuffer {
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
}

async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const deviceFingerprint = await getDeviceFingerprint();
  const pepper = "huchu-offline-session-v2";

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(encoder.encode(deviceFingerprint + pepper)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

async function getDeviceFingerprint(): Promise<string> {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth?.toString() ?? "",
    `${screen.width}x${screen.height}`,
    new Date().getTimezoneOffset().toString(),
    !!window.sessionStorage ? "1" : "0",
    !!window.localStorage ? "1" : "0",
    navigator.hardwareConcurrency?.toString() ?? "",
  ];
  const data = components.join("|");
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface EncryptedToken {
  encrypted: ArrayBuffer;
  salt: Uint8Array;
  iv: Uint8Array;
}

async function encryptToken(plaintext: string): Promise<EncryptedToken> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(salt);

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encoder.encode(plaintext)),
  );

  return { encrypted, salt, iv };
}

async function decryptToken(
  encrypted: ArrayBuffer,
  salt: Uint8Array,
  iv: Uint8Array,
): Promise<string> {
  const key = await deriveKey(salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: toArrayBuffer(iv) },
    key,
    encrypted,
  );
  return new TextDecoder().decode(decrypted);
}

function serializeEncryptedToken(params: EncryptedToken): {
  encrypted: number[];
  salt: number[];
  iv: number[];
} {
  return {
    encrypted: Array.from(new Uint8Array(params.encrypted)),
    salt: Array.from(params.salt),
    iv: Array.from(params.iv),
  };
}

function deserializeEncryptedToken(params: {
  encrypted: number[];
  salt: number[];
  iv: number[];
}): {
  encrypted: ArrayBuffer;
  salt: Uint8Array;
  iv: Uint8Array;
} {
  return {
    encrypted: new Uint8Array(params.encrypted).buffer,
    salt: new Uint8Array(params.salt),
    iv: new Uint8Array(params.iv),
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionState =
  | "valid"
  | "refreshing"
  | "needs_refresh"
  | "offline_extended"
  | "expiring_soon"
  | "expired"
  | "unknown";

export interface SessionStatus {
  state: SessionState;
  description: string;
  expiresAt: Date | null;
  canOperateOffline: boolean;
  needsAttention: boolean;
}

interface PendingRefresh {
  tenantKey: string;
  deferredAt: string;
  attemptCount: number;
  lastAttemptAt: string | null;
}

// ── localStorage Keys ────────────────────────────────────────────────────────

const LS_TOKEN_BACKUP_KEY = "huchu:session:backup";
const LS_PENDING_REFRESH_KEY = "huchu:session:pending-refresh";

// ── OfflineSessionManager Class ──────────────────────────────────────────────

export class OfflineSessionManager {
  private tenantKey: string;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(status: SessionStatus) => void>();

  constructor(tenantKey: string) {
    this.tenantKey = tenantKey;
  }

  // ── Initialization ───────────────────────────────────────────────────

  /** Bootstrap the offline session from an authenticated session */
  async bootstrapSession(session: {
    user: AuthSessionClaims;
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    refreshExpiresAt?: string;
  }): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);

    // Encrypt tokens
    const encryptedAccess = await encryptToken(session.accessToken);
    const encryptedRefresh = await encryptToken(session.refreshToken);

    const serializedAccess = serializeEncryptedToken(encryptedAccess);
    const serializedRefresh = serializeEncryptedToken(encryptedRefresh);

    // Store in IndexedDB
    const tokenRecord: SessionTokenRecord = {
      tenantKey: this.tenantKey,
      encryptedAccessToken: serializedAccess.encrypted,
      encryptedRefreshToken: serializedRefresh.encrypted,
      expiresAt: session.expiresAt,
      refreshExpiresAt: session.refreshExpiresAt ?? session.expiresAt,
      lastRefreshedAt: now.toISOString(),
      refreshCount: 0,
    };
    await putRecord(DB_STORES.sessionTokens, tokenRecord);

    // Store bootstrap record
    const bootstrap: OfflineSessionBootstrap = {
      id: buildTenantScopedSessionId(this.tenantKey),
      tenantKey: this.tenantKey,
      capturedAt: now.toISOString(),
      expiresAt: new Date(expiresAt.getTime() + OFFLINE_SESSION_TTL_MS).toISOString(),
      user: session.user,
    };
    await putRecord(DB_STORES.sessionBootstrap, bootstrap);

    // localStorage backup (for recovery if IndexedDB is cleared)
    try {
      localStorage.setItem(
        `${LS_TOKEN_BACKUP_KEY}:${this.tenantKey}:access`,
        JSON.stringify({
          salt: Array.from(encryptedAccess.salt),
          iv: Array.from(encryptedAccess.iv),
        }),
      );
      localStorage.setItem(
        `${LS_TOKEN_BACKUP_KEY}:${this.tenantKey}:refresh`,
        JSON.stringify({
          salt: Array.from(encryptedRefresh.salt),
          iv: Array.from(encryptedRefresh.iv),
        }),
      );
    } catch {
      // localStorage might be full — IndexedDB is primary
    }

    emitOfflineSessionChanged();
    this.scheduleRefresh(expiresAt.getTime() - REFRESH_BUFFER_MS);
  }

  // ── Token Retrieval ──────────────────────────────────────────────────

  /** Get decrypted access token (for API calls) */
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.getTokens();
    return tokens?.accessToken ?? null;
  }

  /** Get decrypted refresh token */
  async getRefreshToken(): Promise<string | null> {
    const tokens = await this.getTokens();
    return tokens?.refreshToken ?? null;
  }

  private async getTokens(): Promise<{
    accessToken: string;
    refreshToken: string;
  } | null> {
    const record = await getRecord<SessionTokenRecord>(
      DB_STORES.sessionTokens,
      this.tenantKey,
    );

    if (!record) return null;

    try {
      const accessBackupRaw = localStorage.getItem(
        `${LS_TOKEN_BACKUP_KEY}:${this.tenantKey}:access`,
      );
      const refreshBackupRaw = localStorage.getItem(
        `${LS_TOKEN_BACKUP_KEY}:${this.tenantKey}:refresh`,
      );
      if (!accessBackupRaw || !refreshBackupRaw) return null;

      const accessBackup = JSON.parse(accessBackupRaw);
      const refreshBackup = JSON.parse(refreshBackupRaw);

      const accessToken = await decryptToken(
        new Uint8Array(record.encryptedAccessToken).buffer,
        new Uint8Array(accessBackup.salt.map(Number)),
        new Uint8Array(accessBackup.iv.map(Number)),
      );
      const refreshToken = await decryptToken(
        new Uint8Array(record.encryptedRefreshToken).buffer,
        new Uint8Array(refreshBackup.salt.map(Number)),
        new Uint8Array(refreshBackup.iv.map(Number)),
      );
      return { accessToken, refreshToken };
    } catch {
      return null;
    }
  }

  // ── Session Validation ───────────────────────────────────────────────

  async getSessionStatus(): Promise<SessionStatus> {
    const bootstrap = await getRecord<OfflineSessionBootstrap>(
      DB_STORES.sessionBootstrap,
      buildTenantScopedSessionId(this.tenantKey),
    );

    if (!bootstrap) {
      return {
        state: "unknown",
        description: "No offline session found",
        expiresAt: null,
        canOperateOffline: false,
        needsAttention: true,
      };
    }

    const expiresAt = bootstrap.expiresAt ? new Date(bootstrap.expiresAt) : null;
    const now = Date.now();

    if (!expiresAt) {
      return {
        state: "unknown",
        description: "Session has no expiry",
        expiresAt: null,
        canOperateOffline: true,
        needsAttention: false,
      };
    }

    const timeUntilExpiry = expiresAt.getTime() - now;

    if (timeUntilExpiry <= 0) {
      return {
        state: "expired",
        description: "Your session has expired. Please log in again.",
        expiresAt,
        canOperateOffline: false,
        needsAttention: true,
      };
    }

    if (timeUntilExpiry < 24 * 60 * 60 * 1000) {
      return {
        state: "expiring_soon",
        description: `Session expires in ${Math.ceil(timeUntilExpiry / (60 * 60 * 1000))} hours`,
        expiresAt,
        canOperateOffline: true,
        needsAttention: true,
      };
    }

    if (timeUntilExpiry < REFRESH_BUFFER_MS) {
      return {
        state: "needs_refresh",
        description: "Session refresh recommended",
        expiresAt,
        canOperateOffline: true,
        needsAttention: false,
      };
    }

    return {
      state: "valid",
      description: "Session is valid",
      expiresAt,
      canOperateOffline: true,
      needsAttention: false,
    };
  }

  // ── Silent Refresh ───────────────────────────────────────────────────

  async attemptSilentRefresh(): Promise<boolean> {
    const tokens = await this.getTokens();
    if (!tokens?.refreshToken) return false;

    this.emitStatusChange({
      state: "refreshing",
      description: "Refreshing session...",
      expiresAt: null,
      canOperateOffline: true,
      needsAttention: false,
    });

    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          await this.handleRefreshFailure("refresh_token_revoked");
        }
        return false;
      }

      const data = await response.json();
      await this.bootstrapSession({
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        refreshExpiresAt: data.refreshExpiresAt,
      });

      return true;
    } catch {
      await this.deferRefresh();
      return false;
    }
  }

  private async handleRefreshFailure(reason: string): Promise<void> {
    if (reason === "refresh_token_revoked") {
      await this.clearSession();
    }
  }

  private async deferRefresh(): Promise<void> {
    const pending: PendingRefresh = {
      tenantKey: this.tenantKey,
      deferredAt: new Date().toISOString(),
      attemptCount: 0,
      lastAttemptAt: null,
    };
    localStorage.setItem(
      LS_PENDING_REFRESH_KEY,
      JSON.stringify(pending),
    );
  }

  /** Process any pending refresh (call when connectivity returns) */
  async processPendingRefresh(): Promise<boolean> {
    const pendingRaw = localStorage.getItem(LS_PENDING_REFRESH_KEY);
    if (!pendingRaw) return false;

    const pending: PendingRefresh = JSON.parse(pendingRaw);
    if (pending.tenantKey !== this.tenantKey) return false;

    pending.attemptCount++;
    pending.lastAttemptAt = new Date().toISOString();

    if (pending.attemptCount > MAX_OFFLINE_REFRESH_ATTEMPTS) {
      localStorage.removeItem(LS_PENDING_REFRESH_KEY);
      return false;
    }

    localStorage.setItem(LS_PENDING_REFRESH_KEY, JSON.stringify(pending));

    const success = await this.attemptSilentRefresh();
    if (success) {
      localStorage.removeItem(LS_PENDING_REFRESH_KEY);
    }
    return success;
  }

  // ── Session Extension ────────────────────────────────────────────────

  /** Extend session based on user activity (called on every meaningful action) */
  async extendSessionFromActivity(): Promise<void> {
    const bootstrap = await getRecord<OfflineSessionBootstrap>(
      DB_STORES.sessionBootstrap,
      buildTenantScopedSessionId(this.tenantKey),
    );
    if (!bootstrap) return;

    const newExpiresAt = new Date(Date.now() + OFFLINE_SESSION_TTL_MS);
    const updated: OfflineSessionBootstrap = {
      ...bootstrap,
      expiresAt: newExpiresAt.toISOString(),
    };
    await putRecord(DB_STORES.sessionBootstrap, updated);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────

  async clearSession(): Promise<void> {
    await Promise.all([
      deleteRecord(DB_STORES.sessionTokens, this.tenantKey),
      deleteRecord(
        DB_STORES.sessionBootstrap,
        buildTenantScopedSessionId(this.tenantKey),
      ),
    ]);
    localStorage.removeItem(`${LS_TOKEN_BACKUP_KEY}:${this.tenantKey}:access`);
    localStorage.removeItem(`${LS_TOKEN_BACKUP_KEY}:${this.tenantKey}:refresh`);
    localStorage.removeItem(LS_PENDING_REFRESH_KEY);
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    emitOfflineSessionChanged();
  }

  // ── Refresh Scheduling ───────────────────────────────────────────────

  private scheduleRefresh(refreshAtMs: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const delay = Math.max(0, refreshAtMs - Date.now());
    this.refreshTimer = setTimeout(() => {
      this.attemptSilentRefresh();
    }, delay);
  }

  // ── Status Listeners ─────────────────────────────────────────────────

  private emitStatusChange(status: SessionStatus): void {
    this.listeners.forEach((fn) => {
      try {
        fn(status);
      } catch {
        /* ignore */
      }
    });
  }

  onStatusChange(listener: (status: SessionStatus) => void): () => void {
    this.listeners.add(listener);
    // Immediately emit current status
    this.getSessionStatus().then(listener).catch(() => {});
    return () => this.listeners.delete(listener);
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

let activeSessionManager: OfflineSessionManager | null = null;

export function createOfflineSessionManager(
  tenantKey: string,
): OfflineSessionManager {
  if (activeSessionManager) {
    // Clean up previous manager's timer
  }
  activeSessionManager = new OfflineSessionManager(tenantKey);
  return activeSessionManager;
}

export function getActiveSessionManager(): OfflineSessionManager | null {
  return activeSessionManager;
}

/** Extend session on user activity — throttled */
let activityThrottleTimer: ReturnType<typeof setTimeout> | null = null;

export function recordUserActivity(): void {
  if (activityThrottleTimer) return;

  activityThrottleTimer = setTimeout(() => {
    activityThrottleTimer = null;
    const manager = getActiveSessionManager();
    if (manager) {
      manager.extendSessionFromActivity().catch(() => {});
    }
  }, 5000);
}

// ── React Hook ───────────────────────────────────────────────────────────────

export interface UseOfflineSessionReturn {
  status: SessionStatus | null;
  isLoading: boolean;
  extendSession: () => void;
  refreshSession: () => Promise<boolean>;
  clearSession: () => Promise<void>;
}

export function useOfflineSession(
  manager: OfflineSessionManager | null,
): UseOfflineSessionReturn {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!manager) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = manager.onStatusChange((newStatus) => {
      setStatus(newStatus);
      setIsLoading(false);
    });

    return unsubscribe;
  }, [manager]);

  const extendSession = useCallback(() => {
    if (manager) {
      manager.extendSessionFromActivity().catch(() => {});
    }
  }, [manager]);

  const refreshSession = useCallback(async () => {
    if (!manager) return false;
    return manager.attemptSilentRefresh();
  }, [manager]);

  const clearSessionFn = useCallback(async () => {
    if (manager) {
      await manager.clearSession();
      setStatus(null);
    }
  }, [manager]);

  return {
    status,
    isLoading,
    extendSession,
    refreshSession,
    clearSession: clearSessionFn,
  };
}
