import { randomUUID } from "node:crypto";

import type { SubscriptionStatus } from "@prisma/client";

import { SUBSCRIPTION_STATUS_LABEL, SUBSCRIPTION_STATUSES } from "@/lib/admin/billing-words";
import { MANUAL_METHODS } from "@/lib/admin/payment-words";
import { AdminRefusal } from "@/lib/admin/refusal";
import { recordOperatorEvent, operatorActor } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { applyPaymentResult, recordPayment } from "@/lib/payments/service";
import { PAYMENT_STATUS } from "@/lib/payments/types";
import { computeCompanyPricing } from "@/lib/platform/entitlements";
import { prisma } from "@/lib/prisma";

/**
 * A workspace's price and money, for operators with the billing role.
 *
 * The price is its verticals at the rate its member count sets
 * (`lib/platform/verticals.ts`, priced by `computeCompanyPricing`); money moves
 * only through `lib/payments/service`, so a payment an operator records extends
 * a subscription exactly as a gateway's would, once.
 */

type Workspace = { id: string; name: string };

const DAY = 24 * 60 * 60 * 1000;

async function latestSubscription(companyId: string) {
  return prisma.companySubscription.findFirst({
    where: { companyId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      trialEndsAt: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      canceledAt: true,
      effectiveMonthlyAmount: true,
    },
  });
}

/** What the workspace pays and why, and the subscription it pays through. */
export async function billingFacts(companyId: string) {
  const [subscription, pricing] = await Promise.all([latestSubscription(companyId), computeCompanyPricing(companyId)]);
  return { subscription, pricing };
}

/**
 * Put a subscription in a status by hand: a customer who cancelled on the
 * phone, a trial agreed as paid, an arrangement that ran out. Cancelled and
 * expired make the workspace read-only (`readStanding`). A reason is required
 * and lands in the workspace's audit log.
 */
export async function setSubscriptionStatus(
  operator: SignedInOperator,
  workspace: Workspace,
  status: SubscriptionStatus,
  reason: string,
  now = new Date(),
) {
  if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) throw new AdminRefusal("Choose a status.");
  const why = reason.trim();
  if (why.length < 3) throw new AdminRefusal("Say why, for the workspace's record.");
  const subscription = await latestSubscription(workspace.id);
  if (!subscription) throw new AdminRefusal(`${workspace.name} has no subscription.`);
  if (subscription.status === status) throw new AdminRefusal(`${workspace.name} is ${SUBSCRIPTION_STATUS_LABEL[status].toLowerCase()} already.`);
  const ending = status === "CANCELED" || status === "EXPIRED";
  await prisma.$transaction(async (tx) => {
    await tx.companySubscription.update({
      where: { id: subscription.id },
      data: {
        status,
        canceledAt: status === "CANCELED" ? now : ending ? subscription.canceledAt : null,
        endedAt: ending ? now : null,
      },
    });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: "operator.billing.status_set",
        entityType: "subscription",
        entityId: subscription.id,
        payload: { from: subscription.status, to: status, reason: why },
      },
      tx,
    );
  });
}

export async function extendTrial(operator: SignedInOperator, workspace: Workspace, days: number, now = new Date()) {
  if (![7, 14, 30].includes(days)) throw new AdminRefusal("A trial is extended by 7, 14 or 30 days.");
  const subscription = await latestSubscription(workspace.id);
  if (subscription?.status !== "TRIALING") throw new AdminRefusal(`${workspace.name} is not on a trial.`);
  const from = subscription.trialEndsAt && subscription.trialEndsAt > now ? subscription.trialEndsAt : now;
  const until = new Date(from.getTime() + days * DAY);
  await prisma.$transaction(async (tx) => {
    await tx.companySubscription.update({ where: { id: subscription.id }, data: { trialEndsAt: until } });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: "operator.billing.trial_extended",
        entityType: "subscription",
        entityId: subscription.id,
        payload: { days, until: until.toISOString() },
      },
      tx,
    );
  });
  return until;
}

/**
 * Money a customer sent outside a gateway — a mobile-money transfer they sent
 * proof of, a bank transfer, cash. Recorded and applied through the payments
 * service, so it extends the subscription by its months exactly once: the
 * reference is the idempotency key, and a second entry of it is refused.
 */
export async function recordManualPayment(
  operator: SignedInOperator,
  workspace: Workspace,
  input: { method: string; reference: string; amount: number; periodMonths: number },
) {
  const reference = input.reference.trim();
  if (!(MANUAL_METHODS as readonly string[]).includes(input.method)) throw new AdminRefusal("Choose how they paid.");
  if (reference.length < 4) throw new AdminRefusal("Enter the transaction reference from their proof or the statement.");
  if (!(input.amount > 0)) throw new AdminRefusal("Enter the amount they paid.");
  if (![1, 3, 12].includes(input.periodMonths)) throw new AdminRefusal("A payment is for 1, 3 or 12 months.");
  const subscription = await latestSubscription(workspace.id);
  // Money is typed by hand. A figure far beyond what the workspace pays for
  // the months chosen is far more often a slip than a payment.
  const pricing = await computeCompanyPricing(workspace.id);
  const expected = pricing.total * input.periodMonths;
  if (expected > 0 && input.amount > expected * 3) {
    throw new AdminRefusal(
      `${workspace.name} pays $${expected.toFixed(2)} for ${input.periodMonths} ${input.periodMonths === 1 ? "month" : "months"}. Check the amount.`,
    );
  }
  const provider = `manual:${input.method}`;
  const existing = await prisma.subscriptionPayment.findUnique({
    where: { provider_providerReference: { provider, providerReference: reference } },
    select: { companyId: true },
  });
  if (existing) throw new AdminRefusal(`That ${input.method} reference is already recorded. A payment counts once.`);

  const { payment } = await recordPayment({
    companyId: workspace.id,
    subscriptionId: subscription?.id ?? null,
    provider,
    providerReference: reference,
    amount: input.amount,
    currency: "USD",
    periodMonths: input.periodMonths,
    idempotencyKey: `${provider}:${reference}:${randomUUID()}`,
    status: PAYMENT_STATUS.PENDING,
    actorId: operatorActor(operator.id),
  });
  await applyPaymentResult({
    provider,
    providerReference: reference,
    status: PAYMENT_STATUS.PAID,
    actorId: operatorActor(operator.id),
  });
  return payment;
}

/**
 * A gateway payment nobody heard back about: an operator checks the statement
 * and says whether the money arrived.
 */
export async function settlePayment(
  operator: SignedInOperator,
  paymentId: string,
  verdict: "PAID" | "FAILED",
  reason: string,
  workspaceId?: string,
) {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
  if (!payment || (workspaceId && payment.companyId !== workspaceId)) throw new AdminRefusal("That payment is not here.");
  if (payment.status !== PAYMENT_STATUS.PENDING && payment.status !== PAYMENT_STATUS.INITIATED) {
    throw new AdminRefusal("That payment is already settled.");
  }
  if (verdict === "FAILED" && reason.trim().length < 3) throw new AdminRefusal("Say why it failed, for the customer's record.");
  await applyPaymentResult({
    provider: payment.provider,
    providerReference: payment.providerReference,
    status: verdict === "PAID" ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.FAILED,
    failureReason: verdict === "FAILED" ? reason.trim() : undefined,
    actorId: operatorActor(operator.id),
  });
}

/** Payments, newest first: one workspace's, or everyone's. */
export async function listPayments(where: { companyId?: string; statuses?: string[] } = {}, take = 100) {
  return prisma.subscriptionPayment.findMany({
    where: {
      ...(where.companyId ? { companyId: where.companyId } : {}),
      ...(where.statuses ? { status: { in: where.statuses } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      provider: true,
      providerReference: true,
      amount: true,
      currency: true,
      status: true,
      periodMonths: true,
      paidAt: true,
      failureReason: true,
      createdAt: true,
      company: { select: { slug: true, name: true } },
    },
  });
}
