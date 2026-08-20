/**
 * The payment seam's public surface.
 *
 * Callers outside `lib/payments` import from here and never from a named
 * adapter — importing `@/lib/payments/paynow` anywhere else is the beginning of
 * the rewrite this module exists to prevent.
 */
export {
  PAYMENT_STATUS,
  SUPPORTED_PERIOD_MONTHS,
  TERMINAL_PAYMENT_STATUSES,
  PaymentConfigError,
  PaymentGatewayError,
  isPaymentStatus,
  type InitiatePaymentInput,
  type InitiatePaymentResult,
  type PaymentProviderAdapter,
  type PaymentStatus,
  type PeriodMonths,
  type VerifyWebhookResult,
} from "@/lib/payments/types";

export {
  UnknownPaymentProviderError,
  getPaymentAdapter,
  hasActivePaymentProvider,
  knownPaymentProviders,
  registerPaymentAdapter,
  resolveActivePaymentAdapter,
  unregisterPaymentAdapter,
} from "@/lib/payments/registry";

export {
  addMonths,
  applyPaymentResult,
  recordPayment,
  type ApplyPaymentOutcome,
  type ApplyPaymentResult,
  type RecordPaymentResult,
} from "@/lib/payments/service";

export {
  initiateSubscriptionCheckout,
  readCheckoutEnvelope,
  type CheckoutInput,
  type CheckoutResult,
} from "@/lib/payments/checkout";

export {
  handlePaymentWebhook,
  type WebhookHandlerResult,
  type WebhookOutcome,
} from "@/lib/payments/webhook";
