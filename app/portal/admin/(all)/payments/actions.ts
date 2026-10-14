"use server";

import { settlePayment } from "@/lib/admin/billing";
import { asResult } from "@/lib/admin/workspace-context";
import { requireOperatorFor } from "@/lib/operators/guards";

/**
 * Settling a payment from the all-workspaces list. Each payment belongs to one
 * workspace, and the confirmation names it; the payment says which.
 */
export async function settleAnyPayment(paymentId: string, verdict: "PAID" | "FAILED", reason: string) {
  return asResult(async () => {
    const operator = await requireOperatorFor("payment.review");
    await settlePayment(operator, paymentId, verdict, reason);
    return verdict === "PAID" ? "Confirmed as paid. The subscription is extended." : "Marked as failed.";
  });
}
