import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { bulkRejectSchema, requisitionIssues } from "@/lib/retail/buying/requisition-input";
import { rejectMany } from "@/lib/retail/buying/requisitions";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

import { requireRetailSession } from "../../../../_helpers";

/** Reject the ticked ones with one reason and message (5.20 bulk); each asker is told. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.requisitions", "approve")) return errorResponse("Your role cannot approve requisitions", 403);
  const parsed = bulkRejectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fieldErrorResponse("Validation failed", requisitionIssues(parsed.error));
  try {
    const { ids, ...input } = parsed.data;
    const answer = await rejectMany(buyingActor(session), ids, input, { requestUrl: request.url });
    const n = answer.rejected.length;
    const message = `${n} ${n === 1 ? "requisition" : "requisitions"} rejected. Each asker has been told why.${answer.skipped.length ? ` ${answer.skipped.map((skip) => `${skip.requisitionNo}: ${skip.why}`).join(" ")}` : ""}`;
    return successResponse({ ...answer, message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/requisitions/bulk/reject");
  }
}
