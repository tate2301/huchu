import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  scope: z.enum(["INBOUND", "OUTBOUND", "BOTH"]).optional(),
  materialId: z.string().uuid().nullable().optional(),
  category: z.enum(["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"]).nullable().optional(),
  requirePhotos: z.boolean().optional(),
  requirePaymentMethod: z.boolean().optional(),
  requirePaymentReference: z.boolean().optional(),
  requireNotes: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await context.params;

    const existing = await prisma.scrapTicketComplianceRule.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, materialId: true, category: true },
    });
    if (!existing) return errorResponse("Compliance rule not found", 404);

    const body = await request.json();
    const validated = updateSchema.parse(body);

    const nextMaterialId = validated.materialId === undefined ? existing.materialId : validated.materialId;
    const nextCategory = validated.category === undefined ? existing.category : validated.category;
    if (nextMaterialId) {
      const material = await prisma.scrapMaterial.findFirst({
        where: { id: nextMaterialId, companyId: session.user.companyId },
        select: { id: true, category: true, isActive: true },
      });
      if (!material) return errorResponse("Material not found", 404);
      if (!material.isActive) return errorResponse("Material is inactive", 400);
      if (nextCategory && nextCategory !== material.category) {
        return errorResponse("Category does not match selected material", 400);
      }
    }

    const updated = await prisma.scrapTicketComplianceRule.update({
      where: { id },
      data: {
        name: validated.name,
        scope: validated.scope,
        materialId: validated.materialId === undefined ? undefined : validated.materialId,
        category: validated.category === undefined ? undefined : validated.category,
        requirePhotos: validated.requirePhotos,
        requirePaymentMethod: validated.requirePaymentMethod,
        requirePaymentReference: validated.requirePaymentReference,
        requireNotes: validated.requireNotes,
        isActive: validated.isActive,
      },
      include: {
        material: { select: { id: true, code: true, name: true, category: true } },
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/scrap-metal/compliance-rules/[id] error:", error);
    return errorResponse("Failed to update compliance rule");
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
    const { id } = await context.params;

    const existing = await prisma.scrapTicketComplianceRule.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Compliance rule not found", 404);

    await prisma.scrapTicketComplianceRule.delete({ where: { id } });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/scrap-metal/compliance-rules/[id] error:", error);
    return errorResponse("Failed to delete compliance rule");
  }
}
