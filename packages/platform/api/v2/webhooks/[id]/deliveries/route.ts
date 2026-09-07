import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { errorResponse, hasRole, successResponse, validateSession } from "../../../../../api-utils";

/** The last fifty deliveries to one endpoint, newest first: what was sent, what came back, when it will be retried. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const { id } = await context.params;
    const endpoint = await prisma.platformWebhookEndpoint.findFirst({ where: { id, companyId: session.user.companyId }, select: { id: true } });
    if (!endpoint) return errorResponse("Webhook endpoint not found", 404);

    const deliveries = await prisma.platformWebhookDelivery.findMany({
      where: { endpointId: endpoint.id },
      select: {
        id: true,
        status: true,
        attemptCount: true,
        nextAttemptAt: true,
        lastStatusCode: true,
        lastError: true,
        deliveredAt: true,
        createdAt: true,
        event: { select: { id: true, type: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return successResponse({ data: deliveries });
  } catch (error) {
    console.error("[API] GET /api/v2/webhooks/[id]/deliveries error:", error);
    return errorResponse("Failed to fetch webhook deliveries");
  }
}
