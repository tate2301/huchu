/**
 * Starting a payment: the one ordering that is safe.
 *
 * Claim the idempotency key in our database FIRST, then talk to the gateway.
 * The other order — gateway first, row second — loses a real transaction every
 * time the write fails after the money moved, and there is no way to find it
 * again afterwards except by reading a settlement report by hand.
 *
 * The same key coming back a second time (an impatient double-click, a retried
 * form post) is answered with the first attempt's redirect rather than a second
 * transaction. That is why the redirect is stored on the row.
 */
import { Prisma } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import { recordPayment } from "@/lib/payments/service";
import {
  PAYMENT_STATUS,
  PaymentGatewayError,
  type PaymentProviderAdapter,
  type PaymentStatus,
} from "@/lib/payments/types";

export type CheckoutInput = {
  companyId: string;
  subscriptionId?: string | null;
  /** Decimal string, from the pricing catalog — never a float. */
  amount: string;
  currency: string;
  periodMonths: number;
  returnUrl: string;
  idempotencyKey: string;
  actorId?: string | null;
  payerEmail?: string;
  payerPhone?: string;
};

export type CheckoutResult = {
  paymentId: string;
  provider: string;
  providerReference: string;
  redirectUrl: string | null;
  status: PaymentStatus;
  /** True when this key had already started a payment and the caller is being
   *  handed that one back. Not an error — the desired outcome of a double
   *  submit. */
  reused: boolean;
};

/** What we keep on `rawPayloadJson` for an in-flight checkout. `pollHandle` is
 *  here because Paynow's poll URL cannot be derived from the reference, so
 *  losing it means losing the ability to ask what happened. */
type CheckoutEnvelope = {
  redirectUrl: string | null;
  pollHandle: string | null;
  gatewayResponse: string;
};

export async function initiateSubscriptionCheckout(
  adapter: PaymentProviderAdapter,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const claim = await recordPayment({
    companyId: input.companyId,
    subscriptionId: input.subscriptionId ?? null,
    provider: adapter.key,
    // A placeholder only until the gateway names the transaction. It is our own
    // key, so it cannot collide with a real gateway reference.
    providerReference: input.idempotencyKey,
    amount: input.amount,
    currency: input.currency,
    periodMonths: input.periodMonths,
    idempotencyKey: input.idempotencyKey,
    status: PAYMENT_STATUS.INITIATED,
    actorId: input.actorId ?? null,
  });

  if (!claim.created) {
    const envelope = readCheckoutEnvelope(claim.payment.rawPayloadJson);
    return {
      paymentId: claim.payment.id,
      provider: claim.payment.provider,
      providerReference: claim.payment.providerReference,
      redirectUrl: envelope?.redirectUrl ?? null,
      status: claim.payment.status as PaymentStatus,
      reused: true,
    };
  }

  let result;
  try {
    result = await adapter.initiatePayment({
      companyId: input.companyId,
      amount: input.amount,
      currency: input.currency,
      periodMonths: input.periodMonths,
      returnUrl: input.returnUrl,
      idempotencyKey: input.idempotencyKey,
      payerEmail: input.payerEmail,
      payerPhone: input.payerPhone,
    });
  } catch (error) {
    // Fail the row we claimed. An INITIATED payment nobody ever attempted looks
    // identical to one the customer abandoned mid-redirect, and the two need
    // different follow-up.
    await prisma.subscriptionPayment.update({
      where: { id: claim.payment.id },
      data: {
        status: PAYMENT_STATUS.FAILED,
        failureReason: `Gateway refused initiation: ${(error as Error).message}`.slice(0, 500),
      },
    });
    throw error;
  }

  const envelope: CheckoutEnvelope = {
    redirectUrl: result.redirectUrl,
    pollHandle: result.pollHandle ?? null,
    gatewayResponse: result.rawResponse,
  };

  try {
    const updated = await prisma.subscriptionPayment.update({
      where: { id: claim.payment.id },
      data: {
        providerReference: result.providerReference,
        status: result.status,
        rawPayloadJson: JSON.stringify(envelope),
      },
    });

    return {
      paymentId: updated.id,
      provider: updated.provider,
      providerReference: updated.providerReference,
      redirectUrl: result.redirectUrl,
      status: result.status,
      reused: false,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PaymentGatewayError(
        adapter.key,
        `Gateway returned reference ${result.providerReference}, which already belongs to another payment.`,
        result.rawResponse,
      );
    }
    throw error;
  }
}

export function readCheckoutEnvelope(rawPayloadJson: string | null): CheckoutEnvelope | null {
  if (!rawPayloadJson) return null;
  try {
    const parsed = JSON.parse(rawPayloadJson) as Partial<CheckoutEnvelope>;
    return {
      redirectUrl: typeof parsed.redirectUrl === "string" ? parsed.redirectUrl : null,
      pollHandle: typeof parsed.pollHandle === "string" ? parsed.pollHandle : null,
      gatewayResponse: typeof parsed.gatewayResponse === "string" ? parsed.gatewayResponse : "",
    };
  } catch {
    // A payload written by something other than this function (a stored webhook
    // body, say) is not an error — it just has no redirect in it.
    return null;
  }
}
