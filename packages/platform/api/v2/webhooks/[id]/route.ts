import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { errorResponse, hasRole, successResponse, validateSession } from "../../../../api-utils";

/** Deactivating an endpoint. The row and its deliveries stay; pending deliveries are given up on their next claim. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const { id } = await context.params;
    const existing = await prisma.platformWebhookEndpoint.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, active: true },
    });
    if (!existing) return errorResponse("Webhook endpoint not found", 404);
    if (existing.active) {
      await prisma.platformWebhookEndpoint.update({ where: { id: existing.id }, data: { active: false } });
    }
    return successResponse({ data: { id: existing.id, active: false } });
  } catch (error) {
    console.error("[API] DELETE /api/v2/webhooks/[id] error:", error);
    return errorResponse("Failed to deactivate the webhook endpoint");
  }
}
