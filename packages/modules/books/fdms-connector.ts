import https from "node:https";
import http from "node:http";
import { URL } from "node:url";
import type { FiscalisationProviderConfig } from "@corelithzw/db";

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

export type FdmsCertificateBundle = {
  cert?: string;
  key?: string;
  ca?: string;
  passphrase?: string;
};

/**
 * The material behind `certificateRef`, in whichever of its two forms it is
 * stored: the `{cert,key,ca}` JSON bundle registration writes, or a bare PEM
 * certificate from before there was a private key to keep beside it.
 *
 * Exported because the device private key has two consumers that must never
 * disagree — mTLS, below, and FD-3 receipt signing. The key that authenticates
 * the device to FDGA is the key ZIMRA verifies its receipts with, so reading it
 * out of two different places is how you end up with receipts signed by a key
 * the certificate on file does not match.
 */
export function resolveProviderCertificateBundle(
  provider: Pick<FiscalisationProviderConfig, "certificateRef">,
): FdmsCertificateBundle | null {
  const raw = resolveRefValue(provider.certificateRef);
  if (!raw) return null;

  const parsed = tryParseJson(raw);
  // A bare PEM is a certificate and nothing else — no key, so no signing.
  if (!parsed) return { cert: raw };

  return {
    cert: typeof parsed.cert === "string" ? parsed.cert : undefined,
    key: typeof parsed.key === "string" ? parsed.key : undefined,
    ca: typeof parsed.ca === "string" ? parsed.ca : undefined,
    passphrase: typeof parsed.passphrase === "string" ? parsed.passphrase : undefined,
  };
}

/**
 * The device private key, or null when this provider has none configured.
 *
 * Null is a legitimate answer — a tenant on the pre-native skeleton has a
 * provider row and no keypair — and the caller decides whether that is fatal.
 * The key itself is never returned to a route or logged: it goes straight into
 * `crypto.createPrivateKey`.
 */
export function resolveDeviceSigningKey(
  provider: Pick<FiscalisationProviderConfig, "certificateRef">,
): { privateKeyPem: string; passphrase?: string } | null {
  const bundle = resolveProviderCertificateBundle(provider);
  const key = bundle?.key?.trim();
  if (!key) return null;
  return bundle?.passphrase
    ? { privateKeyPem: key, passphrase: bundle.passphrase }
    : { privateKeyPem: key };
}

function buildHttpsAgent(provider: FiscalisationProviderConfig) {
  const bundle = resolveProviderCertificateBundle(provider);
  if (!bundle) return undefined;

  return new https.Agent({
    cert: bundle.cert,
    key: bundle.key,
    ca: bundle.ca,
    passphrase: bundle.passphrase,
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

const DEFAULT_DEVICE_PATH_PREFIX = "/Device/v1";

/**
 * The FDGA `SubmitReceipt` path for this device.
 *
 * v7.2 addresses a device in the URL — `/Device/v1/{deviceID}/SubmitReceipt` —
 * rather than in the body, which is why a native submission also asks the
 * connector to leave `deviceId` out of the JSON. The prefix is overridable
 * through `metadata.devicePathPrefix` for the sandbox, and `metadata.issuePath`
 * still wins outright so a tenant pointed at something that is not FDGA (the
 * pre-native skeleton, and the schools path today) is unaffected.
 */
export function submitReceiptPath(provider: FiscalisationProviderConfig): string {
  const metadata = tryParseJson(provider.metadataJson ?? "") ?? {};
  if (typeof metadata.issuePath === "string" && metadata.issuePath) return metadata.issuePath;

  const deviceId = String(provider.deviceId ?? "").trim();
  if (!deviceId) {
    throw new Error("Fiscalisation provider has no deviceId; register the device first.");
  }
  const prefix =
    typeof metadata.devicePathPrefix === "string" && metadata.devicePathPrefix
      ? metadata.devicePathPrefix.replace(/\/+$/, "")
      : DEFAULT_DEVICE_PATH_PREFIX;
  return `${prefix}/${encodeURIComponent(deviceId)}/SubmitReceipt`;
}

export async function issueWithFdmsConnector(input: {
  provider: FiscalisationProviderConfig;
  payload: ConnectorPayload;
  attemptCount: number;
  /** Overrides `metadata.issuePath`. Native submissions pass
   *  {@link submitReceiptPath}; everything else leaves this alone. */
  path?: string;
  /** FDGA carries the device in the URL, so a native submission suppresses the
   *  body copy rather than sending the same identifier twice under two names. */
  omitDeviceIdInBody?: boolean;
}) {
  const metadata = tryParseJson(input.provider.metadataJson ?? "") ?? {};
  const issuePath =
    input.path ?? (typeof metadata.issuePath === "string" ? metadata.issuePath : "/receipts");

  const response = await performRequest({
    provider: input.provider,
    method: "POST",
    path: issuePath,
    body: {
      ...input.payload.payload,
      ...(input.omitDeviceIdInBody
        ? {}
        : { deviceId: input.provider.deviceId ?? undefined }),
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
