/**
 * The payment seam (SS-4.2).
 *
 * SS-4.1 has not picked a gateway yet, and the criteria it will be picked on —
 * recurring-billing support and settlement time — are properties of the
 * provider, not of our code. So the code is written to be indifferent: one
 * interface, three implementations, and a single env var choosing between them.
 * Swapping Paynow for Pesepay after the memo lands must be a config change, not
 * a rewrite of the billing page and the webhook.
 *
 * Nothing in this file talks to a network or to Prisma. The adapters do the
 * first, `service.ts` does the second, and keeping them apart is what lets the
 * status vocabulary below be tested without either.
 */

/**
 * Our payment vocabulary, not any gateway's. Every adapter maps its provider's
 * strings onto these five, in one named place, so the rest of the platform
 * never has to know that Paynow says "Awaiting Delivery" and Pesepay says
 * "PROCESSING" for the same thing.
 *
 * These are the values `SubscriptionPayment.status` holds; the schema comment
 * on that column is the other half of this contract.
 */
export const PAYMENT_STATUS = {
  /** Handed to the gateway, customer has not yet been anywhere. */
  INITIATED: "INITIATED",
  /** In flight at the gateway — customer is on the redirect, or the mobile
   *  money push is waiting on a PIN. Not money yet. */
  PENDING: "PENDING",
  /** Settled. The only status that moves a subscription. */
  PAID: "PAID",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/** Statuses no later delivery may move away from — money settled or the
 *  attempt is dead. Guards the out-of-order webhook: gateways do not promise
 *  delivery order, so a stale PENDING can arrive after its own PAID. */
export const TERMINAL_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  PAYMENT_STATUS.PAID,
  PAYMENT_STATUS.CANCELLED,
]);

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && value in PAYMENT_STATUS;
}

/** Billing terms we sell. Annual is the ask (PR-2.1 / SS-4.3); the other two
 *  exist so a tenant that cannot prepay a year is not turned away. */
export const SUPPORTED_PERIOD_MONTHS = [1, 3, 12] as const;
export type PeriodMonths = (typeof SUPPORTED_PERIOD_MONTHS)[number];

export type InitiatePaymentInput = {
  companyId: string;
  /** A decimal string ("199.00"), never a float. The gateway settles cents and
   *  a float charge rounds into a mismatch with what it settled. */
  amount: string;
  currency: string;
  periodMonths: number;
  /** Where the gateway sends the customer's browser when they are done. */
  returnUrl: string;
  /** Ours, not the gateway's: the same key twice must be the same payment.
   *  Adapters that can pass it through as their own reference do. */
  idempotencyKey: string;
  /** Some gateways require a payer contact on the initiate call. Optional
   *  because not all do, and the trial identifier (SS-3.1) is a phone. */
  payerEmail?: string;
  payerPhone?: string;
  /** Server-to-server callback. Defaults to the platform webhook route. */
  resultUrl?: string;
};

export type InitiatePaymentResult = {
  /** The gateway's id for this transaction — the join key for every later
   *  webhook and poll. Written to `SubscriptionPayment.providerReference`. */
  providerReference: string;
  /** Where to send the customer. Null on gateways that take the money without
   *  a browser (a mobile-money push), which is a legitimate outcome. */
  redirectUrl: string | null;
  status: PaymentStatus;
  /** Opaque per-provider handle for {@link PaymentProviderAdapter.pollStatus} —
   *  Paynow hands back a poll URL that is not derivable from the reference. */
  pollHandle?: string | null;
  /** Verbatim gateway response, stored on the payment row. Kept because a
   *  settlement dispute is argued from what the gateway actually said. */
  rawResponse: string;
};

export type VerifyWebhookResult = {
  /** False means the delivery is not provably from the gateway. It is still
   *  recorded — see `PaymentWebhookEvent.signatureVerified`. */
  ok: boolean;
  /** The gateway's id for this *delivery*, which is what deduplicates replays.
   *  Null when the provider sends nothing usable; the caller substitutes a
   *  digest of the body rather than dropping the event. */
  providerEventId: string | null;
  providerReference: string | null;
  status: PaymentStatus | null;
  /** Decimal string, or null when the callback does not restate the amount. */
  amount: string | null;
  /** Why `ok` is false, or why a field could not be read. Recorded, not thrown:
   *  a rejected delivery must leave a trail. */
  reason?: string;
};

export interface PaymentProviderAdapter {
  /** Matches `SubscriptionPayment.provider` and the `[provider]` URL segment. */
  readonly key: string;
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  /**
   * Raw body, not parsed JSON: every signature scheme below signs the bytes as
   * sent, and re-serialising a parsed object changes them.
   */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<VerifyWebhookResult> | VerifyWebhookResult;
  pollStatus(providerReference: string, pollHandle?: string | null): Promise<PaymentStatus>;
}

/** Configuration is missing or malformed — a deployment fault, not a payer
 *  fault. Separated from gateway errors so the webhook route can answer a
 *  misconfigured provider differently from a declined card. */
export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigError";
  }
}

/** The gateway answered, and the answer was not usable. */
export class PaymentGatewayError extends Error {
  readonly provider: string;
  readonly rawResponse?: string;

  constructor(provider: string, message: string, rawResponse?: string) {
    super(message);
    this.name = "PaymentGatewayError";
    this.provider = provider;
    this.rawResponse = rawResponse;
  }
}

/** Read a required setting, naming the variable in the failure. An adapter
 *  that half-works is worse than one that refuses at the first call. */
export function requireEnv(name: string, value: string | undefined): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new PaymentConfigError(`${name} is not set; the payment adapter cannot be used.`);
  }
  return trimmed;
}

/** Header lookup that does not care about case, because Node lowercases
 *  incoming headers and gateway documentation does not. */
export function headerValue(headers: Record<string, string>, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return null;
}
