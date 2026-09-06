/**
 * SS-4 — the webhook pipeline, against a real Postgres.
 *
 * The replay guard is a unique index, so it is tested against the index. The
 * gateway is a stub adapter registered under a suite-local key: the point of
 * the seam is that the pipeline does not know or care which gateway it is
 * talking to, and a test that needed a Paynow integration key to run would be
 * testing Paynow rather than the pipeline.
 *
 * No network is involved.
 *
 * Run: npx vitest run lib/payments/webhook
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@corelithzw/db/client";
import { recordPayment } from "@/lib/payments/service";
import { registerPaymentAdapter, unregisterPaymentAdapter } from "@/lib/payments/registry";
import { handlePaymentWebhook } from "@/lib/payments/webhook";
import {
  PAYMENT_STATUS,
  headerValue,
  type PaymentProviderAdapter,
  type PaymentStatus,
  type VerifyWebhookResult,
} from "@/lib/payments/types";

const suite = crypto.randomUUID().slice(0, 8);
const PROVIDER = `test-hook-${suite}`;
const SIGNATURE_HEADER = "x-test-signature";
const GOOD_SIGNATURE = `sig-${suite}`;

let companyId: string;
let planId: string;

/**
 * A gateway that exists only here. Its "signature" is a shared constant — that
 * is enough, because what these tests exercise is what the pipeline does with a
 * verdict of ok/not-ok, not how any particular gateway reaches one. The real
 * signature schemes are pinned in `adapters.test.ts`.
 */
const stubAdapter: PaymentProviderAdapter = {
  key: PROVIDER,
  async initiatePayment() {
    throw new Error("The stub adapter does not initiate payments.");
  },
  verifyWebhook(rawBody, headers): VerifyWebhookResult {
    const body = JSON.parse(rawBody) as {
      eventId?: string;
      reference?: string;
      status?: string;
      amount?: string;
    };
    const supplied = headerValue(headers, SIGNATURE_HEADER);
    if (supplied !== GOOD_SIGNATURE) {
      return {
        ok: false,
        providerEventId: null,
        providerReference: body.reference ?? null,
        status: null,
        amount: null,
        reason: "Stub signature mismatch.",
      };
    }
    return {
      ok: true,
      providerEventId: body.eventId ?? null,
      providerReference: body.reference ?? null,
      status: (body.status as PaymentStatus) ?? null,
      amount: body.amount ?? null,
    };
  },
  async pollStatus() {
    return PAYMENT_STATUS.PENDING;
  },
};

function deliver(args: {
  eventId: string;
  reference: string;
  status: PaymentStatus;
  amount?: string;
  signature?: string;
}) {
  return handlePaymentWebhook({
    provider: PROVIDER,
    rawBody: JSON.stringify({
      eventId: args.eventId,
      reference: args.reference,
      status: args.status,
      amount: args.amount ?? "39.00",
    }),
    headers: { [SIGNATURE_HEADER]: args.signature ?? GOOD_SIGNATURE },
  });
}

async function newSubscriptionAndPayment(periodMonths = 1) {
  const subscription = await prisma.companySubscription.create({
    data: { companyId, planId, status: "TRIALING" },
  });
  const reference = `ref-${crypto.randomUUID().slice(0, 12)}`;
  const { payment } = await recordPayment({
    companyId,
    subscriptionId: subscription.id,
    provider: PROVIDER,
    providerReference: reference,
    amount: "39.00",
    currency: "USD",
    periodMonths,
    idempotencyKey: `idem-${reference}`,
    status: PAYMENT_STATUS.PENDING,
  });
  return { subscription, payment, reference };
}

beforeAll(async () => {
  await prisma.$connect();
  registerPaymentAdapter(stubAdapter);

  const company = await prisma.company.create({
    data: { name: "SS-4 Payments Webhook Test Co", slug: `ss4-hook-${suite}` },
  });
  companyId = company.id;

  const plan = await prisma.subscriptionPlan.create({
    data: { code: `ss4-hook-${suite}`, name: "SS-4 Webhook Test Plan", monthlyPrice: 39 },
  });
  planId = plan.id;
});

afterAll(async () => {
  unregisterPaymentAdapter(PROVIDER);
  await prisma.paymentWebhookEvent.deleteMany({ where: { provider: PROVIDER } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.subscriptionPayment.deleteMany({ where: { companyId } });
  await prisma.companySubscription.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.subscriptionPlan.delete({ where: { id: planId } });
  await prisma.$disconnect();
});

describe("handlePaymentWebhook", () => {
  it("applies a PAID delivery and moves the subscription", async () => {
    const { subscription, reference } = await newSubscriptionAndPayment();

    const result = await deliver({
      eventId: `evt-paid-${suite}`,
      reference,
      status: PAYMENT_STATUS.PAID,
    });

    expect(result.httpStatus).toBe(200);
    expect(result.outcome).toBe("APPLIED");

    const after = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(after.status).toBe("ACTIVE");
    expect(after.currentPeriodEnd).not.toBeNull();

    const event = await prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: {
        provider_providerEventId: { provider: PROVIDER, providerEventId: `evt-paid-${suite}` },
      },
    });
    expect(event.signatureVerified).toBe(true);
    expect(event.processedAt).not.toBeNull();
    expect(event.error).toBeNull();
  });

  it("a replayed delivery is an observable no-op", async () => {
    const { subscription, reference } = await newSubscriptionAndPayment();
    const eventId = `evt-replay-${suite}`;

    const first = await deliver({ eventId, reference, status: PAYMENT_STATUS.PAID });
    expect(first.outcome).toBe("APPLIED");

    const afterFirst = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });

    const replay = await deliver({ eventId, reference, status: PAYMENT_STATUS.PAID });

    // 200, because a gateway told anything else retries forever over a message
    // we already understood.
    expect(replay.httpStatus).toBe(200);
    expect(replay.outcome).toBe("DUPLICATE");

    const afterReplay = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    // The period did not move a second time — the whole point.
    expect(afterReplay.currentPeriodEnd?.toISOString()).toBe(
      afterFirst.currentPeriodEnd?.toISOString(),
    );
    expect(afterReplay.updatedAt.toISOString()).toBe(afterFirst.updatedAt.toISOString());

    const events = await prisma.paymentWebhookEvent.count({
      where: { provider: PROVIDER, providerEventId: eventId },
    });
    expect(events).toBe(1);
  });

  it("a second delivery of the same verdict under a new event id still does not double-apply", async () => {
    const { subscription, reference } = await newSubscriptionAndPayment();

    await deliver({ eventId: `evt-a-${suite}`, reference, status: PAYMENT_STATUS.PAID });
    const afterFirst = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });

    // Gateways do re-notify under fresh ids; the payment's own status is the
    // second line of defence behind the event table.
    const second = await deliver({ eventId: `evt-b-${suite}`, reference, status: PAYMENT_STATUS.PAID });
    expect(second.httpStatus).toBe(200);
    expect(second.outcome).toBe("ALREADY_APPLIED");

    const afterSecond = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(afterSecond.currentPeriodEnd?.toISOString()).toBe(
      afterFirst.currentPeriodEnd?.toISOString(),
    );
  });

  it("an annual delivery extends twelve months, not one", async () => {
    const { subscription, reference } = await newSubscriptionAndPayment(12);
    const before = new Date();

    await deliver({
      eventId: `evt-annual-${suite}`,
      reference,
      status: PAYMENT_STATUS.PAID,
      amount: "1910.40",
    });

    const after = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    const months =
      (after.currentPeriodEnd!.getUTCFullYear() - before.getUTCFullYear()) * 12 +
      (after.currentPeriodEnd!.getUTCMonth() - before.getUTCMonth());
    expect(months).toBe(12);
  });

  it("an unverified signature is rejected and recorded", async () => {
    const { subscription, reference, payment } = await newSubscriptionAndPayment();

    const result = await deliver({
      eventId: `evt-forged-${suite}`,
      reference,
      status: PAYMENT_STATUS.PAID,
      signature: "not-the-signature",
    });

    expect(result.httpStatus).toBe(401);
    expect(result.outcome).toBe("UNVERIFIED");

    // Recorded, not dropped: a run of these is how a key rotation becomes
    // visible instead of looking like payments that never arrived.
    const events = await prisma.paymentWebhookEvent.findMany({
      where: { provider: PROVIDER, signatureVerified: false },
    });
    expect(events).toHaveLength(1);
    expect(events[0].error).toContain("Stub signature mismatch");
    expect(events[0].processedAt).not.toBeNull();
    expect(events[0].payloadJson).toContain(reference);

    const paymentAfter = await prisma.subscriptionPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(paymentAfter.status).toBe(PAYMENT_STATUS.PENDING);
    const subscriptionAfter = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(subscriptionAfter.status).toBe("TRIALING");
    expect(subscriptionAfter.currentPeriodEnd).toBeNull();
  });

  it("a verified delivery for an unknown reference is answered 200 and left alone", async () => {
    const result = await deliver({
      eventId: `evt-orphan-${suite}`,
      reference: `never-issued-${suite}`,
      status: PAYMENT_STATUS.PAID,
    });

    expect(result.httpStatus).toBe(200);
    expect(result.outcome).toBe("UNKNOWN_PAYMENT");

    const event = await prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: {
        provider_providerEventId: { provider: PROVIDER, providerEventId: `evt-orphan-${suite}` },
      },
    });
    expect(event.error).toBe("UNKNOWN_PAYMENT");
  });

  it("a provider nobody implements is a 404 and records nothing", async () => {
    const before = await prisma.paymentWebhookEvent.count();
    const result = await handlePaymentWebhook({
      provider: `no-such-gateway-${suite}`,
      rawBody: "{}",
      headers: {},
    });

    expect(result.httpStatus).toBe(404);
    expect(result.outcome).toBe("UNKNOWN_PROVIDER");
    expect(await prisma.paymentWebhookEvent.count()).toBe(before);
  });
});
