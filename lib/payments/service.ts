/**
 * What a payment does to a subscription.
 *
 * Two entry points, and the split matters: `recordPayment` is what a tenant
 * admin's checkout click produces, `applyPaymentResult` is what a gateway's
 * later verdict produces. They are separate because the second one arrives
 * over an untrusted channel, possibly twice, possibly out of order, possibly
 * for a payment this deployment has never heard of — and every one of those
 * cases has to be survivable without a human unpicking a subscription by hand.
 *
 * The idempotency here is not defensive politeness. A gateway retries until it
 * sees a 2xx, so "applied twice" is not a rare race, it is the normal shape of
 * a slow response — and applied twice means a tenant silently gets two months
 * for one month's money.
 */
import { Prisma } from "@prisma/client";

import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import {
  PAYMENT_STATUS,
  TERMINAL_PAYMENT_STATUSES,
  type PaymentStatus,
} from "@/lib/payments/types";

/** Subscription states a settled payment revives.
 *
 * `EXPIRED` is in the set on purpose, beyond the TRIALING/PAST_DUE pair: the
 * standing instruction is degradation rather than cutoff, so an expired tenant
 * is a read-only tenant that is still there to pay — and when it does,
 * "recovery on payment is immediate" (SS-5.3) has to mean the same thing for it
 * as for one caught inside the grace window.
 *
 * `CANCELED` is deliberately NOT in the set. Cancellation is a decision someone
 * made; a payment arriving afterwards is a refund conversation, not a silent
 * resurrection of a subscription nobody asked to restart.
 */
const REACTIVATING_STATUSES = new Set(["TRIALING", "PAST_DUE", "EXPIRED"]);

/** Actor recorded when a webhook, not a person, moved the money. */
const SYSTEM_ACTOR = "system:payments";

export type RecordPaymentInput = {
  companyId: string;
  subscriptionId?: string | null;
  provider: string;
  providerReference: string;
  amount: Prisma.Decimal | number | string;
  currency: string;
  periodMonths: number;
  idempotencyKey: string;
  status?: PaymentStatus;
  rawPayloadJson?: string | null;
  /** The user who started the checkout, when there was one. */
  actorId?: string | null;
};

export type RecordPaymentResult = {
  payment: Awaited<ReturnType<typeof prisma.subscriptionPayment.create>>;
  /** False when an identical attempt already existed — the caller should treat
   *  that as success, not as an error, and re-use the row's reference. */
  created: boolean;
};

/**
 * Write the intent to pay, before any money moves.
 *
 * A duplicate is answered with the existing row rather than an error. Both
 * unique constraints exist to make that possible: `idempotencyKey` catches the
 * double-submitted checkout, `(provider, providerReference)` catches the same
 * transaction arriving under a second key.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  const status = input.status ?? PAYMENT_STATUS.INITIATED;

  try {
    const payment = await prisma.subscriptionPayment.create({
      data: {
        companyId: input.companyId,
        subscriptionId: input.subscriptionId ?? null,
        provider: input.provider,
        providerReference: input.providerReference,
        amount: money(input.amount),
        currency: input.currency,
        status,
        periodMonths: input.periodMonths,
        idempotencyKey: input.idempotencyKey,
        rawPayloadJson: input.rawPayloadJson ?? null,
      },
    });

    await writePlatformAuditEvent({
      companyId: input.companyId,
      actorId: input.actorId ?? SYSTEM_ACTOR,
      eventType: "billing.payment.initiated",
      entityType: "SubscriptionPayment",
      entityId: payment.id,
      payload: {
        provider: input.provider,
        providerReference: input.providerReference,
        amount: money(input.amount).toFixed(2),
        currency: input.currency,
        periodMonths: input.periodMonths,
      },
    });

    return { payment, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const existing =
      (await prisma.subscriptionPayment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      })) ??
      (await prisma.subscriptionPayment.findUnique({
        where: {
          provider_providerReference: {
            provider: input.provider,
            providerReference: input.providerReference,
          },
        },
      }));

    // The constraint fired but neither lookup found the row: something else is
    // unique-colliding and swallowing it would hide it.
    if (!existing) throw error;
    return { payment: existing, created: false };
  }
}

export type ApplyPaymentOutcome =
  /** Status moved, and if PAID the subscription moved with it. */
  | "APPLIED"
  /** Money settled, but this company has no subscription row to extend. */
  | "APPLIED_NO_SUBSCRIPTION"
  /** Already in this state. The replayed webhook lands here. */
  | "ALREADY_APPLIED"
  /** The payment is settled or cancelled; a later delivery cannot move it. */
  | "TERMINAL"
  /** No payment with this provider reference — the checkout never reached us. */
  | "UNKNOWN_PAYMENT";

export type ApplyPaymentResultInput = {
  provider: string;
  providerReference: string;
  status: PaymentStatus;
  /** What the gateway says was taken. Recorded when it disagrees with what we
   *  asked for; never used to change the amount we charge. */
  amount?: string | null;
  failureReason?: string | null;
  rawPayloadJson?: string | null;
  actorId?: string | null;
  /** Injectable so a test can assert a period boundary without waiting a month. */
  now?: Date;
};

export type ApplyPaymentResult = {
  applied: boolean;
  outcome: ApplyPaymentOutcome;
  paymentId?: string;
  companyId?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: Date | null;
};

/**
 * Apply a gateway verdict to a payment, and to the subscription behind it.
 *
 * Every early return is a case a live gateway will actually produce, and each
 * is a no-op rather than an error: the caller answers 200 to all of them,
 * because a gateway that is told "error" retries forever over a message we
 * already understood.
 */
export async function applyPaymentResult(
  input: ApplyPaymentResultInput,
): Promise<ApplyPaymentResult> {
  const payment = await prisma.subscriptionPayment.findUnique({
    where: {
      provider_providerReference: {
        provider: input.provider,
        providerReference: input.providerReference,
      },
    },
  });

  if (!payment) {
    return { applied: false, outcome: "UNKNOWN_PAYMENT" };
  }

  const current = payment.status as PaymentStatus;

  if (current === input.status) {
    return {
      applied: false,
      outcome: "ALREADY_APPLIED",
      paymentId: payment.id,
      companyId: payment.companyId,
    };
  }

  // Out-of-order delivery: gateways promise delivery, not ordering, so a stale
  // PENDING can arrive after the PAID it preceded. Settled stays settled.
  if (TERMINAL_PAYMENT_STATUSES.has(current)) {
    return {
      applied: false,
      outcome: "TERMINAL",
      paymentId: payment.id,
      companyId: payment.companyId,
    };
  }

  const now = input.now ?? new Date();
  const isPaid = input.status === PAYMENT_STATUS.PAID;

  return prisma.$transaction(async (tx) => {
    // Compare-and-set on the status we read. Two concurrent deliveries of the
    // same verdict both pass the checks above; only the one that still sees the
    // old status writes, and the loser reports ALREADY_APPLIED instead of
    // extending the period a second time.
    const claimed = await tx.subscriptionPayment.updateMany({
      where: { id: payment.id, status: current },
      data: {
        status: input.status,
        paidAt: isPaid ? now : payment.paidAt,
        failureReason: input.failureReason ?? null,
        rawPayloadJson: input.rawPayloadJson ?? payment.rawPayloadJson,
      },
    });

    if (claimed.count === 0) {
      return {
        applied: false,
        outcome: "ALREADY_APPLIED" as const,
        paymentId: payment.id,
        companyId: payment.companyId,
      };
    }

    if (!isPaid) {
      await writePlatformAuditEvent(
        {
          companyId: payment.companyId,
          actorId: input.actorId ?? SYSTEM_ACTOR,
          eventType: `billing.payment.${input.status.toLowerCase()}`,
          entityType: "SubscriptionPayment",
          entityId: payment.id,
          reason: input.failureReason ?? undefined,
          payload: {
            provider: input.provider,
            providerReference: input.providerReference,
            previousStatus: current,
            status: input.status,
          },
        },
        tx,
      );
      return {
        applied: true,
        outcome: "APPLIED" as const,
        paymentId: payment.id,
        companyId: payment.companyId,
      };
    }

    const subscription = payment.subscriptionId
      ? await tx.companySubscription.findUnique({ where: { id: payment.subscriptionId } })
      : await tx.companySubscription.findFirst({
          where: { companyId: payment.companyId },
          orderBy: { updatedAt: "desc" },
        });

    if (!subscription) {
      // The money is real and recorded even though there is nothing to extend.
      // Losing the payment because the subscription row is missing would be the
      // worse failure of the two.
      await writePlatformAuditEvent(
        {
          companyId: payment.companyId,
          actorId: input.actorId ?? SYSTEM_ACTOR,
          eventType: "billing.payment.paid",
          entityType: "SubscriptionPayment",
          entityId: payment.id,
          reason: "No subscription found to extend.",
          payload: {
            provider: input.provider,
            providerReference: input.providerReference,
            amount: payment.amount.toFixed(2),
            periodMonths: payment.periodMonths,
          },
        },
        tx,
      );
      return {
        applied: true,
        outcome: "APPLIED_NO_SUBSCRIPTION" as const,
        paymentId: payment.id,
        companyId: payment.companyId,
      };
    }

    // Extend from the later of "now" and the period already paid for. A tenant
    // who renews a week early keeps that week; a tenant who pays a week late
    // does not get billed for the week it was locked out of.
    const base =
      subscription.currentPeriodEnd && subscription.currentPeriodEnd > now
        ? subscription.currentPeriodEnd
        : now;
    const nextPeriodEnd = addMonths(base, payment.periodMonths);
    const nextStatus = REACTIVATING_STATUSES.has(subscription.status)
      ? "ACTIVE"
      : subscription.status;

    const updated = await tx.companySubscription.update({
      where: { id: subscription.id },
      data: {
        status: nextStatus as typeof subscription.status,
        currentPeriodStart: subscription.currentPeriodStart ?? now,
        currentPeriodEnd: nextPeriodEnd,
        // Neither Paynow, Pesepay nor ContiPay has a recurring-subscription
        // object to point at, so the most recent settled transaction is the
        // best external handle there is. Namespaced by provider so a migration
        // between gateways cannot produce a reference that collides with an old
        // one from the other.
        externalSubscriptionId: `${input.provider}:${input.providerReference}`,
      },
    });

    // Written inside the transaction: money moving a subscription and the
    // record of it moving commit together or not at all.
    await writePlatformAuditEvent(
      {
        companyId: payment.companyId,
        actorId: input.actorId ?? SYSTEM_ACTOR,
        eventType: "billing.subscription.paid",
        entityType: "CompanySubscription",
        entityId: subscription.id,
        payload: {
          provider: input.provider,
          providerReference: input.providerReference,
          paymentId: payment.id,
          amount: payment.amount.toFixed(2),
          currency: payment.currency,
          periodMonths: payment.periodMonths,
          previousStatus: subscription.status,
          status: nextStatus,
          previousPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          currentPeriodEnd: nextPeriodEnd.toISOString(),
          // What the gateway said it took, when it said anything. A mismatch
          // against `amount` is the first thing a settlement dispute looks at.
          gatewayAmount: input.amount ?? null,
        },
      },
      tx,
    );

    return {
      applied: true,
      outcome: "APPLIED" as const,
      paymentId: payment.id,
      companyId: payment.companyId,
      subscriptionId: updated.id,
      subscriptionStatus: updated.status,
      currentPeriodEnd: updated.currentPeriodEnd,
    };
  });
}

/**
 * Add whole months, clamping to the end of the target month.
 *
 * 31 January plus one month is 28 February, not 3 March. Rolling over would
 * hand a tenant three free days once a year and, worse, move their billing
 * anniversary a little further every renewal.
 */
export function addMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const day = from.getUTCDate();

  const targetMonthStart = Date.UTC(year, month + months, 1);
  const target = new Date(targetMonthStart);
  const daysInTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      Math.min(day, daysInTargetMonth),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
