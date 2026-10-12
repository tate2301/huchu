import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { receiveDelivery } from "@/lib/retail/buying/deliveries";
import { receiveSchema } from "@/lib/retail/buying/delivery-input";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { postRetailJournal, requireRetailSession } from "../../_helpers";

/**
 * Receive a delivery (W-33): counted by anyone who receives; posted to stock
 * at once with `post: true` by an owner or manager (else 403 "Your role
 * cannot approve purchase orders", and the page sends it for checking).
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "receive");
  if (gate) return gate;
  const parsed = receiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
    return fieldErrorResponse("Validation failed", fields);
  }
  const input = parsed.data;
  try {
    const done = await receiveDelivery(
      buyingActor(session),
      {
        purchaseOrderId: input.purchaseOrderId ?? null,
        supplierId: input.supplierId ?? null,
        siteId: input.siteId ?? null,
        noteNumber: input.noteNumber ?? null,
        driver: input.driver ?? null,
        countedById: input.countedById ?? null,
        photo: input.photo ?? null,
        lines: input.lines,
        empties: input.empties ?? null,
        requisitionId: input.requisitionId ?? null,
        paying: input.paying?.mode ?? null,
        post: input.post,
        periodOverrideReason: input.periodOverrideReason ?? null,
      },
      (journal) => postRetailJournal(journal),
    );
    const { accountingStatus, accountingError, ...data } = done;
    return successResponse({ data, accountingStatus, accountingError }, 201);
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/deliveries");
  }
}
