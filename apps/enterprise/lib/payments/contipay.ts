/**
 * ContiPay adapter.
 *
 * CONFIDENCE — read this before trusting anything below. ContiPay is the least
 * publicly documented of the three candidates, and this adapter is the one with
 * real guesswork in it:
 *
 *   * the JSON request shape (`customer` / `transaction` / merchant identifiers)
 *     and the `POST create` + `GET status` pair follow ContiPay's documented
 *     flow and its published examples;
 *   * the CALLBACK AUTHENTICATION IS NOT VERIFIED. HMAC-SHA-256 over the raw
 *     body, hex, in a named header is the industry-default shape and what is
 *     implemented here — it is NOT a signature algorithm ContiPay has been seen
 *     to use. It is written down as an assumption, not presented as a fact.
 *
 * Because of that, the pieces most likely to be wrong are the pieces most
 * easily corrected: the header name, the digest, and the encoding are all
 * config (`CONTIPAY_SIGNATURE_HEADER`, `CONTIPAY_SIGNATURE_ALGORITHM`,
 * `CONTIPAY_SIGNATURE_ENCODING`), and the endpoint/field/status vocabulary is
 * the single {@link CONTIPAY_WIRE} block. Getting ContiPay's integration pack
 * turns this adapter into an afternoon of config, not a rewrite.
 *
 * If it turns out ContiPay signs nothing at all, do NOT quietly set `ok: true`
 * for every delivery: the honest configuration is a shared secret ContiPay
 * echoes in a header (still expressible here) plus a source-IP allowlist at the
 * edge, and `signatureVerified` on the recorded event then means what it says.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { gatewayRequest, postJson, tryParseJson } from "@/lib/payments/http";
import {
  PAYMENT_STATUS,
  PaymentGatewayError,
  headerValue,
  requireEnv,
  type InitiatePaymentInput,
  type InitiatePaymentResult,
  type PaymentProviderAdapter,
  type PaymentStatus,
  type VerifyWebhookResult,
} from "@/lib/payments/types";

export const CONTIPAY_KEY = "contipay";

export type ContipayConfig = {
  apiKey: string;
  apiSecret: string;
  merchantCode: string;
  baseUrl: string;
  resultUrl: string;
  /** Defaults to the API secret. Separate because a gateway that rotates its
   *  callback secret independently of its API credentials is common, and
   *  conflating them makes that rotation an outage. */
  webhookSecret: string;
  signatureHeader: string;
  signatureAlgorithm: string;
  signatureEncoding: "hex" | "base64";
  timeoutMs?: number;
};

export function contipayConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ContipayConfig {
  const apiSecret = requireEnv("CONTIPAY_API_SECRET", env.CONTIPAY_API_SECRET);
  const encoding = String(env.CONTIPAY_SIGNATURE_ENCODING ?? "hex").trim().toLowerCase();
  return {
    apiKey: requireEnv("CONTIPAY_API_KEY", env.CONTIPAY_API_KEY),
    apiSecret,
    merchantCode: requireEnv("CONTIPAY_MERCHANT_CODE", env.CONTIPAY_MERCHANT_CODE),
    baseUrl: String(env.CONTIPAY_API_BASE_URL ?? "https://api.contipay.co.zw").trim(),
    resultUrl: requireEnv("CONTIPAY_RESULT_URL", env.CONTIPAY_RESULT_URL),
    webhookSecret: String(env.CONTIPAY_WEBHOOK_SECRET ?? "").trim() || apiSecret,
    signatureHeader: String(env.CONTIPAY_SIGNATURE_HEADER ?? "x-contipay-signature").trim(),
    signatureAlgorithm: String(env.CONTIPAY_SIGNATURE_ALGORITHM ?? "sha256").trim(),
    signatureEncoding: encoding === "base64" ? "base64" : "hex",
    timeoutMs: env.CONTIPAY_TIMEOUT_MS ? Number(env.CONTIPAY_TIMEOUT_MS) : undefined,
  };
}

// ---------------------------------------------------------------------------
// CONTIPAY_WIRE — endpoints, field names, status vocabulary. Everything this
// adapter believes about ContiPay's contract, in one place, because most of it
// still needs confirming against the integration pack.
// ---------------------------------------------------------------------------
export const CONTIPAY_WIRE = {
  createPath: "/tudo/v1/transactions/create",
  statusPathTemplate: "/tudo/v1/transactions/{reference}",

  /** ContiPay's transaction states → ours. Kept generous because the exact
   *  casing and set are unconfirmed; the lookup lowercases before matching so a
   *  documented `SUCCESS` and an observed `Success` are the same word. */
  statusMap: {
    paid: PAYMENT_STATUS.PAID,
    success: PAYMENT_STATUS.PAID,
    successful: PAYMENT_STATUS.PAID,
    completed: PAYMENT_STATUS.PAID,
    approved: PAYMENT_STATUS.PAID,
    created: PAYMENT_STATUS.INITIATED,
    initiated: PAYMENT_STATUS.INITIATED,
    pending: PAYMENT_STATUS.PENDING,
    processing: PAYMENT_STATUS.PENDING,
    submitted: PAYMENT_STATUS.PENDING,
    cancelled: PAYMENT_STATUS.CANCELLED,
    canceled: PAYMENT_STATUS.CANCELLED,
    expired: PAYMENT_STATUS.CANCELLED,
    failed: PAYMENT_STATUS.FAILED,
    declined: PAYMENT_STATUS.FAILED,
    rejected: PAYMENT_STATUS.FAILED,
    error: PAYMENT_STATUS.FAILED,
    reversed: PAYMENT_STATUS.FAILED,
  } as Record<string, PaymentStatus>,
} as const;

export function mapContipayStatus(raw: unknown): PaymentStatus | null {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return null;
  return CONTIPAY_WIRE.statusMap[key] ?? null;
}

/** The assumed callback signature. Exported so a test pins the assumption and a
 *  correction has one obvious place to land. */
export function contipaySignature(
  rawBody: string,
  config: Pick<ContipayConfig, "webhookSecret" | "signatureAlgorithm" | "signatureEncoding">,
): string {
  return createHmac(config.signatureAlgorithm, config.webhookSecret)
    .update(rawBody, "utf8")
    .digest(config.signatureEncoding);
}

/** Constant-time compare. A byte-by-byte `===` on a MAC leaks how much of a
 *  forged signature was right, one request at a time. */
function signaturesMatch(expected: string, supplied: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** ContiPay nests the useful part of both responses and callbacks under `data`
 *  in its examples, but not always. One reader for both rather than two that
 *  drift. */
function contipayBody(parsed: Record<string, unknown> | null): Record<string, unknown> {
  if (!parsed) return {};
  const data = parsed.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...parsed, ...(data as Record<string, unknown>) };
  }
  return parsed;
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function createContipayAdapter(config: ContipayConfig): PaymentProviderAdapter {
  const authHeaders = {
    Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`,
  };

  return {
    key: CONTIPAY_KEY,

    async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
      const response = await postJson({
        url: CONTIPAY_WIRE.createPath,
        baseUrl: config.baseUrl,
        headers: authHeaders,
        timeoutMs: config.timeoutMs,
        body: {
          merchantCode: config.merchantCode,
          customer: {
            email: input.payerEmail ?? undefined,
            phoneNumber: input.payerPhone ?? undefined,
          },
          transaction: {
            // Our idempotency key is the merchant reference, so a
            // double-submitted checkout collides at ContiPay as well as here.
            reference: input.idempotencyKey,
            amount: Number(input.amount),
            currency: input.currency,
            description: `Corelith subscription — ${input.periodMonths} month(s)`,
            returnUrl: input.returnUrl,
            resultUrl: input.resultUrl ?? config.resultUrl,
          },
        },
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const parsed = contipayBody(tryParseJson(response.body));
        throw new PaymentGatewayError(
          CONTIPAY_KEY,
          readString(parsed, ["message", "error"]) ||
            `ContiPay refused the transaction (HTTP ${response.statusCode})`,
          response.body,
        );
      }

      const parsed = contipayBody(tryParseJson(response.body));
      const reference = readString(parsed, ["reference", "transactionReference", "referenceNumber"]);
      if (!reference) {
        throw new PaymentGatewayError(CONTIPAY_KEY, "ContiPay returned no reference", response.body);
      }

      return {
        providerReference: reference,
        redirectUrl: readString(parsed, ["redirectUrl", "paymentUrl", "url"]),
        status: mapContipayStatus(readString(parsed, ["status", "transactionStatus"])) ?? PAYMENT_STATUS.INITIATED,
        pollHandle: readString(parsed, ["pollUrl"]),
        rawResponse: response.body,
      };
    },

    verifyWebhook(rawBody: string, headers: Record<string, string>): VerifyWebhookResult {
      const parsed = contipayBody(tryParseJson(rawBody));
      const reference = readString(parsed, ["reference", "transactionReference", "referenceNumber"]);
      const rawStatus = readString(parsed, ["status", "transactionStatus"]);
      const status = mapContipayStatus(rawStatus);
      const amount = readString(parsed, ["amount"]);
      const supplied = headerValue(headers, config.signatureHeader);

      if (!supplied) {
        return {
          ok: false,
          providerEventId: null,
          providerReference: reference,
          status,
          amount,
          reason: `ContiPay callback carried no ${config.signatureHeader} header.`,
        };
      }

      if (!signaturesMatch(contipaySignature(rawBody, config), supplied.trim())) {
        return {
          ok: false,
          providerEventId: null,
          providerReference: reference,
          status,
          amount,
          reason: "ContiPay callback signature did not match.",
        };
      }

      if (!reference || !status) {
        return {
          ok: false,
          providerEventId: null,
          providerReference: reference,
          status,
          amount,
          reason: reference
            ? `Unrecognised ContiPay status: ${rawStatus ?? "(none)"}`
            : "ContiPay callback carried no reference.",
        };
      }

      return {
        ok: true,
        // Prefer ContiPay's own delivery id where it sends one; otherwise
        // reference-plus-status, which is stable across a retransmission of one
        // state and different for the next.
        providerEventId:
          readString(parsed, ["eventId", "webhookId", "notificationId"]) ?? `${reference}:${rawStatus}`,
        providerReference: reference,
        status,
        amount,
      };
    },

    async pollStatus(providerReference: string): Promise<PaymentStatus> {
      const path = CONTIPAY_WIRE.statusPathTemplate.replace(
        "{reference}",
        encodeURIComponent(providerReference),
      );
      const response = await gatewayRequest({
        method: "GET",
        url: path,
        baseUrl: config.baseUrl,
        headers: { ...authHeaders, Accept: "application/json" },
        timeoutMs: config.timeoutMs,
      });

      const parsed = contipayBody(tryParseJson(response.body));
      const status = mapContipayStatus(readString(parsed, ["status", "transactionStatus"]));
      if (!status) {
        throw new PaymentGatewayError(
          CONTIPAY_KEY,
          `Unrecognised ContiPay status for ${providerReference}`,
          response.body,
        );
      }
      return status;
    },
  };
}
