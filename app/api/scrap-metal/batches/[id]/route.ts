import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const batchUpdateSchema = z.object({
  siteId: z.string().uuid().optional(),
  materialId: z.string().uuid().nullable().optional(),
  category: z
    .enum(["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"])
    .optional(),
  status: z.enum(["COLLECTING", "READY", "SOLD"]).optional(),
  collectionStartDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/))
    .optional(),
  collectionEndDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/))
    .nullable()
    .optional(),
  notes: z.string().max(1000).nullable().optional(),
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

    const existing = await prisma.scrapMetalBatch.findFirst({
      where: { id, companyId: session.user.companyId },
      select: {
        id: true,
        category: true,
        status: true,
        collectionEndDate: true,
        _count: { select: { sales: true } },
      },
    });
    if (!existing) return errorResponse("Batch not found", 404);

    const body = await request.json();
    const validated = batchUpdateSchema.parse(body);
    if (
      hasRole(session, ["OPERATOR", "CLERK"]) &&
      (existing.status === "SOLD" || existing._count.sales > 0)
    ) {
      return errorResponse("Sold lots are locked for operators", 403);
    }
    const nextCategory = validated.category ?? existing.category;
    const resolvedCollectionEndDate =
      validated.collectionEndDate === null
        ? null
        : validated.collectionEndDate
          ? new Date(validated.collectionEndDate)
          : validated.status === "SOLD" && !existing.collectionEndDate
            ? new Date()
            : undefined;

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

    const batch = await prisma.scrapMetalBatch.update({
      where: { id },
      data: {
        siteId: validated.siteId,
        materialId: validated.materialId === null ? null : validated.materialId,
        category: validated.category,
        status: validated.status,
        collectionStartDate: validated.collectionStartDate
          ? new Date(validated.collectionStartDate)
          : undefined,
        collectionEndDate: resolvedCollectionEndDate,
        notes: validated.notes === null ? null : validated.notes,
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
        material: { select: { id: true, code: true, name: true, category: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    });

    return successResponse(batch);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/scrap-metal/batches/[id] error:", error);
    return errorResponse("Failed to update scrap batch");
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

    const existing = await prisma.scrapMetalBatch.findFirst({
      where: { id, companyId: session.user.companyId },
      select: {
        id: true,
        status: true,
        _count: { select: { items: true, sales: true } },
      },
    });
    if (!existing) return errorResponse("Batch not found", 404);
    if (
      hasRole(session, ["OPERATOR", "CLERK"]) &&
      (existing.status === "SOLD" || existing._count.sales > 0)
    ) {
      return errorResponse("Sold lots are locked for operators", 403);
    }
    if (existing._count.items > 0 || existing._count.sales > 0) {
      return errorResponse("Only empty batches can be deleted", 409);
    }

    await prisma.scrapMetalBatch.delete({ where: { id } });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/scrap-metal/batches/[id] error:", error);
    return errorResponse("Failed to remove scrap batch");
  }
}
