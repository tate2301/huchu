import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { breakCase, breakCaseInput, CaseBreakRefused } from "@/lib/retail/cases";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession, resolveRetailSite } from "../../../_helpers";

/**
 * Open cases into singles. `{id}` is the case's `Product.id`.
 *
 * A stock movement, so `retail.stock` `create` — what a stock clerk can do and
 * a cashier cannot.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }
  const gate = requireRetailPermission(session, "retail.stock", "create");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  try {
    const input = breakCaseInput.parse(await request.json());
    const { site, response: siteResponse } = await resolveRetailSite(session.user.companyId, input.siteId);
    if (siteResponse) return siteResponse;
    if (!site) return errorResponse("Invalid site", 400);

    const result = await breakCase({
      companyId: session.user.companyId,
      userId: session.user.id,
      caseProductId: path.data.id,
      siteId: site.id,
      cases: input.cases,
    });
    return successResponse({ data: result });
  } catch (error) {
    if (error instanceof CaseBreakRefused) return errorResponse(error.message, 409);
    if (error instanceof ZodError) return errorResponse("Say how many cases to open", 400);
    throw error;
  }
}
