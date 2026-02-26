import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const publishSchema = z.object({
  versionId: z.string().uuid(),
});

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
      select: { id: true },
    });
    if (!template) return errorResponse("Template not found or not editable", 404);

    const body = await request.json();
    const input = publishSchema.parse(body);

    const version = await prisma.documentTemplateVersion.findFirst({
      where: {
        id: input.versionId,
        templateId: params.id,
      },
      select: { id: true },
    });
    if (!version) return errorResponse("Version not found", 404);

    await prisma.$transaction(async (tx) => {
      await tx.documentTemplateVersion.updateMany({
        where: { templateId: params.id },
        data: { isPublished: false },
      });
      await tx.documentTemplateVersion.update({
        where: { id: input.versionId },
        data: {
          isPublished: true,
          publishedAt: new Date(),
          publishedById: session.user.id,
        },
      });
      await tx.documentTemplate.update({
        where: { id: params.id },
        data: {
          updatedById: session.user.id,
          updatedAt: new Date(),
        },
      });
    });

    return successResponse({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/document-templates/[id]/publish error:", error);
    return errorResponse("Failed to publish template version", 500);
  }
}
