import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { isRetailSession, requireRetailPermission } from "@/lib/retail/permissions";

// GET /api/accounting/tender-mappings
// Lists all tender account mappings for the company
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    // In a shop, which account each tender posts to is the Posting to the
    // books row: the manager does not reach the books. Other products keep it.
    if (isRetailSession(session)) {
      const refused = requireRetailPermission(session, "retail.posting", "view");
      if (refused) return refused;
    }
    const companyId = session.user.companyId;

    const mappings = await prisma.tenderAccountMapping.findMany({
      where: { companyId },
      include: {
        clearingAccount: { select: { code: true, name: true } },
        offsetAccount: { select: { code: true, name: true } },
      },
      orderBy: [{ tenderType: "asc" }, { priority: "asc" }],
    });

    return successResponse(mappings);
  } catch (error) {
    console.error("[API] GET /api/accounting/tender-mappings error:", error);
    return errorResponse("Failed to fetch tender mappings", 500);
  }
}
