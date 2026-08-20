/**
 * SS-4 — the three concrete adapters and the registry, without a network.
 *
 * What can honestly be tested before a sandbox credential exists is this: that
 * each adapter's signature rule is the rule its comment says it is, that the
 * rule rejects a tampered body, and that each provider's status vocabulary maps
 * onto ours the way the mapping block claims. What CANNOT be tested here is
 * whether the documented rule is the rule the gateway actually applies — that
 * needs credentials, and the adapter files say so where they say it.
 *
 * These tests are therefore assumption pins. If a sandbox contradicts one, the
 * failing test names exactly which assumption died.
 *
 * Run: npx vitest run lib/payments/adapters
 */
import { createHash, createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";

import {
  createContipayAdapter,
  contipaySignature,
  mapContipayStatus,
  type ContipayConfig,
} from "@/lib/payments/contipay";
import {
  createPaynowAdapter,
  encodePaynowMessage,
  mapPaynowStatus,
  paynowHash,
  type PaynowConfig,
} from "@/lib/payments/paynow";
import {
  createPesepayAdapter,
  mapPesepayStatus,
  pesepayCipher,
  PESEPAY_WIRE,
  type PesepayConfig,
} from "@/lib/payments/pesepay";
import {
  UnknownPaymentProviderError,
  getPaymentAdapter,
  hasActivePaymentProvider,
  knownPaymentProviders,
  registerPaymentAdapter,
  resolveActivePaymentAdapter,
  unregisterPaymentAdapter,
} from "@/lib/payments/registry";
import { PAYMENT_STATUS, PaymentConfigError, type PaymentProviderAdapter } from "@/lib/payments/types";

const PAYNOW_CONFIG: PaynowConfig = {
  integrationId: "12345",
  integrationKey: "paynow-integration-key",
  baseUrl: "https://www.paynow.co.zw",
  resultUrl: "https://app.corelith.co.zw/api/webhooks/payments/paynow",
  fallbackAuthEmail: "billing@corelith.co.zw",
};

/** AES-256 needs exactly 32 bytes, which is what Pesepay issues. */
const PESEPAY_CONFIG: PesepayConfig = {
  integrationKey: "pesepay-integration-key",
  encryptionKey: "0123456789abcdef0123456789abcdef",
  baseUrl: "https://api.pesepay.com/api/payments-engine",
  resultUrl: "https://app.corelith.co.zw/api/webhooks/payments/pesepay",
};

const CONTIPAY_CONFIG: ContipayConfig = {
  apiKey: "contipay-api-key",
  apiSecret: "contipay-api-secret",
  merchantCode: "CORELITH",
  baseUrl: "https://api.contipay.co.zw",
  resultUrl: "https://app.corelith.co.zw/api/webhooks/payments/contipay",
  webhookSecret: "contipay-webhook-secret",
  signatureHeader: "x-contipay-signature",
  signatureAlgorithm: "sha256",
  signatureEncoding: "hex",
};

describe("paynow", () => {
  it("hashes the concatenated values plus the integration key, uppercased, as SHA-512 hex", () => {
    // The rule restated independently of the implementation, so this pins the
    // composition and not merely the function calling itself.
    const expected = createHash("sha512")
      .update("abcpaynow-integration-key".toUpperCase(), "utf8")
      .digest("hex")
      .toUpperCase();

    expect(paynowHash(["a", "b", "c"], PAYNOW_CONFIG.integrationKey)).toBe(expected);
  });

  it("accepts a status update whose hash matches", async () => {
    const adapter = createPaynowAdapter(PAYNOW_CONFIG);
    const body = encodePaynowMessage(
      {
        reference: "idem-123",
        paynowreference: "9876543",
        amount: "39.00",
        status: "Paid",
        pollurl: "https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc",
      },
      PAYNOW_CONFIG.integrationKey,
    );

    const result = await adapter.verifyWebhook(body, {});

    expect(result.ok).toBe(true);
    expect(result.providerReference).toBe("idem-123");
    expect(result.status).toBe(PAYMENT_STATUS.PAID);
    expect(result.amount).toBe("39.00");
    // Paynow numbers no deliveries, so the message hash is the dedupe key.
    expect(result.providerEventId).toBeTruthy();
  });

  it("rejects a status update whose amount was edited in flight", async () => {
    const adapter = createPaynowAdapter(PAYNOW_CONFIG);
    const body = encodePaynowMessage(
      { reference: "idem-123", amount: "39.00", status: "Paid" },
      PAYNOW_CONFIG.integrationKey,
    );
    const tampered = body.replace("39.00", "0.01");

    const result = await adapter.verifyWebhook(tampered, {});
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("hash");
  });

  it("rejects a status update with no hash at all", async () => {
    const adapter = createPaynowAdapter(PAYNOW_CONFIG);
    const result = await adapter.verifyWebhook("reference=idem-123&status=Paid", {});
    expect(result.ok).toBe(false);
  });

  it("treats Paynow's fulfilment states as paid, because a subscription has no fulfilment", () => {
    expect(mapPaynowStatus("Paid")).toBe(PAYMENT_STATUS.PAID);
    expect(mapPaynowStatus("Awaiting Delivery")).toBe(PAYMENT_STATUS.PAID);
    expect(mapPaynowStatus("Delivered")).toBe(PAYMENT_STATUS.PAID);
    expect(mapPaynowStatus("Sent")).toBe(PAYMENT_STATUS.PENDING);
    expect(mapPaynowStatus("Cancelled")).toBe(PAYMENT_STATUS.CANCELLED);
    expect(mapPaynowStatus("Refunded")).toBe(PAYMENT_STATUS.FAILED);
    expect(mapPaynowStatus("something new")).toBeNull();
  });
});

describe("pesepay", () => {
  it("round-trips the encrypted payload envelope", () => {
    const cipher = pesepayCipher(PESEPAY_CONFIG.encryptionKey);
    const encrypted = cipher.encrypt({ referenceNumber: "PSP-1", transactionStatus: "SUCCESS" });

    expect(encrypted).not.toContain("PSP-1");
    expect(cipher.decrypt(encrypted)).toEqual({
      referenceNumber: "PSP-1",
      transactionStatus: "SUCCESS",
    });
  });

  it("refuses a key that is not 32 bytes rather than silently truncating", () => {
    expect(() => pesepayCipher("too-short")).toThrow(PaymentConfigError);
  });

  it("accepts a callback it can decrypt", async () => {
    const adapter = createPesepayAdapter(PESEPAY_CONFIG);
    const cipher = pesepayCipher(PESEPAY_CONFIG.encryptionKey);
    const body = JSON.stringify({
      [PESEPAY_WIRE.envelopeField]: cipher.encrypt({
        referenceNumber: "PSP-1",
        transactionStatus: "SUCCESS",
        amountDetails: { amount: 199, currencyCode: "USD" },
      }),
    });

    const result = await adapter.verifyWebhook(body, {});
    expect(result.ok).toBe(true);
    expect(result.providerReference).toBe("PSP-1");
    expect(result.status).toBe(PAYMENT_STATUS.PAID);
    expect(result.amount).toBe("199.00");
    expect(result.providerEventId).toBe("PSP-1:SUCCESS");
  });

  it("rejects a callback encrypted with somebody else's key", async () => {
    const adapter = createPesepayAdapter(PESEPAY_CONFIG);
    const foreign = pesepayCipher("fedcba9876543210fedcba9876543210");
    const body = JSON.stringify({
      [PESEPAY_WIRE.envelopeField]: foreign.encrypt({
        referenceNumber: "PSP-2",
        transactionStatus: "SUCCESS",
      }),
    });

    const result = await adapter.verifyWebhook(body, {});
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("decrypted");
  });

  it("does not treat a part payment as a paid subscription", () => {
    expect(mapPesepayStatus("SUCCESS")).toBe(PAYMENT_STATUS.PAID);
    expect(mapPesepayStatus("PARTIALLY_PAID")).toBe(PAYMENT_STATUS.FAILED);
    expect(mapPesepayStatus("PROCESSING")).toBe(PAYMENT_STATUS.PENDING);
    expect(mapPesepayStatus("TIME_OUT")).toBe(PAYMENT_STATUS.FAILED);
    expect(mapPesepayStatus("CLOSED_PERIOD_ELAPSED")).toBe(PAYMENT_STATUS.CANCELLED);
    expect(mapPesepayStatus("something new")).toBeNull();
  });
});

describe("contipay", () => {
  const body = JSON.stringify({
    data: { reference: "CP-1", status: "SUCCESS", amount: "99.00" },
  });

  it("computes the assumed HMAC over the raw body", () => {
    const expected = createHmac("sha256", CONTIPAY_CONFIG.webhookSecret)
      .update(body, "utf8")
      .digest("hex");
    expect(contipaySignature(body, CONTIPAY_CONFIG)).toBe(expected);
  });

  it("accepts a correctly signed callback", async () => {
    const adapter = createContipayAdapter(CONTIPAY_CONFIG);
    const result = await adapter.verifyWebhook(body, {
      // Header case is deliberately wrong: Node lowercases inbound headers and
      // provider documentation does not.
      "X-ContiPay-Signature": contipaySignature(body, CONTIPAY_CONFIG),
    });

    expect(result.ok).toBe(true);
    expect(result.providerReference).toBe("CP-1");
    expect(result.status).toBe(PAYMENT_STATUS.PAID);
    expect(result.amount).toBe("99.00");
  });

  it("rejects a callback with a wrong signature", async () => {
    const adapter = createContipayAdapter(CONTIPAY_CONFIG);
    const result = await adapter.verifyWebhook(body, {
      "x-contipay-signature": contipaySignature(`${body} `, CONTIPAY_CONFIG),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("did not match");
  });

  it("rejects a callback with no signature header", async () => {
    const adapter = createContipayAdapter(CONTIPAY_CONFIG);
    const result = await adapter.verifyWebhook(body, {});
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("x-contipay-signature");
  });

  it("matches statuses case-insensitively, since the casing is unconfirmed", () => {
    expect(mapContipayStatus("SUCCESS")).toBe(PAYMENT_STATUS.PAID);
    expect(mapContipayStatus("Success")).toBe(PAYMENT_STATUS.PAID);
    expect(mapContipayStatus("pending")).toBe(PAYMENT_STATUS.PENDING);
    expect(mapContipayStatus("Declined")).toBe(PAYMENT_STATUS.FAILED);
    expect(mapContipayStatus("something new")).toBeNull();
  });
});

describe("registry", () => {
  const env = {
    PAYMENT_PROVIDER: "paynow",
    PAYNOW_INTEGRATION_ID: "12345",
    PAYNOW_INTEGRATION_KEY: "key",
    PAYNOW_RESULT_URL: "https://app.corelith.co.zw/api/webhooks/payments/paynow",
  } as unknown as NodeJS.ProcessEnv;

  it("resolves the active adapter from PAYMENT_PROVIDER", () => {
    expect(resolveActivePaymentAdapter(env).key).toBe("paynow");
  });

  it("refuses to guess when PAYMENT_PROVIDER is unset", () => {
    expect(() => resolveActivePaymentAdapter({} as NodeJS.ProcessEnv)).toThrow(PaymentConfigError);
    expect(() => resolveActivePaymentAdapter({} as NodeJS.ProcessEnv)).toThrow(/PAYMENT_PROVIDER/);
    expect(hasActivePaymentProvider({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("names the missing variable when the chosen provider is unconfigured", () => {
    expect(() =>
      resolveActivePaymentAdapter({ PAYMENT_PROVIDER: "pesepay" } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/PESEPAY_INTEGRATION_KEY/);
  });

  it("distinguishes an unimplemented provider from an unconfigured one", () => {
    expect(() => getPaymentAdapter("stripe", env)).toThrow(UnknownPaymentProviderError);
  });

  it("ships all three candidate gateways", () => {
    expect(knownPaymentProviders()).toEqual(
      expect.arrayContaining(["contipay", "paynow", "pesepay"]),
    );
  });

  it("lets a runtime registration take a key over, then give it back", () => {
    const fake: PaymentProviderAdapter = {
      key: "paynow",
      async initiatePayment() {
        throw new Error("unused");
      },
      verifyWebhook() {
        return { ok: false, providerEventId: null, providerReference: null, status: null, amount: null };
      },
      async pollStatus() {
        return PAYMENT_STATUS.PENDING;
      },
    };

    registerPaymentAdapter(fake);
    expect(getPaymentAdapter("paynow", {} as NodeJS.ProcessEnv)).toBe(fake);
    unregisterPaymentAdapter("paynow");
    // Back to the built-in, which now demands its configuration again.
    expect(() => getPaymentAdapter("paynow", {} as NodeJS.ProcessEnv)).toThrow(PaymentConfigError);
  });
});
