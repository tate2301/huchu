/**
 * The inbound half of the payment seam.
 *
 * The order of operations here is the whole design, and it is: **verify,
 * record, deduplicate, only then apply.** Recording before applying is what
 * makes a delivery that dies halfway through visible rather than lost — the
 * `PaymentWebhookEvent` row exists whether or not the transition completed,
 * which is precisely the case a payment-table-only replay guard cannot see.
 *
 * A replayed webhook is an observable no-op: it is answered 200, it changes
 * nothing, and it leaves the first delivery's `processedAt` untouched. 200 and
 * not an error, because a gateway told "error" retries forever over a message
 * we already understood.
 */
import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { applyPaymentResult, type ApplyPaymentOutcome } from "@/lib/payments/service";
import {
  UnknownPaymentProviderError,
  getPaymentAdapter,
} from "@/lib/payments/registry";
import { PaymentConfigError, type VerifyWebhookResult } from "@/lib/payments/types";

export type WebhookOutcome =
  | "UNKNOWN_PROVIDER"
  | "MISCONFIGURED"
  | "UNVERIFIED"
  | "UNREADABLE"
  | "DUPLICATE"
  | "APPLY_FAILED"
  | ApplyPaymentOutcome;

export type WebhookHandlerResult = {
  httpStatus: number;
  outcome: WebhookOutcome;
  /** The recorded delivery, when one was recorded. Absent only for a provider
   *  key we do not implement — there is no table to file it under. */
  eventId?: string;
  paymentId?: string;
  subscriptionId?: string;
  error?: string;
};

export type HandlePaymentWebhookInput = {
  provider: string;
  /** The bytes as delivered. Every signature scheme signs these, and
   *  re-serialising a parsed body changes them. */
  rawBody: string;
  headers: Record<string, string>;
  env?: NodeJS.ProcessEnv;
};

export async function handlePaymentWebhook(
  input: HandlePaymentWebhookInput,
): Promise<WebhookHandlerResult> {
  const provider = input.provider.trim().toLowerCase();

  let adapter;
  try {
    adapter = getPaymentAdapter(provider, input.env ?? process.env);
  } catch (error) {
    if (error instanceof UnknownPaymentProviderError) {
      // Nothing to record against: `provider` is not a gateway we speak to, and
      // filing arbitrary strings in the event table on request is a way to let
      // strangers fill it.
      return { httpStatus: 404, outcome: "UNKNOWN_PROVIDER", error: error.message };
    }
    if (error instanceof PaymentConfigError) {
      // Our deployment is broken, not the delivery. 500 so the gateway retries
      // once the variable is set instead of giving up on a real payment.
      return { httpStatus: 500, outcome: "MISCONFIGURED", error: error.message };
    }
    throw error;
  }

  let verification: VerifyWebhookResult;
  try {
    verification = await adapter.verifyWebhook(input.rawBody, input.headers);
  } catch (error) {
    // An adapter that throws while verifying tells us nothing about the sender,
    // so the delivery is unverified — recorded and refused, not trusted.
    verification = {
      ok: false,
      providerEventId: null,
      providerReference: null,
      status: null,
      amount: null,
      reason: `Verification threw: ${(error as Error).message}`,
    };
  }

  // A provider that numbers its deliveries gives us the dedupe key; one that
  // does not gets a digest of the body, which is stable across a retransmission
  // of the same message and different for the next one.
  const providerEventId = verification.providerEventId ?? sha256(input.rawBody);

  const claim = await claimWebhookEvent({
    provider,
    providerEventId,
    signatureVerified: verification.ok,
    payloadJson: input.rawBody,
  });

  if (claim.kind === "DUPLICATE") {
    return { httpStatus: 200, outcome: "DUPLICATE", eventId: claim.eventId };
  }

  const eventId = claim.eventId;

  if (!verification.ok) {
    const reason = verification.reason ?? "Signature could not be verified.";
    // Stamped processed: the same unverifiable bytes will never verify, so
    // leaving it open would invite the same delivery to be retried forever.
    await closeWebhookEvent(eventId, reason);
    return { httpStatus: 401, outcome: "UNVERIFIED", eventId, error: reason };
  }

  if (!verification.providerReference || !verification.status) {
    const reason =
      verification.reason ?? "Verified delivery carried no usable reference or status.";
    await closeWebhookEvent(eventId, reason);
    return { httpStatus: 400, outcome: "UNREADABLE", eventId, error: reason };
  }

  let applied;
  try {
    applied = await applyPaymentResult({
      provider,
      providerReference: verification.providerReference,
      status: verification.status,
      amount: verification.amount,
      rawPayloadJson: input.rawBody,
      failureReason: verification.reason ?? null,
    });
  } catch (error) {
    // Left unprocessed on purpose: the gateway's next retry is the recovery
    // path, and it can only re-enter through `claimWebhookEvent` if this row
    // still has no `processedAt`.
    await prisma.paymentWebhookEvent.update({
      where: { id: eventId },
      data: { error: `Apply failed: ${(error as Error).message}`.slice(0, 500) },
    });
    return {
      httpStatus: 500,
      outcome: "APPLY_FAILED",
      eventId,
      error: (error as Error).message,
    };
  }

  await closeWebhookEvent(
    eventId,
    applied.outcome === "APPLIED" || applied.outcome === "APPLIED_NO_SUBSCRIPTION"
      ? null
      : applied.outcome,
  );

  return {
    // Every apply outcome is a 200. UNKNOWN_PAYMENT included: a reference we
    // have never seen will not become known by being retried, and a gateway
    // hammering a 404 is noise, not recovery.
    httpStatus: 200,
    outcome: applied.outcome,
    eventId,
    paymentId: applied.paymentId,
    subscriptionId: applied.subscriptionId,
  };
}

type ClaimResult = { kind: "CLAIMED" | "RETRY"; eventId: string } | { kind: "DUPLICATE"; eventId: string };

/**
 * Take ownership of one delivery, or discover somebody already has.
 *
 * The unique index on `(provider, providerEventId)` is the arbiter — checking
 * for an existing row first and inserting second would leave a window two
 * simultaneous deliveries both walk through.
 *
 * A row that exists but was never processed is handed back for another go: that
 * is the delivery that died mid-apply, and the gateway's retry is the only
 * thing that will finish it.
 */
async function claimWebhookEvent(input: {
  provider: string;
  providerEventId: string;
  signatureVerified: boolean;
  payloadJson: string;
}): Promise<ClaimResult> {
  try {
    const created = await prisma.paymentWebhookEvent.create({
      data: {
        provider: input.provider,
        providerEventId: input.providerEventId,
        signatureVerified: input.signatureVerified,
        payloadJson: input.payloadJson,
      },
    });
    return { kind: "CLAIMED", eventId: created.id };
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }

    const existing = await prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: input.provider,
          providerEventId: input.providerEventId,
        },
      },
    });
    if (!existing) throw error;

    if (existing.processedAt) {
      return { kind: "DUPLICATE", eventId: existing.id };
    }

    await prisma.paymentWebhookEvent.update({
      where: { id: existing.id },
      data: { signatureVerified: input.signatureVerified, payloadJson: input.payloadJson },
    });
    return { kind: "RETRY", eventId: existing.id };
  }
}

function closeWebhookEvent(eventId: string, error: string | null) {
  return prisma.paymentWebhookEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date(), error: error ? error.slice(0, 500) : null },
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
