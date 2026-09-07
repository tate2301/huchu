/**
 * SS-4 — what a settled payment does to a subscription, against a real Postgres.
 *
 * These tests need the database and deliberately so. The idempotency this
 * module claims is enforced by two unique indexes and one compare-and-set
 * `UPDATE`; a mocked client would prove the mock rather than the constraint,
 * and the constraint is the entire safety argument for taking money.
 *
 * No network is involved: nothing here builds a gateway adapter.
 *
 * Run: npx vitest run lib/payments/service
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@corelithzw/db/client";
import { addMonths, applyPaymentResult, recordPayment } from "@/lib/payments/service";
import { PAYMENT_STATUS, type PaymentStatus } from "@/lib/payments/types";

const suite = crypto.randomUUID().slice(0, 8);
/** Namespaced per run so concurrent suites cannot collide on the unique
 *  `(provider, providerReference)` index. */
const PROVIDER = `test-svc-${suite}`;

let companyId: string;
let planId: string;

async function newSubscription(args: {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELED";
  currentPeriodEnd?: Date | null;
  currentPeriodStart?: Date | null;
}) {
  return prisma.companySubscription.create({
    data: {
      companyId,
      planId,
      status: args.status,
      currentPeriodStart: args.currentPeriodStart ?? null,
      currentPeriodEnd: args.currentPeriodEnd ?? null,
    },
  });
}

async function newPayment(args: {
  subscriptionId?: string | null;
  periodMonths: number;
  status?: PaymentStatus;
  amount?: string;
}) {
  const reference = `ref-${crypto.randomUUID().slice(0, 12)}`;
  const { payment } = await recordPayment({
    companyId,
    subscriptionId: args.subscriptionId ?? null,
    provider: PROVIDER,
    providerReference: reference,
    amount: args.amount ?? "39.00",
    currency: "USD",
    periodMonths: args.periodMonths,
    idempotencyKey: `idem-${reference}`,
    status: args.status ?? PAYMENT_STATUS.PENDING,
  });
  return payment;
}

beforeAll(async () => {
  await prisma.$connect();
  const company = await prisma.company.create({
    data: { name: "SS-4 Payments Service Test Co", slug: `ss4-svc-${suite}` },
  });
  companyId = company.id;

  const plan = await prisma.subscriptionPlan.create({
    data: { code: `ss4-svc-${suite}`, name: "SS-4 Service Test Plan", monthlyPrice: 39 },
  });
  planId = plan.id;
});

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.subscriptionPayment.deleteMany({ where: { companyId } });
  await prisma.companySubscription.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.subscriptionPlan.delete({ where: { id: planId } });
  await prisma.$disconnect();
});

describe("recordPayment", () => {
  it("is idempotent on the idempotency key rather than charging twice", async () => {
    const key = `idem-dup-${suite}`;
    const first = await recordPayment({
      companyId,
      provider: PROVIDER,
      providerReference: `dup-${suite}`,
      amount: "199.00",
      currency: "USD",
      periodMonths: 1,
      idempotencyKey: key,
    });
    const second = await recordPayment({
      companyId,
      provider: PROVIDER,
      providerReference: `dup-${suite}`,
      amount: "199.00",
      currency: "USD",
      periodMonths: 1,
      idempotencyKey: key,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.payment.id).toBe(first.payment.id);

    const rows = await prisma.subscriptionPayment.count({
      where: { companyId, idempotencyKey: key },
    });
    expect(rows).toBe(1);
  });

  it("stores money at the cent, not as a float", async () => {
    const payment = await newPayment({ periodMonths: 1, amount: "8.575" });
    // Postgres numeric rounds half-up; a float would have produced 8.57.
    expect(payment.amount.toFixed(2)).toBe("8.58");
  });
});

describe("applyPaymentResult — PAID", () => {
  it("moves a trialing subscription to ACTIVE and extends the period by one month", async () => {
    const now = new Date("2026-03-15T10:00:00.000Z");
    const subscription = await newSubscription({ status: "TRIALING" });
    const payment = await newPayment({ subscriptionId: subscription.id, periodMonths: 1 });

    const result = await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.PAID,
      now,
    });

    expect(result.applied).toBe(true);
    expect(result.outcome).toBe("APPLIED");

    const after = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(after.status).toBe("ACTIVE");
    expect(after.currentPeriodEnd?.toISOString()).toBe("2026-04-15T10:00:00.000Z");
    expect(after.currentPeriodStart?.toISOString()).toBe(now.toISOString());
    // The gateway handle is stamped where the rest of the platform looks for it.
    expect(after.externalSubscriptionId).toBe(`${PROVIDER}:${payment.providerReference}`);

    const paid = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(paid.status).toBe(PAYMENT_STATUS.PAID);
    expect(paid.paidAt?.toISOString()).toBe(now.toISOString());
  });

  it("extends an annual payment by twelve months, not one", async () => {
    const now = new Date("2026-03-15T10:00:00.000Z");
    const subscription = await newSubscription({ status: "TRIALING" });
    const payment = await newPayment({
      subscriptionId: subscription.id,
      periodMonths: 12,
      amount: "1910.40",
    });

    await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.PAID,
      now,
    });

    const after = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(after.currentPeriodEnd?.toISOString()).toBe("2027-03-15T10:00:00.000Z");
    expect(after.status).toBe("ACTIVE");
  });

  it("renewing early adds to the period already paid for instead of truncating it", async () => {
    const now = new Date("2026-03-15T10:00:00.000Z");
    const periodEnd = new Date("2026-04-01T00:00:00.000Z");
    const subscription = await newSubscription({
      status: "ACTIVE",
      currentPeriodStart: new Date("2026-03-01T00:00:00.000Z"),
      currentPeriodEnd: periodEnd,
    });
    const payment = await newPayment({ subscriptionId: subscription.id, periodMonths: 1 });

    await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.PAID,
      now,
    });

    const after = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(after.currentPeriodEnd?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("revives a PAST_DUE subscription", async () => {
    const subscription = await newSubscription({
      status: "PAST_DUE",
      currentPeriodEnd: new Date("2026-01-01T00:00:00.000Z"),
    });
    const payment = await newPayment({ subscriptionId: subscription.id, periodMonths: 1 });

    await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.PAID,
      now: new Date("2026-03-15T10:00:00.000Z"),
    });

    const after = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(after.status).toBe("ACTIVE");
    // Lapsed, so the new period starts now rather than backdating to a window
    // the tenant spent locked out.
    expect(after.currentPeriodEnd?.toISOString()).toBe("2026-04-15T10:00:00.000Z");
  });

  it("does not resurrect a CANCELED subscription, but still records the money", async () => {
    const subscription = await newSubscription({ status: "CANCELED" });
    const payment = await newPayment({ subscriptionId: subscription.id, periodMonths: 1 });

    const result = await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.PAID,
      now: new Date("2026-03-15T10:00:00.000Z"),
    });

    expect(result.applied).toBe(true);
    const after = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(after.status).toBe("CANCELED");
    const paid = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(paid.status).toBe(PAYMENT_STATUS.PAID);
  });

  it("writes a platform audit event for the subscription transition", async () => {
    const subscription = await newSubscription({ status: "TRIALING" });
    const payment = await newPayment({ subscriptionId: subscription.id, periodMonths: 3 });

    await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.PAID,
      now: new Date("2026-03-15T10:00:00.000Z"),
    });

    const event = await prisma.platformAuditEvent.findFirst({
      where: { companyId, eventType: "billing.subscription.paid", entityId: subscription.id },
    });
    expect(event).not.toBeNull();
    expect(event?.eventHash).toBeTruthy();
    const payload = JSON.parse(event?.payloadJson ?? "{}") as Record<string, unknown>;
    expect(payload.periodMonths).toBe(3);
    expect(payload.previousStatus).toBe("TRIALING");
  });
});

describe("applyPaymentResult — idempotency and ordering", () => {
  it("re-applying the same verdict changes nothing", async () => {
    const now = new Date("2026-03-15T10:00:00.000Z");
    const subscription = await newSubscription({ status: "TRIALING" });
    const payment = await newPayment({ subscriptionId: subscription.id, periodMonths: 1 });

    await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.PAID,
      now,
    });
    const afterFirst = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });

    const second = await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.PAID,
      now,
    });

    expect(second.applied).toBe(false);
    expect(second.outcome).toBe("ALREADY_APPLIED");
    const afterSecond = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(afterSecond.currentPeriodEnd?.toISOString()).toBe(
      afterFirst.currentPeriodEnd?.toISOString(),
    );
  });

  it("a stale PENDING arriving after PAID does not un-pay the payment", async () => {
    const now = new Date("2026-03-15T10:00:00.000Z");
    const subscription = await newSubscription({ status: "TRIALING" });
    const payment = await newPayment({ subscriptionId: subscription.id, periodMonths: 1 });

    await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.PAID,
      now,
    });

    const stale = await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.PENDING,
      now,
    });

    expect(stale.applied).toBe(false);
    expect(stale.outcome).toBe("TERMINAL");
    const after = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.status).toBe(PAYMENT_STATUS.PAID);
  });

  it("two simultaneous PAID verdicts extend the period exactly once", async () => {
    const now = new Date("2026-03-15T10:00:00.000Z");
    const subscription = await newSubscription({ status: "TRIALING" });
    const payment = await newPayment({ subscriptionId: subscription.id, periodMonths: 1 });

    const results = await Promise.all([
      applyPaymentResult({
        provider: PROVIDER,
        providerReference: payment.providerReference,
        status: PAYMENT_STATUS.PAID,
        now,
      }),
      applyPaymentResult({
        provider: PROVIDER,
        providerReference: payment.providerReference,
        status: PAYMENT_STATUS.PAID,
        now,
      }),
    ]);

    expect(results.filter((r) => r.applied)).toHaveLength(1);
    const after = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(after.currentPeriodEnd?.toISOString()).toBe("2026-04-15T10:00:00.000Z");
  });

  it("a verdict for a reference we never issued is a no-op, not a crash", async () => {
    const result = await applyPaymentResult({
      provider: PROVIDER,
      providerReference: `never-issued-${suite}`,
      status: PAYMENT_STATUS.PAID,
    });
    expect(result.applied).toBe(false);
    expect(result.outcome).toBe("UNKNOWN_PAYMENT");
  });

  it("a FAILED verdict records the reason and leaves the subscription alone", async () => {
    const subscription = await newSubscription({ status: "TRIALING" });
    const payment = await newPayment({ subscriptionId: subscription.id, periodMonths: 1 });

    const result = await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.FAILED,
      failureReason: "Insufficient funds",
    });

    expect(result.outcome).toBe("APPLIED");
    const after = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.status).toBe(PAYMENT_STATUS.FAILED);
    expect(after.failureReason).toBe("Insufficient funds");

    const subscriptionAfter = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(subscriptionAfter.status).toBe("TRIALING");
    expect(subscriptionAfter.currentPeriodEnd).toBeNull();
  });

  it("falls back to the company's latest subscription when the payment names none", async () => {
    const now = new Date("2026-03-15T10:00:00.000Z");
    const subscription = await newSubscription({ status: "TRIALING" });
    const payment = await newPayment({ subscriptionId: null, periodMonths: 1 });

    const result = await applyPaymentResult({
      provider: PROVIDER,
      providerReference: payment.providerReference,
      status: PAYMENT_STATUS.PAID,
      now,
    });

    expect(result.outcome).toBe("APPLIED");
    // The most recently touched subscription is the one the money was for.
    expect(result.subscriptionId).toBe(subscription.id);
  });
});

describe("addMonths", () => {
  it("clamps to the end of a shorter month instead of rolling over", () => {
    expect(addMonths(new Date("2026-01-31T09:00:00.000Z"), 1).toISOString()).toBe(
      "2026-02-28T09:00:00.000Z",
    );
    expect(addMonths(new Date("2024-01-31T09:00:00.000Z"), 1).toISOString()).toBe(
      "2024-02-29T09:00:00.000Z",
    );
  });

  it("keeps the day of month across a year", () => {
    expect(addMonths(new Date("2026-02-28T09:00:00.000Z"), 12).toISOString()).toBe(
      "2027-02-28T09:00:00.000Z",
    );
  });
});
