import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { defaultTemplateSchema } from "@/lib/documents/template-schema";

const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  sourceKey: z.string().min(1).max(120),
  documentType: z.enum([
    "REPORT_TABLE",
    "DASHBOARD_PACK",
    "SALES_INVOICE",
    "SALES_QUOTATION",
    "SALES_RECEIPT",
    "GENERIC_RECORD",
  ]),
  targetType: z.enum(["LIST", "RECORD", "DASHBOARD"]),
  cloneFromTemplateId: z.string().uuid().optional(),
  setDefault: z.boolean().optional(),
});

function canManageTemplates(role: string) {
  return role === "SUPERADMIN" || role === "MANAGER";
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const documentType = searchParams.get("documentType");
    const targetType = searchParams.get("targetType");
    const sourceKey = searchParams.get("sourceKey");

    const templates = await prisma.documentTemplate.findMany({
      where: {
        OR: [{ companyId: session.user.companyId }, { scope: "SYSTEM", companyId: null }],
        ...(documentType ? { documentType: documentType as never } : {}),
        ...(targetType ? { targetType: targetType as never } : {}),
        ...(sourceKey ? { sourceKey } : {}),
      },
      include: {
        versions: {
          orderBy: [{ version: "desc" }],
          take: 1,
          select: {
            id: true,
            version: true,
            isPublished: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ scope: "desc" }, { updatedAt: "desc" }],
    });

    return successResponse(templates);
  } catch (error) {
    console.error("[API] GET /api/document-templates error:", error);
    return errorResponse("Failed to fetch document templates", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canManageTemplates(session.user.role)) {
      return errorResponse("Only SUPERADMIN and MANAGER can manage templates", 403);
    }

    const body = await request.json();
    const input = createTemplateSchema.parse(body);

    const cloneSource = input.cloneFromTemplateId
      ? await prisma.documentTemplate.findUnique({
          where: { id: input.cloneFromTemplateId },
          include: {
            versions: {
              orderBy: [{ isPublished: "desc" }, { version: "desc" }],
              take: 1,
              select: { schemaJson: true },
            },
          },
        })
      : null;

    const schemaJson =
      cloneSource?.versions[0]?.schemaJson ?? JSON.stringify(defaultTemplateSchema);

    const created = await prisma.$transaction(async (tx) => {
      if (input.setDefault) {
        await tx.documentTemplate.updateMany({
          where: {
            companyId: session.user.companyId,
            sourceKey: input.sourceKey,
            documentType: input.documentType,
            targetType: input.targetType,
          },
          data: { isDefault: false },
        });
      }

      const template = await tx.documentTemplate.create({
        data: {
          companyId: session.user.companyId,
          scope: "COMPANY",
          name: input.name,
          description: input.description,
          sourceKey: input.sourceKey,
          documentType: input.documentType,
          targetType: input.targetType,
          isDefault: input.setDefault === true,
          isActive: true,
          createdById: session.user.id,
          updatedById: session.user.id,
        },
      });

      const version = await tx.documentTemplateVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          schemaJson,
          isPublished: true,
          publishedAt: new Date(),
          publishedById: session.user.id,
          createdById: session.user.id,
        },
      });

      return { template, version };
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/document-templates error:", error);
    return errorResponse("Failed to create document template", 500);
  }
}
