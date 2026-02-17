import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const companyId = session.user.companyId;
    const result = await ensureAccountingDefaults(companyId);

    return successResponse({
      accountsInitialized: result.createdAccounts > 0,
      taxInitialized: result.createdTaxCodes > 0,
      rulesInitialized: result.createdPostingRules > 0,
      createdAccounts: result.createdAccounts,
      createdTaxCodes: result.createdTaxCodes,
      createdPostingRules: result.createdPostingRules,
    });
  } catch (error) {
    console.error("[API] POST /api/accounting/setup error:", error);
    return errorResponse("Failed to initialize accounting setup");
  }
}
