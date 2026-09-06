import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@corelithzw/db";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canUser, denialMessage } from "../../../../../permissions";
import { TEMPLATE_KINDS, templateProblems, templateSchema } from "@corelithzw/module-documents/blocks";

const patchSchema = templateSchema.partial();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await context.params;

    const template = await prisma.crmTemplate.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        createdBy: { select: { id: true, name: true } },
        events: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true, type: true, source: true, createdAt: true },
        },
      },
    });

    if (!template) return errorResponse("Template not found", 404);
    if (!template.isShared && template.createdById !== session.user.id) {
      return errorResponse("This template is somebody else's draft.", 403);
    }

    return successResponse(template);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/templates/[id] error:", error);
    return errorResponse("Failed to load the template");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!(await canUser(session, "settings.manage"))) {
      return errorResponse(denialMessage("settings.manage"), 403);
    }

    const { id } = await context.params;
    const existing = await prisma.crmTemplate.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, kind: true },
    });
    if (!existing) return errorResponse("Template not found", 404);

    const data = patchSchema.parse(await request.json());

    const kind = data.kind ?? (existing.kind as (typeof TEMPLATE_KINDS)[number]);
    if (data.blocks) {
      const problems = templateProblems(kind, data.blocks);
      if (problems.length > 0) {
        return errorResponse("This template is not ready to save", 400, problems);
      }
    }

    const template = await prisma.crmTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.kind !== undefined ? { kind: data.kind } : {}),
        ...(data.attributes !== undefined
          ? { attributes: data.attributes as unknown as Prisma.InputJsonValue }
          : {}),
        ...(data.blocks !== undefined
          ? { blocks: data.blocks as unknown as Prisma.InputJsonValue }
          : {}),
        ...(data.isShared !== undefined ? { isShared: data.isShared } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.linkedEntity !== undefined ? { linkedEntity: data.linkedEntity } : {}),
        ...(data.linkedRecordId !== undefined
          ? { linkedRecordId: data.linkedRecordId }
          : {}),
      },
    });

    return successResponse(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/crm/templates/[id] error:", error);
    return errorResponse("Failed to save the template");
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!(await canUser(session, "settings.manage"))) {
      return errorResponse(denialMessage("settings.manage"), 403);
    }

    const { id } = await context.params;
    const existing = await prisma.crmTemplate.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Template not found", 404);

    await prisma.crmTemplate.delete({ where: { id } });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/templates/[id] error:", error);
    return errorResponse("Failed to delete the template");
  }
}
