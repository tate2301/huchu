import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const companyId = session.user.companyId;

    const [
      accountCount,
      openPeriods,
      postedJournals,
      draftJournals,
      openInvoices,
      openBills,
    ] = await Promise.all([
      prisma.chartOfAccount.count({ where: { companyId } }),
      prisma.accountingPeriod.count({ where: { companyId, status: "OPEN" } }),
      prisma.journalEntry.count({ where: { companyId, status: "POSTED" } }),
      prisma.journalEntry.count({ where: { companyId, status: "DRAFT" } }),
      prisma.salesInvoice.count({ where: { companyId, status: { in: ["DRAFT", "ISSUED"] } } }),
      prisma.purchaseBill.count({ where: { companyId, status: { in: ["DRAFT", "RECEIVED"] } } }),
    ]);

    return successResponse({
      accounts: accountCount,
      openPeriods,
      postedJournals,
      draftJournals,
      openInvoices,
      openBills,
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/summary error:", error);
    return errorResponse("Failed to fetch accounting summary");
  }
}
