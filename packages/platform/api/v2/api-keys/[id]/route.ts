import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { errorResponse, hasRole, successResponse, validateSession } from "../../../../api-utils";

/** Revoking a key. The row stays, with its last use, so the audit reads whole. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const { id } = await context.params;
    const existing = await prisma.platformApiKey.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, revokedAt: true },
    });
    if (!existing) return errorResponse("API key not found", 404);
    if (!existing.revokedAt) {
      await prisma.platformApiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    }
    return successResponse({ data: { id: existing.id, revoked: true } });
  } catch (error) {
    console.error("[API] DELETE /api/v2/api-keys/[id] error:", error);
    return errorResponse("Failed to revoke the API key");
  }
}
