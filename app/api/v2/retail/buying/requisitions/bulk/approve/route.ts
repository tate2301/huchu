import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { bulkSchema, requisitionIssues } from "@/lib/retail/buying/requisition-input";
import { approveMany } from "@/lib/retail/buying/requisitions";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

import { requireRetailSession } from "../../../../_helpers";

/** Approve the ticked ones, each at the amount asked (ask `approvemany`); those this person cannot decide are skipped with why. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.requisitions", "approve")) return errorResponse("Your role cannot approve requisitions", 403);
  const parsed = bulkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fieldErrorResponse("Validation failed", requisitionIssues(parsed.error, false));
  try {
    const answer = await approveMany(buyingActor(session), parsed.data.ids, { requestUrl: request.url });
    const n = answer.approved.length;
    const message = `${n} ${n === 1 ? "requisition" : "requisitions"} approved.${answer.skipped.length ? ` ${answer.skipped.map((skip) => `${skip.requisitionNo}: ${skip.why}`).join(" ")}` : ""}`;
    return successResponse({ ...answer, message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/requisitions/bulk/approve");
  }
}
