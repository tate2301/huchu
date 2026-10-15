"use server";

import type { SubscriptionStatus } from "@prisma/client";

import { extendTrial, recordManualPayment, setSubscriptionStatus, settlePayment } from "@/lib/admin/billing";
import { SUBSCRIPTION_STATUS_LABEL } from "@/lib/admin/billing-words";
import { formatDate, formatMoney } from "@/lib/admin/format";
import { asResult, workspaceWrite } from "@/lib/admin/workspace-context";

/** Billing, bound to the page's workspace. Billing and owners only. */

export async function extendTrialBy(slug: string, days: number) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "billing.manage");
    const until = await extendTrial(operator, workspace, days);
    return `Trial extended to ${formatDate(until)}.`;
  });
}

export async function setStatusTo(slug: string, status: SubscriptionStatus, reason: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "billing.manage");
    await setSubscriptionStatus(operator, workspace, status, reason);
    return `${workspace.name}'s subscription is ${SUBSCRIPTION_STATUS_LABEL[status].toLowerCase()} now.`;
  });
}

export async function recordPaymentFor(
  slug: string,
  input: { method: string; reference: string; amount: number; periodMonths: number },
) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "billing.manage");
    await recordManualPayment(operator, workspace, input);
    return `${formatMoney(input.amount)} recorded as paid. The subscription is extended.`;
  });
}

export async function settlePaymentIn(slug: string, paymentId: string, verdict: "PAID" | "FAILED", reason: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "payment.review");
    await settlePayment(operator, paymentId, verdict, reason, workspace.id);
    return verdict === "PAID" ? "Confirmed as paid. The subscription is extended." : "Marked as failed.";
  });
}
