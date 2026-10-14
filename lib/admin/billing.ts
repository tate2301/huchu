import { randomUUID } from "node:crypto";

import { MANUAL_METHODS } from "@/lib/admin/payment-words";
import { AdminRefusal } from "@/lib/admin/refusal";
import { recordOperatorEvent, operatorActor } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { applyPaymentResult, recordPayment } from "@/lib/payments/service";
import { PAYMENT_STATUS } from "@/lib/payments/types";
import { computeCompanyPricing, recomputeAndPersistCompanyPricing } from "@/lib/platform/entitlements";
import { BUNDLE_DEPENDENCIES, FEATURE_BUNDLES, getTierDefinition, TIERS } from "@/lib/platform/feature-catalog";
import { ensureTierPlan } from "@/lib/platform/provision";
import { prisma } from "@/lib/prisma";

/**
 * A workspace's plan and money, for operators with the billing role.
 *
 * The catalogue (`feature-catalog.ts`) is the source of truth for tiers, add-ons
 * and prices; money moves only through `lib/payments/service`, so a payment an
 * operator records extends a subscription exactly as a gateway's would, once.
 */

type Workspace = { id: string; name: string };

const DAY = 24 * 60 * 60 * 1000;

async function latestSubscription(companyId: string) {
  return prisma.companySubscription.findFirst({
    where: { companyId },
    orderBy: { updatedAt: "desc" },
    include: { plan: { select: { code: true, name: true, monthlyPrice: true } } },
  });
}

export async function billingFacts(companyId: string) {
  const [subscription, addons, pricing] = await Promise.all([
    latestSubscription(companyId),
    prisma.companySubscriptionAddon.findMany({
      where: { companyId },
      select: { isEnabled: true, bundle: { select: { code: true } } },
    }),
    computeCompanyPricing(companyId),
  ]);
  const tier = getTierDefinition(subscription?.plan.code);
  const enabled = new Set(addons.filter((addon) => addon.isEnabled).map((addon) => addon.bundle.code));
  return {
    subscription,
    tiers: TIERS.map((candidate) => ({ code: candidate.code, name: candidate.name, monthlyPrice: candidate.monthlyPrice })),
    addOns: FEATURE_BUNDLES.map((bundle) => ({
      code: bundle.code,
      name: bundle.name,
      description: bundle.description,
      monthlyPrice: bundle.monthlyPrice,
      state: tier?.includedBundles.includes(bundle.code) ? ("Included" as const) : enabled.has(bundle.code) ? ("On" as const) : ("Off" as const),
    })),
    monthlyTotal: pricing.totalAmount,
  };
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

export async function changePlan(operator: SignedInOperator, workspace: Workspace, tierCode: string) {
  const tier = getTierDefinition(tierCode);
  if (!tier) throw new AdminRefusal("That plan is not in the catalogue.");
  const subscription = await latestSubscription(workspace.id);
  if (!subscription) throw new AdminRefusal(`${workspace.name} has no subscription to change.`);
  if (subscription.plan.code === tier.code) return tier;
  const plan = await ensureTierPlan(tier.code);
  await prisma.$transaction(async (tx) => {
    await tx.companySubscription.update({ where: { id: subscription.id }, data: { planId: plan.id } });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: "operator.billing.plan_changed",
        entityType: "subscription",
        entityId: subscription.id,
        payload: { from: subscription.plan.name, to: tier.name },
      },
      tx,
    );
  });
  await recomputeAndPersistCompanyPricing(workspace.id);
  return tier;
}

export async function setAddOn(operator: SignedInOperator, workspace: Workspace, bundleCode: string, on: boolean) {
  const bundle = FEATURE_BUNDLES.find((candidate) => candidate.code === bundleCode);
  if (!bundle) throw new AdminRefusal("That add-on is not in the catalogue.");
  // An add-on brings the add-ons it needs; turning one off leaves them, since
  // something else may need them too.
  const codes = on ? [bundle.code, ...(BUNDLE_DEPENDENCIES[bundle.code] ?? [])] : [bundle.code];
  const rows = await prisma.featureBundle.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  if (!rows.some((row) => row.code === bundle.code)) {
    throw new AdminRefusal(`${bundle.name} is not set up in this database yet. Run the catalogue sync.`);
  }
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const reason = row.code === bundle.code ? `Turned ${on ? "on" : "off"} by ${operator.name}` : `Needed by ${bundle.name}`;
      await tx.companySubscriptionAddon.upsert({
        where: { companyId_bundleId: { companyId: workspace.id, bundleId: row.id } },
        update: { isEnabled: on, reason },
        create: { companyId: workspace.id, bundleId: row.id, isEnabled: on, reason },
      });
    }
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: on ? "operator.billing.addon_on" : "operator.billing.addon_off",
        entityType: "addon",
        entityId: bundle.code,
        payload: { addOn: bundle.name },
      },
      tx,
    );
  });
  await recomputeAndPersistCompanyPricing(workspace.id);
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
  const expected = pricing.totalAmount * input.periodMonths;
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
      subscription: { select: { plan: { select: { name: true } } } },
    },
  });
}
