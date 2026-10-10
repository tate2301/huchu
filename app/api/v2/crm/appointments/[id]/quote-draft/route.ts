/**
 * The quote a site visit's saved answers draft, for a new quotation to start
 * from. Read-only: nothing is written until the quotation itself is saved.
 */
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { draftVisitQuote } from "@/lib/crm/site-visits/visit-quote";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { companyId } = sessionResult.session.user;
    const { id } = await params;

    const visit = await prisma.crmAppointment.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!visit) return errorResponse("Site visit not found", 404);

    return successResponse(await prisma.$transaction((tx) => draftVisitQuote(tx, companyId, id)));
  } catch (error) {
    console.error("[API] GET /api/v2/crm/appointments/[id]/quote-draft error:", error);
    return errorResponse("Failed to draft the quote");
  }
}
