import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getAccountingSetupReadiness } from "@/lib/accounting/bootstrap";
import { canOnSharedRoute } from "@/lib/retail/permissions";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const readiness = await getAccountingSetupReadiness(session.user.companyId);
    return successResponse({
      ...readiness,
      // The seed pack's own door (`seed-pack/route.ts`), so the page offers
      // "Set up the accounts" only to whoever it will run for.
      canSetUp: canOnSharedRoute(session, "retail.posting", "update", ["SUPERADMIN", "MANAGER"]),
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/setup/readiness error:", error);
    return errorResponse("Failed to load accounting setup readiness");
  }
}
