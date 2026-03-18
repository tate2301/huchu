import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateMaterialSchema = z.object({
  code: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  category: z
    .enum(["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"])
    .optional(),
  defaultPricePerKg: z.number().min(0).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
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

    const body = await request.json();
    const validated = updateMaterialSchema.parse(body);

    const existing = await prisma.scrapMaterial.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) {
      return errorResponse("Material not found", 404);
    }

    if (validated.code) {
      const duplicate = await prisma.scrapMaterial.findFirst({
        where: {
          companyId: session.user.companyId,
          code: validated.code.toUpperCase(),
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicate) {
        return errorResponse("Material code already exists", 409);
      }
    }

    const material = await prisma.scrapMaterial.update({
      where: { id },
      data: {
        code: validated.code?.toUpperCase(),
        name: validated.name,
        category: validated.category,
        defaultPricePerKg: validated.defaultPricePerKg,
        currency: validated.currency?.trim().toUpperCase(),
        isActive: validated.isActive,
        notes: validated.notes === null ? null : validated.notes,
      },
      include: {
        _count: {
          select: {
            prices: true,
            purchases: true,
            batches: true,
            sales: true,
          },
        },
      },
    });

    return successResponse(material);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/scrap-metal/materials/[id] error:", error);
    return errorResponse("Failed to update scrap material");
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

    const material = await prisma.scrapMaterial.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        _count: {
          select: {
            prices: true,
            purchases: true,
            batches: true,
            sales: true,
          },
        },
      },
    });
    if (!material) {
      return errorResponse("Material not found", 404);
    }

    const hasActivity =
      material._count.prices > 0 ||
      material._count.purchases > 0 ||
      material._count.batches > 0 ||
      material._count.sales > 0;

    if (hasActivity) {
      const archived = await prisma.scrapMaterial.update({
        where: { id },
        data: { isActive: false },
      });
      return successResponse({
        archived: true,
        material: archived,
      });
    }

    await prisma.scrapMaterial.delete({ where: { id } });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/scrap-metal/materials/[id] error:", error);
    return errorResponse("Failed to remove scrap material");
  }
}
