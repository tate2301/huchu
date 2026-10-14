import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { changePlan, extendTrial, recordManualPayment, settlePayment } from "@/lib/admin/billing";
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

  it("moves the workspace to another plan from the catalogue", async () => {
    await changePlan(operator, workspace, "GROW");
    const subscription = await prisma.companySubscription.findFirstOrThrow({ where: { companyId: workspace.id }, include: { plan: true } });
    expect(subscription.plan.code).toBe("GROW");
    await expect(changePlan(operator, workspace, "NOT_A_TIER")).rejects.toThrow(/catalogue/);
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
    await expect(
      recordManualPayment(operator, workspace, { method: "Cash", reference: `CASH-${run}`, amount: 99_999, periodMonths: 1 }),
    ).rejects.toThrow(/Check the amount/);
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
