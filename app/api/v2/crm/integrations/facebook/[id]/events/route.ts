import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

import { requireCrmCapability } from "../../../../_helpers";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * The delivery ledger for one connection — the answer to "a lead came in on
 * Facebook, where is it".
 *
 * The raw payload and the fetched answers are deliberately not returned: they
 * are stored so a failed delivery can be retried and argued about, not so the
 * settings screen can print a customer's phone number a second time.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("Manager access required", 403);
    }

    const { id } = await params;
    const events = await prisma.crmFacebookLeadEvent.findMany({
      where: { connectionId: id, companyId: session.user.companyId },
      select: {
        id: true,
        leadgenId: true,
        formId: true,
        campaignId: true,
        status: true,
        leadId: true,
        error: true,
        processedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return successResponse({ data: events });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/integrations/facebook/[id]/events error:", error);
    return errorResponse("Failed to fetch deliveries");
  }
}
