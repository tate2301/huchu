import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { parseTemplateSchema } from "@/lib/documents/template-schema";

const createVersionSchema = z.object({
  schemaJson: z.string().min(2),
});

function canManageTemplates(role: string) {
  return role === "SUPERADMIN" || role === "MANAGER";
}

async function ensureTemplateAccess(templateId: string, companyId: string) {
  return prisma.documentTemplate.findFirst({
    where: {
      id: templateId,
      OR: [{ companyId }, { scope: "SYSTEM", companyId: null }],
    },
    select: { id: true, companyId: true, scope: true },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const params = await context.params;

    const template = await ensureTemplateAccess(params.id, session.user.companyId);
    if (!template) return errorResponse("Template not found", 404);

    const versions = await prisma.documentTemplateVersion.findMany({
      where: { templateId: params.id },
      orderBy: [{ version: "desc" }],
    });

    return successResponse(versions);
  } catch (error) {
    console.error("[API] GET /api/document-templates/[id]/versions error:", error);
    return errorResponse("Failed to fetch template versions", 500);
  }
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
      where: {
        id: params.id,
        companyId: session.user.companyId,
      },
      select: { id: true },
    });

    if (!template) {
      return errorResponse("Template not found or not editable", 404);
    }

    const body = await request.json();
    const input = createVersionSchema.parse(body);

    const parsed = parseTemplateSchema(input.schemaJson);
    const latest = await prisma.documentTemplateVersion.findFirst({
      where: { templateId: params.id },
      orderBy: [{ version: "desc" }],
      select: { version: true },
    });

    const created = await prisma.documentTemplateVersion.create({
      data: {
        templateId: params.id,
        version: (latest?.version ?? 0) + 1,
        schemaJson: JSON.stringify(parsed),
        isPublished: false,
        createdById: session.user.id,
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/document-templates/[id]/versions error:", error);
    return errorResponse("Failed to create template version", 500);
  }
}
