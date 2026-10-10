import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { rolesView } from "@/lib/retail/roles-matrix";
import { requireRetailSession } from "../_helpers";

/**
 * "Who can do what" (80-admin 5.4): the matrix the server enforces, with its
 * limit sentences read live from Approvals. `retail.people:view`.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "view");
  if (gate) return gate;
  return successResponse(rolesView(await getApprovalLimits(session.user.companyId)));
}
