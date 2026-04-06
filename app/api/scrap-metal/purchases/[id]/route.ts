import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { applyScrapBalanceDelta } from "@/lib/scrap-metal";

const purchaseUpdateSchema = z.object({
  purchaseDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/))
    .optional(),
  siteId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  sellerProfileId: z.string().uuid().nullable().optional(),
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
        employeeId: true,
        purchaseNumber: true,
        category: true,
        weight: true,
        pricePerKg: true,
        totalAmount: true,
        sellerProfileId: true,
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

    const [material, sellerProfile] = await Promise.all([
      validated.materialId
        ? prisma.scrapMaterial.findFirst({
            where: { id: validated.materialId, companyId: session.user.companyId },
            select: { id: true, category: true, isActive: true },
          })
        : Promise.resolve(null),
      validated.sellerProfileId
        ? prisma.scrapSellerProfile.findFirst({
            where: { id: validated.sellerProfileId, companyId: session.user.companyId },
            select: { id: true, fullName: true, phone: true, isActive: true },
          })
        : validated.sellerProfileId === null
          ? Promise.resolve(null)
          : Promise.resolve(null),
    ]);

    if (validated.materialId) {
      if (!material) return errorResponse("Invalid material", 404);
      if (!material.isActive) return errorResponse("Material is inactive", 400);
      if (material.category !== nextCategory) {
        return errorResponse("Material category does not match the selected category", 400);
      }
    }
    if (validated.sellerProfileId && !sellerProfile) {
      return errorResponse("Invalid seller profile", 404);
    }
    if (validated.sellerProfileId && sellerProfile && !sellerProfile.isActive) {
      return errorResponse("Seller profile is inactive", 400);
    }

    const nextStatus = validated.status ?? existing.status;
    const nextEmployeeId = validated.employeeId ?? existing.employeeId;
    const nextTotalAmount = nextWeight * nextPricePerKg;

    const purchase = await prisma.$transaction(async (tx) => {
      if (existing.status !== "CANCELLED") {
        await applyScrapBalanceDelta(tx, {
          companyId: session.user.companyId,
          employeeId: existing.employeeId,
          amountDelta: -existing.totalAmount,
          entryType: "REVERSAL",
          sourceId: existing.id,
          note: `Reverse ${existing.purchaseNumber}`,
          createdById: session.user.id,
        });
      }

      const updatedPurchase = await tx.scrapMetalPurchase.update({
        where: { id },
        data: {
          purchaseDate: validated.purchaseDate ? new Date(validated.purchaseDate) : undefined,
          siteId: validated.siteId,
          employeeId: validated.employeeId,
          sellerProfileId:
            validated.sellerProfileId === undefined ? undefined : validated.sellerProfileId,
          materialId: validated.materialId === null ? null : validated.materialId,
          category: validated.category,
          weight: validated.weight,
          pricePerKg: validated.pricePerKg,
          totalAmount: nextTotalAmount,
          currency: validated.currency?.trim().toUpperCase(),
          sellerName:
            validated.sellerProfileId === undefined
              ? validated.sellerName === null
                ? null
                : validated.sellerName
              : sellerProfile?.fullName ?? null,
          sellerPhone:
            validated.sellerProfileId === undefined
              ? validated.sellerPhone === null
                ? null
                : validated.sellerPhone
              : sellerProfile?.phone ?? null,
          notes: validated.notes === null ? null : validated.notes,
          status: validated.status,
        },
        include: {
          site: { select: { id: true, name: true, code: true } },
          employee: { select: { id: true, name: true, employeeId: true } },
          sellerProfile: { select: { id: true, fullName: true, phone: true, nationalId: true } },
          material: { select: { id: true, code: true, name: true, category: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      if (nextStatus !== "CANCELLED") {
        await applyScrapBalanceDelta(tx, {
          companyId: session.user.companyId,
          employeeId: nextEmployeeId,
          amountDelta: nextTotalAmount,
          entryType: "PURCHASE",
          sourceId: updatedPurchase.id,
          note: `Purchase ${updatedPurchase.purchaseNumber}`,
          createdById: session.user.id,
        });
      }

      return updatedPurchase;
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
        employeeId: true,
        totalAmount: true,
        purchaseNumber: true,
        batchItems: { select: { id: true } },
      },
    });
    if (!existing) return errorResponse("Purchase not found", 404);
    if (existing.batchItems.length > 0) {
      return errorResponse("Remove this purchase from yard stock before deleting it", 409);
    }

    await prisma.$transaction(async (tx) => {
      if (existing.status !== "CANCELLED") {
        await applyScrapBalanceDelta(tx, {
          companyId: session.user.companyId,
          employeeId: existing.employeeId,
          amountDelta: -existing.totalAmount,
          entryType: "REVERSAL",
          sourceId: existing.id,
          note: `Delete ${existing.purchaseNumber}`,
          createdById: session.user.id,
        });
      }

      await tx.scrapMetalPurchase.delete({ where: { id } });
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/scrap-metal/purchases/[id] error:", error);
    return errorResponse("Failed to remove scrap purchase");
  }
}
