import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { requireCrmCapability } from "../../_helpers";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "settings.manage")) return errorResponse("Manager access required", 403);
    const { id } = await params;

    const existing = await prisma.crmApiKey.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("API key not found", 404);

    await prisma.crmApiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    return successResponse({ id, revoked: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/api-keys/[id] error:", error);
    return errorResponse("Failed to revoke API key");
  }
}
