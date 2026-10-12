import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { markReceived } from "@/lib/retail/buying/deliveries";
import { bulkOrdersSchema, issuesToFields } from "@/lib/retail/buying/order-input";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { postRetailJournal, requireRetailSession } from "../../../../_helpers";

/** Orders' bulk "Mark received" (`markreceived`): everything still to come on each goes into stock as ordered, posted. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "approve");
  if (gate) return gate;
  const parsed = bulkOrdersSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", issuesToFields(parsed.error));
  try {
    const done = await markReceived(buyingActor(session), parsed.data.ids, (journal) => postRetailJournal(journal));
    const message = done.posted.length
      ? `${done.posted.map((row) => `${row.poNo} received as ${row.receiptNo}`).join(", ")}.${done.skipped.length ? ` ${done.skipped.map((row) => row.why).join(" ")}` : ""}`
      : done.skipped.map((row) => row.why).join(" ");
    return successResponse({ ...done, message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/orders/bulk/receive");
  }
}
