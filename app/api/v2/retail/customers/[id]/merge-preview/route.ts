import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { mergePreview } from "@/lib/retail/customers/merge";
import { customerFailure } from "@/lib/retail/customers/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../_helpers";

/**
 * What merging `?duplicateId=` into this customer comes to (CUS-05): both
 * ledgers' points, both customers' visits in 12 months, the two numbers and
 * anything that stops it. Same rights as the merge.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.customers", "update") ?? requireRetailPermission(session, "retail.customers", "delete");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const duplicateId = request.nextUrl.searchParams.get("duplicateId") ?? "";
  try {
    return successResponse({ data: await mergePreview(session.user.companyId, path.data.id, duplicateId) });
  } catch (error) {
    return customerFailure(error, "GET /api/v2/retail/customers/[id]/merge-preview");
  }
}
