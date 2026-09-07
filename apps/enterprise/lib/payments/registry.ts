/**
 * Which gateway is live.
 *
 * SS-4.1 picks one of three on evidence; this file is where that decision
 * becomes a deployment setting. `PAYMENT_PROVIDER=pesepay` is the whole of the
 * migration, and nothing above this line — checkout, the webhook route, the
 * billing page — names a gateway.
 *
 * Adapters are built on demand rather than at module load. Building one reads
 * credentials, and a module that throws at import time takes the whole route
 * table down over a variable that only the billing page needs.
 */
import { createContipayAdapter, contipayConfigFromEnv, CONTIPAY_KEY } from "@/lib/payments/contipay";
import { createPaynowAdapter, paynowConfigFromEnv, PAYNOW_KEY } from "@/lib/payments/paynow";
import { createPesepayAdapter, pesepayConfigFromEnv, PESEPAY_KEY } from "@/lib/payments/pesepay";
import { PaymentConfigError, type PaymentProviderAdapter } from "@/lib/payments/types";

type AdapterFactory = (env: NodeJS.ProcessEnv) => PaymentProviderAdapter;

const BUILT_IN_ADAPTERS: Record<string, AdapterFactory> = {
  [PAYNOW_KEY]: (env) => createPaynowAdapter(paynowConfigFromEnv(env)),
  [PESEPAY_KEY]: (env) => createPesepayAdapter(pesepayConfigFromEnv(env)),
  [CONTIPAY_KEY]: (env) => createContipayAdapter(contipayConfigFromEnv(env)),
};

/** Adapters registered at runtime. A fourth gateway, and the seam the tests use
 *  to exercise the webhook pipeline without a real integration key. */
const registered = new Map<string, PaymentProviderAdapter>();

export function registerPaymentAdapter(adapter: PaymentProviderAdapter): void {
  registered.set(adapter.key.toLowerCase(), adapter);
}

export function unregisterPaymentAdapter(key: string): void {
  registered.delete(key.trim().toLowerCase());
}

/** Every provider key that resolves today, built-in or registered. */
export function knownPaymentProviders(): string[] {
  return [...new Set([...Object.keys(BUILT_IN_ADAPTERS), ...registered.keys()])].sort();
}

export class UnknownPaymentProviderError extends Error {
  readonly provider: string;

  constructor(provider: string) {
    super(
      `Unknown payment provider "${provider}". Known providers: ${knownPaymentProviders().join(", ")}.`,
    );
    this.name = "UnknownPaymentProviderError";
    this.provider = provider;
  }
}

/**
 * The adapter for one provider key.
 *
 * Throws {@link UnknownPaymentProviderError} for a key nobody implements, and
 * `PaymentConfigError` for a key that is implemented but not configured. The
 * webhook route distinguishes them: the first is a 404 (a request for a gateway
 * we do not have), the second is a 500 (our deployment is broken).
 */
export function getPaymentAdapter(
  provider: string,
  env: NodeJS.ProcessEnv = process.env,
): PaymentProviderAdapter {
  const key = provider.trim().toLowerCase();
  if (!key) throw new UnknownPaymentProviderError(provider);

  const override = registered.get(key);
  if (override) return override;

  const factory = BUILT_IN_ADAPTERS[key];
  if (!factory) throw new UnknownPaymentProviderError(provider);
  return factory(env);
}

/**
 * The gateway currently taking money, per `PAYMENT_PROVIDER`.
 *
 * Unset is an error rather than a default. Defaulting to whichever adapter was
 * written first would mean a deployment that forgot the variable still shows a
 * checkout button, and the failure would surface as a payer's declined
 * transaction instead of as a startup complaint.
 */
export function resolveActivePaymentAdapter(
  env: NodeJS.ProcessEnv = process.env,
): PaymentProviderAdapter {
  const configured = String(env.PAYMENT_PROVIDER ?? "").trim();
  if (!configured) {
    throw new PaymentConfigError(
      `PAYMENT_PROVIDER is not set. Set it to one of: ${knownPaymentProviders().join(", ")}.`,
    );
  }
  return getPaymentAdapter(configured, env);
}

/** True when a checkout can be offered at all. Surfaces that must not throw —
 *  a billing page deciding whether to render an upgrade button — ask this. */
export function hasActivePaymentProvider(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    resolveActivePaymentAdapter(env);
    return true;
  } catch {
    return false;
  }
}
