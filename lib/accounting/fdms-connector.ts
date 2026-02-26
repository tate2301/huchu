import https from "node:https";
import http from "node:http";
import { URL } from "node:url";
import type { FiscalisationProviderConfig } from "@prisma/client";

type ConnectorPayload = {
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

type ConnectorResult = {
  status: "SUCCESS" | "PENDING" | "FAILED";
  fiscalNumber?: string | null;
  providerReference?: string | null;
  qrCodeData?: string | null;
  signature?: string | null;
  rawResponseJson: string;
  error?: string | null;
  nextRetryAt?: Date | null;
};

type SyncResult = {
  status: "SUCCESS" | "PENDING" | "FAILED";
  fiscalNumber?: string | null;
  providerReference?: string | null;
  qrCodeData?: string | null;
  signature?: string | null;
  rawResponseJson: string;
  error?: string | null;
  nextRetryAt?: Date | null;
};

function resolveRefValue(ref?: string | null) {
  const value = String(ref ?? "").trim();
  if (!value) return "";
  if (!value.startsWith("env:")) return value;
  const envKey = value.slice(4).trim();
  return process.env[envKey] ?? "";
}

function parseRetryPolicy(raw?: string | null) {
  const fallback = { baseDelayMs: 5 * 60 * 1000, maxDelayMs: 24 * 60 * 60 * 1000 };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { baseDelayMs?: number; maxDelayMs?: number };
    return {
      baseDelayMs: Number(parsed.baseDelayMs ?? fallback.baseDelayMs),
      maxDelayMs: Number(parsed.maxDelayMs ?? fallback.maxDelayMs),
    };
  } catch {
    return fallback;
  }
}

function getNextRetry(attemptCount: number, retryPolicyJson?: string | null) {
  const policy = parseRetryPolicy(retryPolicyJson);
  const multiplier = 2 ** Math.max(attemptCount - 1, 0);
  const delayMs = Math.min(policy.baseDelayMs * multiplier, policy.maxDelayMs);
  return new Date(Date.now() + delayMs);
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildAuthHeaders(provider: FiscalisationProviderConfig) {
  const headers: Record<string, string> = {};
  const authType = String(provider.authType ?? "").toUpperCase();
  const token = resolveRefValue(provider.apiToken);
  const username = resolveRefValue(provider.username);
  const password = resolveRefValue(provider.password);

  if (authType === "BEARER" && token) {
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  if (authType === "TOKEN" && token) {
    headers["X-API-TOKEN"] = token;
    return headers;
  }
  if (authType === "BASIC" && (username || password)) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    return headers;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function buildHttpsAgent(provider: FiscalisationProviderConfig) {
  const raw = resolveRefValue(provider.certificateRef);
  if (!raw) return undefined;

  const parsed = tryParseJson(raw);
  if (!parsed) {
    return new https.Agent({
      cert: raw,
      rejectUnauthorized: true,
    });
  }

  return new https.Agent({
    cert: typeof parsed.cert === "string" ? parsed.cert : undefined,
    key: typeof parsed.key === "string" ? parsed.key : undefined,
    ca: typeof parsed.ca === "string" ? parsed.ca : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase : undefined,
    rejectUnauthorized: true,
  });
}

async function performRequest(input: {
  provider: FiscalisationProviderConfig;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
}) {
  const baseUrl = String(input.provider.apiBaseUrl ?? "").trim();
  if (!baseUrl) {
    throw new Error("Fiscalisation provider base URL is not configured.");
  }

  const url = new URL(input.path, baseUrl);
  const payload = input.body ? JSON.stringify(input.body) : undefined;
  const timeout = Number(input.provider.timeoutMs ?? 20000);

  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const requestFn = url.protocol === "http:" ? http.request : https.request;
    const req = requestFn(
      url,
      {
        method: input.method,
        timeout,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload).toString() } : {}),
          ...buildAuthHeaders(input.provider),
          ...(input.extraHeaders ?? {}),
        },
        agent: url.protocol === "https:" ? buildHttpsAgent(input.provider) : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("FDMS request timed out"));
    });
    req.on("error", reject);

    if (payload) req.write(payload);
    req.end();
  });
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? "").toUpperCase();
  if (status === "SUCCESS") return "SUCCESS";
  if (status === "PENDING") return "PENDING";
  return "FAILED";
}

function parseConnectorResponse(input: {
  statusCode: number;
  body: string;
  attemptCount: number;
  retryPolicyJson?: string | null;
}) {
  const parsed = tryParseJson(input.body) ?? {};
  const status = normalizeStatus(parsed.status ?? (input.statusCode >= 200 && input.statusCode < 300 ? "SUCCESS" : "FAILED"));

  const result: ConnectorResult = {
    status,
    fiscalNumber: typeof parsed.fiscalNumber === "string" ? parsed.fiscalNumber : null,
    providerReference:
      typeof parsed.providerReference === "string"
        ? parsed.providerReference
        : typeof parsed.reference === "string"
          ? parsed.reference
          : null,
    qrCodeData: typeof parsed.qrCodeData === "string" ? parsed.qrCodeData : null,
    signature: typeof parsed.signature === "string" ? parsed.signature : null,
    rawResponseJson: input.body,
    error: typeof parsed.error === "string" ? parsed.error : null,
    nextRetryAt: null,
  };

  if (status === "FAILED") {
    result.nextRetryAt = getNextRetry(input.attemptCount + 1, input.retryPolicyJson);
    if (!result.error) {
      result.error = `FDMS request failed with status code ${input.statusCode}`;
    }
  }

  return result;
}

export async function issueWithFdmsConnector(input: {
  provider: FiscalisationProviderConfig;
  payload: ConnectorPayload;
  attemptCount: number;
}) {
  const metadata = tryParseJson(input.provider.metadataJson ?? "") ?? {};
  const issuePath = typeof metadata.issuePath === "string" ? metadata.issuePath : "/receipts";

  const response = await performRequest({
    provider: input.provider,
    method: "POST",
    path: issuePath,
    body: {
      ...input.payload.payload,
      deviceId: input.provider.deviceId ?? undefined,
    },
    extraHeaders: {
      "Idempotency-Key": input.payload.idempotencyKey,
    },
  });

  return parseConnectorResponse({
    statusCode: response.statusCode,
    body: response.body,
    attemptCount: input.attemptCount,
    retryPolicyJson: input.provider.retryPolicyJson,
  });
}

export async function syncWithFdmsConnector(input: {
  provider: FiscalisationProviderConfig;
  providerReference: string;
  attemptCount: number;
}): Promise<SyncResult> {
  const metadata = tryParseJson(input.provider.metadataJson ?? "") ?? {};
  const template =
    typeof metadata.syncPathTemplate === "string"
      ? metadata.syncPathTemplate
      : "/receipts/{reference}";
  const syncPath = template.replace("{reference}", encodeURIComponent(input.providerReference));

  const response = await performRequest({
    provider: input.provider,
    method: "GET",
    path: syncPath,
  });

  return parseConnectorResponse({
    statusCode: response.statusCode,
    body: response.body,
    attemptCount: input.attemptCount,
    retryPolicyJson: input.provider.retryPolicyJson,
  });
}
