import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { CRM_LEAD_CHANNELS } from "@corelithzw/module-crm/sources";
import { requireCrmCapability } from "../../_helpers";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  channel: z.enum(CRM_LEAD_CHANNELS as [string, ...string[]]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "settings.manage")) return errorResponse("Manager access required", 403);
    const { id } = await params;

    const existing = await prisma.crmLeadSource.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Lead source not found", 404);

    const data = updateSchema.parse(await request.json());
    const updated = await prisma.crmLeadSource.update({
      where: { id },
      data: {
        name: data.name,
        channel: data.channel as never,
        isActive: data.isActive,
      },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    if (typeof error === "object" && error && "code" in error && (error as { code: string }).code === "P2002") {
      return errorResponse("A lead source with this name already exists", 409);
    }
    console.error("[API] PATCH /api/v2/crm/lead-sources/[id] error:", error);
    return errorResponse("Failed to update lead source");
  }
}
