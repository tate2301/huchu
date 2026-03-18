import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updatePriceSchema = z.object({
  materialId: z.string().uuid().nullable().optional(),
  category: z
    .enum(["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"])
    .optional(),
  effectiveDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/))
    .optional(),
  pricePerKg: z.number().min(0).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  note: z.string().trim().max(500).nullable().optional(),
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

    const existing = await prisma.scrapMetalPrice.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, companyId: true },
    });
    if (!existing) return errorResponse("Price not found", 404);

    const body = await request.json();
    const validated = updatePriceSchema.parse(body);
    const nextCategory = validated.category;

    if (validated.materialId) {
      const material = await prisma.scrapMaterial.findFirst({
        where: { id: validated.materialId, companyId: session.user.companyId },
        select: { id: true, category: true },
      });
      if (!material) return errorResponse("Invalid material", 404);
      if (nextCategory && material.category !== nextCategory) {
        return errorResponse("Material category does not match the selected category", 400);
      }
    }

    const price = await prisma.scrapMetalPrice.update({
      where: { id },
      data: {
        materialId: validated.materialId === null ? null : validated.materialId,
        category: validated.category,
        effectiveDate: validated.effectiveDate ? new Date(validated.effectiveDate) : undefined,
        pricePerKg: validated.pricePerKg,
        currency: validated.currency?.trim().toUpperCase(),
        note: validated.note === null ? null : validated.note,
      },
      include: {
        material: {
          select: { id: true, code: true, name: true, category: true },
        },
      },
    });

    return successResponse(price);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/scrap-metal/pricing/[id] error:", error);
    return errorResponse("Failed to update scrap price");
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

    const existing = await prisma.scrapMetalPrice.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Price not found", 404);

    await prisma.scrapMetalPrice.delete({ where: { id } });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/scrap-metal/pricing/[id] error:", error);
    return errorResponse("Failed to remove scrap price");
  }
}
