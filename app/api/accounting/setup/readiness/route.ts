import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getAccountingSetupReadiness } from "@/lib/accounting/bootstrap";
import { canOnSharedRoute, isRetailSession, requireRetailPermission } from "@/lib/retail/permissions";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // A shop's Posting to the books row: the owner and the bookkeeper read it,
    // the manager does not reach the books. Other products keep the route open.
    if (isRetailSession(session)) {
      const refused = requireRetailPermission(session, "retail.posting", "view");
      if (refused) return refused;
    }

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
