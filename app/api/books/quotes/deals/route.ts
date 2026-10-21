import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import type { QuoteDeal } from "@/lib/books/quotes-view";
import { canUser, recordEditor } from "@/lib/crm/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Books → Quotes → New quote: the open deals with a company this person may
 * quote on, newest first. A quote is written from a deal, because its lines
 * come from the deal's measurements; the quote route refuses the rest.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await canUser(session, "documents.issue"))) return successResponse({ deals: [] as QuoteDeal[] });
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    const mayEdit = await recordEditor(session);
    const rows = await prisma.crmDeal.findMany({
      where: {
        companyId: session.user.companyId,
        status: "OPEN",
        clientId: { not: null },
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { dealNo: { contains: q, mode: "insensitive" } }, { client: { name: { contains: q, mode: "insensitive" } } }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, dealNo: true, title: true, value: true, currency: true, assignedToId: true, client: { select: { name: true } } },
    });
    const deals: QuoteDeal[] = rows
      .filter((row) => mayEdit(row.assignedToId))
      .slice(0, 50)
      .map((row) => ({ id: row.id, dealNo: row.dealNo, title: row.title, client: row.client?.name ?? "", value: row.value, currency: row.currency }));
    return successResponse({ deals });
  } catch (error) {
    console.error("[API] GET /api/books/quotes/deals error:", error);
    return errorResponse("Could not read the deals");
  }
}
