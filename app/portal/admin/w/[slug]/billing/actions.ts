"use server";

import { changePlan, extendTrial, recordManualPayment, setAddOn, settlePayment } from "@/lib/admin/billing";
import { formatDate, formatMoney } from "@/lib/admin/format";
import { asResult, workspaceWrite } from "@/lib/admin/workspace-context";

/** Plan and billing, bound to the page's workspace. Billing and owners only. */

export async function extendTrialBy(slug: string, days: number) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "billing.manage");
    const until = await extendTrial(operator, workspace, days);
    return `Trial extended to ${formatDate(until)}.`;
  });
}

export async function changePlanTo(slug: string, tierCode: string) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "billing.manage");
    const tier = await changePlan(operator, workspace, tierCode);
    return `${workspace.name} is on ${tier.name} now.`;
  });
}

export async function turnAddOn(slug: string, bundleCode: string, on: boolean) {
  return asResult(async () => {
    const { operator, workspace } = await workspaceWrite(slug, "billing.manage");
    await setAddOn(operator, workspace, bundleCode, on);
    return on ? "Add-on turned on." : "Add-on turned off.";
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
