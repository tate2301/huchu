import { createHash } from "node:crypto";

export type JsonRecord = Record<string, unknown>;

export function formatDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function slugify(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function normalizeEmail(email: string, label = "email"): string {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error(`Invalid ${label}: ${email}`);
  }
  return normalized;
}

export function normalizeEnum<T extends string>(value: string, label: string, allowed: readonly T[]): T {
  const normalized = value.trim().toUpperCase();
  if (!allowed.includes(normalized as T)) {
    throw new Error(`Invalid ${label}: ${value}. Use ${allowed.map((entry) => entry.toLowerCase()).join(", ")}.`);
  }
  return normalized as T;
}

export function normalizePasswordInput(password: string, label = "password"): string {
  const strippedControls = Array.from(String(password || ""))
    .filter((char) => {
      const codePoint = char.codePointAt(0);
      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
    })
    .join("");
  const normalized = strippedControls.trim();
  if (normalized.length < 8) {
    throw new Error(`${label} must be at least 8 characters.`);
  }
  return normalized;
}

export function toErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  if (message.includes("not found")) return "NOT_FOUND";
  if (message.includes("already exists") || message.includes("duplicate") || message.includes("unique")) return "CONFLICT";
  if (message.includes("invalid") || message.includes("empty") || message.includes("required")) return "VALIDATION_ERROR";
  if (message.includes("permission") || message.includes("role")) return "PERMISSION_DENIED";
  return "OPERATION_FAILED";
}

export function parsePayload(raw: string | null): JsonRecord {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as JsonRecord;
  } catch {
    return {};
  }
}

export function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  }
  const objectValue = value as Record<string, unknown>;
  const sortedKeys = Object.keys(objectValue).sort();
  const entries = sortedKeys.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(objectValue[key])}`);
  return `{${entries.join(",")}}`;
}

export function hashSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseIso(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isMissingTableError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("does not exist") || message.includes("P2021");
}
