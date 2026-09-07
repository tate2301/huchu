/**
 * Paynow adapter.
 *
 * Paynow is Zimbabwe's incumbent aggregator: EcoCash, OneMoney, InnBucks, Zipit
 * and cards behind one redirect. Its wire format is unusual for a modern
 * gateway — `application/x-www-form-urlencoded` in both directions, and a
 * SHA-512 "hash" field standing in for a header signature — so all of that
 * lives in ONE place below, {@link PAYNOW_WIRE}. Nothing outside that block
 * knows Paynow says "Awaiting Delivery" when it means the money arrived.
 *
 * CONFIDENCE, stated plainly because SS-4.1 has not chosen a gateway and
 * nobody has run this against a live integration id:
 *
 *   * the endpoints, the field names, and the form encoding are from Paynow's
 *     published developer documentation;
 *   * the hash rule — concatenate the field VALUES in message order, append the
 *     integration key, uppercase, SHA-512, hex uppercase — is also from that
 *     documentation, but it is unverified against a real integration key. It is
 *     the one thing here that a sandbox credential would settle in five
 *     minutes, and until it does, treat a run of `signatureVerified = false`
 *     rows as evidence about THIS function rather than about Paynow.
 *
 * The hash is not invented: it is implemented to the documented shape. If the
 * documented shape turns out to be wrong, the fix is confined to
 * {@link paynowHash} and {@link PAYNOW_WIRE}.
 */
import { createHash } from "node:crypto";

import { decodeForm, encodeForm, gatewayRequest, postForm } from "@/lib/payments/http";
import {
  PAYMENT_STATUS,
  PaymentGatewayError,
  requireEnv,
  type InitiatePaymentInput,
  type InitiatePaymentResult,
  type PaymentProviderAdapter,
  type PaymentStatus,
  type VerifyWebhookResult,
} from "@/lib/payments/types";

export const PAYNOW_KEY = "paynow";

export type PaynowConfig = {
  integrationId: string;
  integrationKey: string;
  baseUrl: string;
  /** Server-to-server callback Paynow POSTs status changes to. */
  resultUrl: string;
  /** Paynow requires an email on the initiate call; a tenant that signed up
   *  with only a WhatsApp number (SS-3.1) has none, so there is a fallback. */
  fallbackAuthEmail: string;
  timeoutMs?: number;
};

export function paynowConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PaynowConfig {
  return {
    integrationId: requireEnv("PAYNOW_INTEGRATION_ID", env.PAYNOW_INTEGRATION_ID),
    integrationKey: requireEnv("PAYNOW_INTEGRATION_KEY", env.PAYNOW_INTEGRATION_KEY),
    baseUrl: String(env.PAYNOW_API_BASE_URL ?? "https://www.paynow.co.zw").trim(),
    resultUrl: requireEnv("PAYNOW_RESULT_URL", env.PAYNOW_RESULT_URL),
    fallbackAuthEmail: String(env.PAYNOW_AUTH_EMAIL ?? "billing@corelith.co.zw").trim(),
    timeoutMs: env.PAYNOW_TIMEOUT_MS ? Number(env.PAYNOW_TIMEOUT_MS) : undefined,
  };
}

// ---------------------------------------------------------------------------
// PAYNOW_WIRE — the whole of what this adapter believes about Paynow's
// contract. Endpoints, field names, hash rule, status vocabulary. If a sandbox
// credential contradicts the documentation, this block is the only thing that
// changes.
// ---------------------------------------------------------------------------
export const PAYNOW_WIRE = {
  initiatePath: "/interface/initiatetransaction",
  /** Express (mobile-money push) checkout. Not used by the subscription flow
   *  yet — a tenant paying by EcoCash still goes through the redirect — but
   *  named here so the next story does not have to rediscover it. */
  remotePath: "/interface/remotetransaction",
  /** Paynow requires this literal on an initiate message. */
  initiateStatusField: "Message",
  okStatus: "ok",

  /** Field order for the initiate message. The hash is over the VALUES in this
   *  order, so the order is part of the contract, not a stylistic choice. */
  initiateFieldOrder: [
    "id",
    "reference",
    "amount",
    "additionalinfo",
    "returnurl",
    "resulturl",
    "authemail",
    "status",
  ] as const,

  /** Paynow's transaction vocabulary → ours. "Awaiting Delivery" and
   *  "Delivered" both mean the money has been taken: they describe the
   *  merchant's fulfilment state, not the payment's, and a subscription has no
   *  fulfilment step to wait for. */
  statusMap: {
    paid: PAYMENT_STATUS.PAID,
    "awaiting delivery": PAYMENT_STATUS.PAID,
    delivered: PAYMENT_STATUS.PAID,
    created: PAYMENT_STATUS.INITIATED,
    sent: PAYMENT_STATUS.PENDING,
    pending: PAYMENT_STATUS.PENDING,
    cancelled: PAYMENT_STATUS.CANCELLED,
    canceled: PAYMENT_STATUS.CANCELLED,
    failed: PAYMENT_STATUS.FAILED,
    disputed: PAYMENT_STATUS.FAILED,
    refunded: PAYMENT_STATUS.FAILED,
  } as Record<string, PaymentStatus>,
} as const;

/**
 * The documented Paynow hash: the field values concatenated in message order,
 * the integration key appended, the whole uppercased, SHA-512, hex uppercase.
 *
 * Exported so its behaviour can be pinned by a test without a network, which is
 * the only assurance available before a sandbox credential exists.
 */
export function paynowHash(values: string[], integrationKey: string): string {
  const concatenated = `${values.join("")}${integrationKey}`;
  return createHash("sha512").update(concatenated.toUpperCase(), "utf8").digest("hex").toUpperCase();
}

/** Hash an inbound or outbound message, ignoring the `hash` field itself.
 *  Order is the message's own field order — which is why the raw body is
 *  parsed rather than re-serialised from an object. */
export function paynowMessageHash(
  fields: Array<[string, string]>,
  integrationKey: string,
): string {
  return paynowHash(
    fields.filter(([key]) => key.toLowerCase() !== "hash").map(([, value]) => value),
    integrationKey,
  );
}

export function mapPaynowStatus(raw: string | null | undefined): PaymentStatus | null {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return null;
  return PAYNOW_WIRE.statusMap[key] ?? null;
}

function orderedFields(raw: string): Array<[string, string]> {
  return Array.from(new URLSearchParams(raw.trim()).entries());
}

export function createPaynowAdapter(config: PaynowConfig): PaymentProviderAdapter {
  return {
    key: PAYNOW_KEY,

    async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
      // Our idempotency key is sent as Paynow's `reference`: Paynow rejects a
      // repeat of a reference it has already seen, which turns a
      // double-submitted checkout into a gateway-side collision as well as a
      // database-side one.
      const values: Record<string, string> = {
        id: config.integrationId,
        reference: input.idempotencyKey,
        amount: input.amount,
        additionalinfo: `Corelith subscription — ${input.periodMonths} month(s)`,
        returnurl: input.returnUrl,
        resulturl: input.resultUrl ?? config.resultUrl,
        authemail: input.payerEmail?.trim() || config.fallbackAuthEmail,
        status: PAYNOW_WIRE.initiateStatusField,
      };

      const ordered = PAYNOW_WIRE.initiateFieldOrder.map(
        (field) => [field, values[field]] as [string, string],
      );
      const fields = {
        ...values,
        hash: paynowMessageHash(ordered, config.integrationKey),
      };

      const response = await postForm({
        url: PAYNOW_WIRE.initiatePath,
        baseUrl: config.baseUrl,
        fields,
        timeoutMs: config.timeoutMs,
      });

      const parsed = decodeForm(response.body);
      const status = String(parsed.status ?? "").toLowerCase();
      if (response.statusCode < 200 || response.statusCode >= 300 || status !== PAYNOW_WIRE.okStatus) {
        throw new PaymentGatewayError(
          PAYNOW_KEY,
          parsed.error || `Paynow refused the transaction (HTTP ${response.statusCode})`,
          response.body,
        );
      }

      const pollUrl = parsed.pollurl ?? null;
      if (!pollUrl) {
        // Without a poll URL there is no way to ask Paynow what happened, and a
        // payment we cannot ask about is worse than one that failed loudly.
        throw new PaymentGatewayError(PAYNOW_KEY, "Paynow returned no pollurl", response.body);
      }

      return {
        // Paynow has no transaction id until the customer has paid; the poll
        // URL is the only stable handle it gives at initiate time, so the
        // reference we chose is the reference we keep.
        providerReference: input.idempotencyKey,
        redirectUrl: parsed.browserurl ?? null,
        status: PAYMENT_STATUS.INITIATED,
        pollHandle: pollUrl,
        rawResponse: response.body,
      };
    },

    verifyWebhook(rawBody: string): VerifyWebhookResult {
      const ordered = orderedFields(rawBody);
      if (ordered.length === 0) {
        return {
          ok: false,
          providerEventId: null,
          providerReference: null,
          status: null,
          amount: null,
          reason: "Empty or unparseable Paynow status update.",
        };
      }

      const fields = Object.fromEntries(ordered);
      const supplied = String(fields.hash ?? "").toUpperCase();
      const expected = paynowMessageHash(ordered, config.integrationKey);
      const reference = fields.reference ?? null;
      const status = mapPaynowStatus(fields.status);

      if (!supplied || supplied !== expected) {
        return {
          ok: false,
          providerEventId: null,
          providerReference: reference,
          status,
          amount: fields.amount ?? null,
          reason: supplied ? "Paynow hash mismatch." : "Paynow status update carried no hash.",
        };
      }

      return {
        ok: true,
        // Paynow does not number its deliveries. The hash is a function of the
        // whole message, so it is stable across a retransmission of the same
        // status and different for the next one — exactly the deduplication
        // key the replay guard needs.
        providerEventId: supplied,
        providerReference: reference,
        status,
        amount: fields.amount ?? null,
        reason: status ? undefined : `Unrecognised Paynow status: ${fields.status ?? "(none)"}`,
      };
    },

    async pollStatus(providerReference: string, pollHandle?: string | null): Promise<PaymentStatus> {
      const url = pollHandle?.trim();
      if (!url) {
        throw new PaymentGatewayError(
          PAYNOW_KEY,
          `No Paynow poll URL stored for ${providerReference}; Paynow status cannot be polled by reference alone.`,
        );
      }

      const response = await gatewayRequest({
        method: "GET",
        url,
        timeoutMs: config.timeoutMs,
      });
      const parsed = decodeForm(response.body);
      const status = mapPaynowStatus(parsed.status);
      if (!status) {
        throw new PaymentGatewayError(
          PAYNOW_KEY,
          `Unrecognised Paynow poll status: ${parsed.status ?? "(none)"}`,
          response.body,
        );
      }
      return status;
    },
  };
}

/** Exported for the adapter tests, which build a poll body without a network. */
export function encodePaynowMessage(fields: Record<string, string>, integrationKey: string): string {
  const ordered = Object.entries(fields) as Array<[string, string]>;
  return encodeForm({ ...fields, hash: paynowMessageHash(ordered, integrationKey) });
}
