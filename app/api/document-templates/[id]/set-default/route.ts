import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

function canManageTemplates(role: string) {
  return role === "SUPERADMIN" || role === "MANAGER";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const params = await context.params;

    if (!canManageTemplates(session.user.role)) {
      return errorResponse("Only SUPERADMIN and MANAGER can manage templates", 403);
    }

    const template = await prisma.documentTemplate.findFirst({
      where: { id: params.id, companyId: session.user.companyId },
      select: {
        id: true,
        sourceKey: true,
        documentType: true,
        targetType: true,
      },
    });

    if (!template) {
      return errorResponse("Template not found or not editable", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.documentTemplate.updateMany({
        where: {
          companyId: session.user.companyId,
          sourceKey: template.sourceKey,
          documentType: template.documentType,
          targetType: template.targetType,
        },
        data: { isDefault: false },
      });

      await tx.documentTemplate.update({
        where: { id: template.id },
        data: {
          isDefault: true,
          updatedById: session.user.id,
          updatedAt: new Date(),
        },
      });
    });

    return successResponse({ ok: true });
  } catch (error) {
    console.error("[API] POST /api/document-templates/[id]/set-default error:", error);
    return errorResponse("Failed to set default template", 500);
  }
}
