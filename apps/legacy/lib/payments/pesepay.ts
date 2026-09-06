/**
 * Pesepay adapter.
 *
 * Pesepay's distinguishing trait is that the whole body is encrypted: every
 * request and response is `{"payload": "<base64 AES ciphertext>"}` and the
 * integration key travels in an `authorization` header. That envelope, the
 * endpoints and the status vocabulary are confined to {@link PESEPAY_WIRE} and
 * {@link pesepayCipher} below.
 *
 * CONFIDENCE, stated plainly:
 *
 *   * endpoints, the `{payload}` envelope, the inner field names and the
 *     transaction-status vocabulary are from Pesepay's published documentation
 *     and its official SDKs;
 *   * the cipher parameters — AES-256-CBC, key = the 32-character encryption
 *     key, IV = the first 16 characters of that same key — are what those SDKs
 *     do, but they are unverified here against a live key.
 *
 * One thing that is NOT a guess and must not be read as one: this envelope is
 * encryption, not authentication. AES-CBC has no MAC, so "it decrypted" is a
 * weaker claim than "it was signed" — it establishes that the sender held the
 * shared key and that the plaintext parsed, which is the strongest statement
 * Pesepay's callback format supports. Where the money matters more than the
 * round trip, follow a callback with {@link PaymentProviderAdapter.pollStatus},
 * which asks Pesepay directly instead of believing the delivery.
 */
import { createCipheriv, createDecipheriv } from "node:crypto";

import { gatewayRequest, postJson, tryParseJson } from "@/lib/payments/http";
import {
  PAYMENT_STATUS,
  PaymentConfigError,
  PaymentGatewayError,
  requireEnv,
  type InitiatePaymentInput,
  type InitiatePaymentResult,
  type PaymentProviderAdapter,
  type PaymentStatus,
  type VerifyWebhookResult,
} from "@/lib/payments/types";

export const PESEPAY_KEY = "pesepay";

export type PesepayConfig = {
  integrationKey: string;
  encryptionKey: string;
  baseUrl: string;
  resultUrl: string;
  timeoutMs?: number;
};

export function pesepayConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PesepayConfig {
  return {
    integrationKey: requireEnv("PESEPAY_INTEGRATION_KEY", env.PESEPAY_INTEGRATION_KEY),
    encryptionKey: requireEnv("PESEPAY_ENCRYPTION_KEY", env.PESEPAY_ENCRYPTION_KEY),
    baseUrl: String(env.PESEPAY_API_BASE_URL ?? "https://api.pesepay.com/api/payments-engine").trim(),
    resultUrl: requireEnv("PESEPAY_RESULT_URL", env.PESEPAY_RESULT_URL),
    timeoutMs: env.PESEPAY_TIMEOUT_MS ? Number(env.PESEPAY_TIMEOUT_MS) : undefined,
  };
}

// ---------------------------------------------------------------------------
// PESEPAY_WIRE — endpoints, envelope key, and the status vocabulary. The only
// place in the codebase that knows Pesepay's words for things.
// ---------------------------------------------------------------------------
export const PESEPAY_WIRE = {
  initiatePath: "/v1/payments/initiate",
  checkPath: "/v1/payments/check-payment",
  /** The single key every request and response body carries. */
  envelopeField: "payload",

  /**
   * Pesepay's `transactionStatus` → ours. The long tail (declines, timeouts,
   * reversals) all land on FAILED because the subscription cares about one
   * question — did the money arrive — and answering it with fifteen shades of
   * "no" would push provider vocabulary into the billing page.
   *
   * PARTIALLY_PAID is deliberately FAILED and not PAID: a part-paid
   * subscription has not bought a period, and treating it as paid would extend
   * the tenant for money that did not arrive.
   */
  statusMap: {
    SUCCESS: PAYMENT_STATUS.PAID,
    INITIATED: PAYMENT_STATUS.INITIATED,
    PENDING: PAYMENT_STATUS.PENDING,
    PROCESSING: PAYMENT_STATUS.PENDING,
    CANCELLED: PAYMENT_STATUS.CANCELLED,
    TERMINATED: PAYMENT_STATUS.CANCELLED,
    CLOSED: PAYMENT_STATUS.CANCELLED,
    CLOSED_PERIOD_ELAPSED: PAYMENT_STATUS.CANCELLED,
    TIME_OUT: PAYMENT_STATUS.FAILED,
    FAILED: PAYMENT_STATUS.FAILED,
    ERROR: PAYMENT_STATUS.FAILED,
    DECLINED: PAYMENT_STATUS.FAILED,
    INSUFFICIENT_FUNDS: PAYMENT_STATUS.FAILED,
    AUTHORIZATION_FAILED: PAYMENT_STATUS.FAILED,
    SERVICE_UNAVAILABLE: PAYMENT_STATUS.FAILED,
    REVERSED: PAYMENT_STATUS.FAILED,
    PARTIALLY_PAID: PAYMENT_STATUS.FAILED,
  } as Record<string, PaymentStatus>,
} as const;

export function mapPesepayStatus(raw: unknown): PaymentStatus | null {
  const key = String(raw ?? "").trim().toUpperCase();
  if (!key) return null;
  return PESEPAY_WIRE.statusMap[key] ?? null;
}

/**
 * The `{payload}` envelope's cipher. Both directions in one object so an
 * encrypt/decrypt round trip can be pinned by a test, and so a correction to
 * the parameters cannot be applied to one direction and forgotten in the other.
 */
export function pesepayCipher(encryptionKey: string) {
  const key = Buffer.from(encryptionKey, "utf8");
  if (key.length !== 32) {
    throw new PaymentConfigError(
      `PESEPAY_ENCRYPTION_KEY must be 32 bytes for AES-256; got ${key.length}.`,
    );
  }
  // The IV is the first half of the key rather than a random per-message value.
  // That is Pesepay's scheme, not ours: a random IV would have to be
  // transmitted, and the envelope has nowhere to put it.
  const iv = key.subarray(0, 16);

  return {
    encrypt(value: unknown): string {
      const cipher = createCipheriv("aes-256-cbc", key, iv);
      return Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final(),
      ]).toString("base64");
    },
    decrypt(payload: string): Record<string, unknown> {
      const decipher = createDecipheriv("aes-256-cbc", key, iv);
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(payload, "base64")),
        decipher.final(),
      ]).toString("utf8");
      const parsed = tryParseJson(plaintext);
      if (!parsed) throw new Error("Pesepay payload decrypted to something that is not a JSON object.");
      return parsed;
    },
  };
}

function unwrapResponse(config: PesepayConfig, body: string): Record<string, unknown> {
  const outer = tryParseJson(body);
  const payload = outer?.[PESEPAY_WIRE.envelopeField];
  if (typeof payload !== "string" || !payload) {
    // A Pesepay error is returned unencrypted, so surface it rather than
    // reporting a decryption failure the operator would go looking for in vain.
    const message =
      (typeof outer?.message === "string" && outer.message) || "Pesepay response carried no payload.";
    throw new PaymentGatewayError(PESEPAY_KEY, message, body);
  }
  return pesepayCipher(config.encryptionKey).decrypt(payload);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readAmount(record: Record<string, unknown>): string | null {
  const details = record.amountDetails;
  const amount =
    details && typeof details === "object"
      ? (details as Record<string, unknown>).amount
      : record.amount;
  if (typeof amount === "number") return amount.toFixed(2);
  if (typeof amount === "string" && amount.trim()) return amount.trim();
  return null;
}

export function createPesepayAdapter(config: PesepayConfig): PaymentProviderAdapter {
  const authHeaders = { authorization: config.integrationKey };

  return {
    key: PESEPAY_KEY,

    async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
      const cipher = pesepayCipher(config.encryptionKey);
      const response = await postJson({
        url: PESEPAY_WIRE.initiatePath,
        baseUrl: config.baseUrl,
        headers: authHeaders,
        timeoutMs: config.timeoutMs,
        body: {
          [PESEPAY_WIRE.envelopeField]: cipher.encrypt({
            amountDetails: { amount: Number(input.amount), currencyCode: input.currency },
            reasonForPayment: `Corelith subscription — ${input.periodMonths} month(s)`,
            // Our idempotency key rides as the merchant reference so a
            // double-submitted checkout is the same transaction at Pesepay too.
            merchantReference: input.idempotencyKey,
            resultUrl: input.resultUrl ?? config.resultUrl,
            returnUrl: input.returnUrl,
          }),
        },
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const outer = tryParseJson(response.body);
        throw new PaymentGatewayError(
          PESEPAY_KEY,
          (typeof outer?.message === "string" && outer.message) ||
            `Pesepay refused the transaction (HTTP ${response.statusCode})`,
          response.body,
        );
      }

      const decoded = unwrapResponse(config, response.body);
      const reference = readString(decoded, "referenceNumber");
      if (!reference) {
        throw new PaymentGatewayError(
          PESEPAY_KEY,
          "Pesepay returned no referenceNumber",
          response.body,
        );
      }

      return {
        providerReference: reference,
        redirectUrl: readString(decoded, "redirectUrl"),
        status: mapPesepayStatus(decoded.transactionStatus) ?? PAYMENT_STATUS.INITIATED,
        pollHandle: readString(decoded, "pollUrl"),
        rawResponse: response.body,
      };
    },

    verifyWebhook(rawBody: string): VerifyWebhookResult {
      let decoded: Record<string, unknown>;
      try {
        decoded = unwrapResponse(config, rawBody);
      } catch (error) {
        return {
          ok: false,
          providerEventId: null,
          providerReference: null,
          status: null,
          amount: null,
          reason: `Pesepay callback could not be decrypted: ${(error as Error).message}`,
        };
      }

      const reference = readString(decoded, "referenceNumber");
      const rawStatus = readString(decoded, "transactionStatus");
      const status = mapPesepayStatus(rawStatus);

      if (!reference || !status) {
        return {
          ok: false,
          providerEventId: null,
          providerReference: reference,
          status,
          amount: readAmount(decoded),
          reason: reference
            ? `Unrecognised Pesepay transactionStatus: ${rawStatus ?? "(none)"}`
            : "Pesepay callback carried no referenceNumber.",
        };
      }

      return {
        ok: true,
        // Pesepay numbers transactions, not deliveries. Reference plus status
        // is stable across a retransmission and changes on a real transition,
        // which is what the replay guard is actually asking about.
        providerEventId: `${reference}:${rawStatus}`,
        providerReference: reference,
        status,
        amount: readAmount(decoded),
      };
    },

    async pollStatus(providerReference: string): Promise<PaymentStatus> {
      const response = await gatewayRequest({
        method: "GET",
        url: `${PESEPAY_WIRE.checkPath}?referenceNumber=${encodeURIComponent(providerReference)}`,
        baseUrl: config.baseUrl,
        headers: { ...authHeaders, Accept: "application/json" },
        timeoutMs: config.timeoutMs,
      });

      const decoded = unwrapResponse(config, response.body);
      const status = mapPesepayStatus(decoded.transactionStatus);
      if (!status) {
        throw new PaymentGatewayError(
          PESEPAY_KEY,
          `Unrecognised Pesepay transactionStatus: ${String(decoded.transactionStatus ?? "(none)")}`,
          response.body,
        );
      }
      return status;
    },
  };
}
