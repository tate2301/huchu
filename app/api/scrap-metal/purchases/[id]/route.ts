import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const purchaseUpdateSchema = z.object({
  purchaseDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/))
    .optional(),
  siteId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  materialId: z.string().uuid().nullable().optional(),
  category: z
    .enum(["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"])
    .optional(),
  weight: z.number().positive().optional(),
  pricePerKg: z.number().min(0).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  sellerName: z.string().max(200).nullable().optional(),
  sellerPhone: z.string().max(50).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(["DRAFT", "POSTED", "CANCELLED"]).optional(),
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

    const existing = await prisma.scrapMetalPurchase.findFirst({
      where: { id, companyId: session.user.companyId },
      select: {
        id: true,
        status: true,
        companyId: true,
        category: true,
        weight: true,
        pricePerKg: true,
      },
    });
    if (!existing) return errorResponse("Purchase not found", 404);
    if (existing.status === "REVERSED") {
      return errorResponse("Reversed purchases cannot be edited", 400);
    }

    const body = await request.json();
    const validated = purchaseUpdateSchema.parse(body);
    const nextCategory = validated.category ?? existing.category;
    const nextWeight = validated.weight ?? existing.weight;
    const nextPricePerKg = validated.pricePerKg ?? existing.pricePerKg;

    if (validated.materialId) {
      const material = await prisma.scrapMaterial.findFirst({
        where: { id: validated.materialId, companyId: session.user.companyId },
        select: { id: true, category: true, isActive: true },
      });
      if (!material) return errorResponse("Invalid material", 404);
      if (!material.isActive) return errorResponse("Material is inactive", 400);
      if (material.category !== nextCategory) {
        return errorResponse("Material category does not match the selected category", 400);
      }
    }

    const purchase = await prisma.scrapMetalPurchase.update({
      where: { id },
      data: {
        purchaseDate: validated.purchaseDate ? new Date(validated.purchaseDate) : undefined,
        siteId: validated.siteId,
        employeeId: validated.employeeId,
        materialId: validated.materialId === null ? null : validated.materialId,
        category: validated.category,
        weight: validated.weight,
        pricePerKg: validated.pricePerKg,
        totalAmount: nextWeight * nextPricePerKg,
        currency: validated.currency?.trim().toUpperCase(),
        sellerName: validated.sellerName === null ? null : validated.sellerName,
        sellerPhone: validated.sellerPhone === null ? null : validated.sellerPhone,
        notes: validated.notes === null ? null : validated.notes,
        status: validated.status,
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
        employee: { select: { id: true, name: true, employeeId: true } },
        material: { select: { id: true, code: true, name: true, category: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return successResponse(purchase);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/scrap-metal/purchases/[id] error:", error);
    return errorResponse("Failed to update scrap purchase");
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

    const existing = await prisma.scrapMetalPurchase.findFirst({
      where: { id, companyId: session.user.companyId },
      select: {
        id: true,
        status: true,
        batchItems: { select: { id: true } },
      },
    });
    if (!existing) return errorResponse("Purchase not found", 404);
    if (existing.batchItems.length > 0) {
      return errorResponse("Remove this purchase from yard stock before deleting it", 409);
    }

    await prisma.scrapMetalPurchase.delete({ where: { id } });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/scrap-metal/purchases/[id] error:", error);
    return errorResponse("Failed to remove scrap purchase");
  }
}
