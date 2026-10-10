import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { testFiscalDevice } from "@/lib/retail/fiscal-settings";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * "Test a receipt" on Setup › Fiscal device (W-06): a zero-value receipt
 * signed with the device's key on the server — nothing submitted, no number
 * used — and FDMS asked for the device's status. `{ ok, message, ms }`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.fiscal", "update");
  if (gate) return gate;

  try {
    return successResponse(await testFiscalDevice(session.user.companyId));
  } catch (error) {
    console.error("[API] POST /api/v2/retail/fiscal/test error:", error);
    return errorResponse("The test did not run. Try again.");
  }
}
