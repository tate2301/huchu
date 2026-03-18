import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const sellerUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().min(1).max(50).optional(),
  nationalId: z.string().trim().min(1).max(80).optional(),
  address: z.string().trim().max(240).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
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

    const existing = await prisma.scrapSellerProfile.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, nationalId: true },
    });

    if (!existing) {
      return errorResponse("Seller profile not found", 404);
    }

    const body = await request.json();
    const validated = sellerUpdateSchema.parse(body);

    if (validated.nationalId && validated.nationalId !== existing.nationalId) {
      const duplicate = await prisma.scrapSellerProfile.findFirst({
        where: {
          companyId: session.user.companyId,
          nationalId: validated.nationalId,
          NOT: { id },
        },
        select: { id: true },
      });

      if (duplicate) {
        return errorResponse("Seller national ID already exists", 409);
      }
    }

    const seller = await prisma.scrapSellerProfile.update({
      where: { id },
      data: {
        fullName: validated.fullName,
        phone: validated.phone,
        nationalId: validated.nationalId,
        address: validated.address === null ? null : validated.address,
        notes: validated.notes === null ? null : validated.notes,
        isActive: validated.isActive,
      },
      include: {
        _count: {
          select: {
            purchases: true,
          },
        },
      },
    });

    return successResponse(seller);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/scrap-metal/sellers/[id] error:", error);
    return errorResponse("Failed to update scrap seller");
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

    const seller = await prisma.scrapSellerProfile.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        _count: {
          select: {
            purchases: true,
          },
        },
      },
    });

    if (!seller) {
      return errorResponse("Seller profile not found", 404);
    }

    if (seller._count.purchases > 0) {
      const archived = await prisma.scrapSellerProfile.update({
        where: { id },
        data: { isActive: false },
        include: {
          _count: {
            select: {
              purchases: true,
            },
          },
        },
      });
      return successResponse({ archived: true, seller: archived });
    }

    await prisma.scrapSellerProfile.delete({ where: { id } });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/scrap-metal/sellers/[id] error:", error);
    return errorResponse("Failed to remove scrap seller");
  }
}
