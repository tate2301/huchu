import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { billingFacts, extendTrial, recordManualPayment, setSubscriptionStatus, settlePayment } from "@/lib/admin/billing";
import type { SignedInOperator } from "@/lib/operators/guards";
import { provisionTenant } from "@/lib/platform/provision";
import { prisma } from "@/lib/prisma";

const run = randomUUID().slice(0, 8);
let operator: SignedInOperator;
let workspace: { id: string; name: string };
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `bill-${run}@corelith.test`, name: "Rumbi", role: "BILLING" } });
  operator = { sessionId: "z", id: op.id, email: op.email, name: op.name, role: op.role };
  const result = await provisionTenant({
    name: `Billing ${run}`,
    slug: `billing-${run}`,
    tierCode: "START",
    adminEmail: `owner-${run}@x.test`,
    subscriptionStatus: "TRIALING",
    trialDays: 14,
  });
  workspace = { id: result.company.id, name: result.company.name };
});

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: workspace.id } });
  await prisma.subscriptionPayment.deleteMany({ where: { companyId: workspace.id } });
  await prisma.operator.deleteMany({ where: { id: operator.id } });
});

describe("billing a workspace", () => {
  it("extends a trial from its end, by the days chosen", async () => {
    const before = await prisma.companySubscription.findFirstOrThrow({ where: { companyId: workspace.id } });
    const until = await extendTrial(operator, workspace, 7);
    expect(until.getTime() - before.trialEndsAt!.getTime()).toBe(7 * DAY);
    await expect(extendTrial(operator, workspace, 5)).rejects.toThrow(/7, 14 or 30/);
  });

  it("prices the workspace by its verticals and members", async () => {
    // Set up as general business with its owner: one vertical, one member.
    const { pricing } = await billingFacts(workspace.id);
    expect(pricing).toMatchObject({ verticals: 1, members: 1, each: 39, total: 39, withOneMore: 78 });
    expect(pricing.lines).toEqual([{ vertical: "GENERAL", label: "General business", detail: "General business, 1 member", amount: 39 }]);
  });

  it("records money paid by hand once, and it extends the subscription", async () => {
    await recordManualPayment(operator, workspace, { method: "EcoCash", reference: `MP-${run}`, amount: 99, periodMonths: 1 });
    const subscription = await prisma.companySubscription.findFirstOrThrow({ where: { companyId: workspace.id } });
    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * DAY);
    await expect(
      recordManualPayment(operator, workspace, { method: "EcoCash", reference: `MP-${run}`, amount: 99, periodMonths: 1 }),
    ).rejects.toThrow(/counts once/);
  });

  it("refuses a hand-typed amount far beyond what the workspace pays", async () => {
    // $39 a month; three times that for one month is the most it takes.
    await expect(
      recordManualPayment(operator, workspace, { method: "Cash", reference: `CASH-${run}`, amount: 118, periodMonths: 1 }),
    ).rejects.toThrow("pays $39.00 for 1 month. Check the amount.");
  });

  it("sets the subscription's status by hand, with a reason, once", async () => {
    await expect(setSubscriptionStatus(operator, workspace, "CANCELED", " ")).rejects.toThrow(/Say why/);
    await setSubscriptionStatus(operator, workspace, "CANCELED", "Closed the shop, rang to cancel");
    const subscription = await prisma.companySubscription.findFirstOrThrow({ where: { companyId: workspace.id } });
    expect(subscription.status).toBe("CANCELED");
    expect(subscription.canceledAt).not.toBeNull();
    expect(subscription.endedAt).not.toBeNull();
    await expect(setSubscriptionStatus(operator, workspace, "CANCELED", "Again")).rejects.toThrow(/already/);
    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { companyId: workspace.id, eventType: "operator.billing.status_set" },
    });
    expect(event.payloadJson ?? "").toContain("Closed the shop");

    await setSubscriptionStatus(operator, workspace, "ACTIVE", "Changed their mind");
    const back = await prisma.companySubscription.findFirstOrThrow({ where: { companyId: workspace.id } });
    expect(back).toMatchObject({ status: "ACTIVE", canceledAt: null, endedAt: null });
  });

  it("settles a gateway payment nobody heard back about, once", async () => {
    const payment = await prisma.subscriptionPayment.create({
      data: {
        companyId: workspace.id,
        provider: "pesepay",
        providerReference: `pp-${run}`,
        amount: 99,
        periodMonths: 1,
        status: "PENDING",
        idempotencyKey: `test-${run}`,
      },
    });
    await expect(settlePayment(operator, payment.id, "FAILED", " ")).rejects.toThrow(/Say why/);
    await settlePayment(operator, payment.id, "FAILED", "Not on the statement after 48 hours");
    expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("FAILED");
    await expect(settlePayment(operator, payment.id, "PAID", "")).rejects.toThrow(/already settled/);
  });
});
