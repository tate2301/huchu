import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { insightsRepFilter } from "@/lib/crm/scope";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const periodKey = searchParams.get("periodKey");
    const status = searchParams.get("status");
    const requestedRep = searchParams.get("repId");

    // Reps only ever see their own entries regardless of the query param.
    const repScope = insightsRepFilter(session);
    const repId = repScope ?? requestedRep ?? undefined;

    const where: Prisma.CrmCommissionEntryWhereInput = {
      companyId: session.user.companyId,
      ...(periodKey ? { periodKey } : {}),
      ...(status ? { status: status as Prisma.CrmCommissionEntryWhereInput["status"] } : {}),
      ...(repId ? { repId } : {}),
    };

    const entries = await prisma.crmCommissionEntry.findMany({
      where,
      include: {
        rep: { select: { id: true, name: true } },
        lead: { select: { id: true, leadNo: true } },
      },
      orderBy: [{ periodKey: "desc" }, { calculatedAt: "desc" }],
      take: 1000,
    });

    // Totals are reported per currency — a single cross-currency sum would be
    // meaningless.
    const totalsByCurrency: Record<string, number> = {};
    for (const e of entries) {
      totalsByCurrency[e.currency] = Math.round(((totalsByCurrency[e.currency] ?? 0) + e.amount) * 100) / 100;
    }

    return successResponse({ data: entries, totalsByCurrency });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/commissions/entries error:", error);
    return errorResponse("Failed to fetch commission entries");
  }
}
