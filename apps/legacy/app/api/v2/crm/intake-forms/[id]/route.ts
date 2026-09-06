import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  crmIntakeFieldsSchema,
  crmIntakeFormConfigSchema,
  crmIntakeServicesSchema,
} from "@/lib/crm/intake-schema";
import { isCompanyUser, requireCrmCapability } from "../../_helpers";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  headline: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  successMessage: z.string().trim().max(500).nullable().optional(),
  allowPhotos: z.boolean().optional(),
  maxPhotos: z.number().int().min(0).max(20).optional(),
  defaultAssigneeId: z.string().uuid().nullable().optional(),
  fields: crmIntakeFieldsSchema.optional(),
  services: crmIntakeServicesSchema.optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const form = await prisma.crmIntakeForm.findFirst({
      where: { id, companyId: session.user.companyId },
    });
    if (!form) return errorResponse("Intake form not found", 404);
    return successResponse(form);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/intake-forms/[id] error:", error);
    return errorResponse("Failed to fetch intake form");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "settings.manage")) return errorResponse("Manager access required", 403);
    const { id } = await params;

    const existing = await prisma.crmIntakeForm.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, fields: true, services: true },
    });
    if (!existing) return errorResponse("Intake form not found", 404);

    const data = updateSchema.parse(await request.json());
    // Cross-field rules over the effective (merged) config.
    crmIntakeFormConfigSchema.parse({
      fields: data.fields ?? existing.fields ?? [],
      services: data.services ?? existing.services ?? [],
    });
    if (!(await isCompanyUser(session.user.companyId, data.defaultAssigneeId))) {
      return errorResponse("Invalid default assignee", 400);
    }
    const updated = await prisma.crmIntakeForm.update({
      where: { id },
      data: {
        name: data.name,
        isActive: data.isActive,
        headline: data.headline ?? undefined,
        description: data.description ?? undefined,
        successMessage: data.successMessage ?? undefined,
        allowPhotos: data.allowPhotos,
        maxPhotos: data.maxPhotos,
        defaultAssigneeId: data.defaultAssigneeId ?? undefined,
        fields: data.fields,
        services: data.services,
      },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/intake-forms/[id] error:", error);
    return errorResponse("Failed to update intake form");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "settings.manage")) return errorResponse("Manager access required", 403);
    const { id } = await params;

    const existing = await prisma.crmIntakeForm.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Intake form not found", 404);

    await prisma.crmIntakeForm.update({ where: { id }, data: { isActive: false } });
    return successResponse({ id, deactivated: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/intake-forms/[id] error:", error);
    return errorResponse("Failed to deactivate intake form");
  }
}
