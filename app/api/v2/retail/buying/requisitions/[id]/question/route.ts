import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { questionSchema, requisitionIssues } from "@/lib/retail/buying/requisition-input";
import { loadRequisitionView } from "@/lib/retail/buying/requisition-view";
import { askQuestion } from "@/lib/retail/buying/requisitions";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

/** Ask the asker a question (5.21), or, as the asker, answer it. Stays on the requisition. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!(canRetailSessionDo(session, "retail.requisitions", "approve") || canRetailSessionDo(session, "retail.requisitions", "create"))) return errorResponse("Your role cannot ask about requisitions", 403);
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const parsed = questionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", requisitionIssues(parsed.error));

  const actor = buyingActor(session);
  try {
    const done = await askQuestion(actor, path.data.id, parsed.data, { requestUrl: request.url });
    const data = await loadRequisitionView(actor, path.data.id);
    return successResponse({ data, message: done.message });
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/requisitions/[id]/question");
  }
}
