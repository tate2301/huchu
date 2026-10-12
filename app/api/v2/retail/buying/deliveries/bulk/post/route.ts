import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { postCountedDeliveries } from "@/lib/retail/buying/deliveries";
import { bulkDeliveriesSchema } from "@/lib/retail/buying/delivery-input";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { postRetailJournal, requireRetailSession } from "../../../../_helpers";

/** Deliveries' bulk "Post to stock" (`postdeliveries`): each counted one posted; the rest skipped and said. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.purchasing", "approve");
  if (gate) return gate;
  const parsed = bulkDeliveriesSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", { ids: parsed.error.issues[0]?.message ?? "Tick at least one delivery." });
  try {
    const done = await postCountedDeliveries(buyingActor(session), parsed.data.ids, (journal) => postRetailJournal(journal));
    const units = done.posted.reduce((sum, row) => sum + row.units, 0);
    const message = done.posted.length
      ? `${done.posted.length} ${done.posted.length === 1 ? "delivery" : "deliveries"} posted. ${units} ${units === 1 ? "unit" : "units"} in stock.${done.skipped.length ? ` ${done.skipped.map((row) => row.why).join(" ")}` : ""}`
      : done.skipped.map((row) => row.why).join(" ");
    return successResponse({ ...done, message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/deliveries/bulk/post");
  }
}
