import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@corelithzw/db";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { productSchema } from "@/lib/inventory/catalogue";
import { priceProduct } from "@/lib/inventory/catalogue-service";

const updateSchema = productSchema.partial().extend({
  /** Link this catalogue item to the stock record at a site. */
  inventoryItemId: z.string().uuid().nullable().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const product = await priceProduct(session.user.companyId, id, {
      priceListId: new URL(request.url).searchParams.get("priceListId"),
    });
    if (!product) return errorResponse("Catalogue item not found", 404);

    return successResponse(product);
  } catch (error) {
    console.error("[API] GET /api/v2/inventory/products/[id] error:", error);
    return errorResponse("Failed to fetch the catalogue item");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.product.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Catalogue item not found", 404);

    const data = updateSchema.parse(await request.json());

    // Linking stock is a two-way street: the stock row points at the product,
    // because that is the side that varies by site.
    if (data.inventoryItemId !== undefined) {
      if (data.inventoryItemId) {
        const stockRow = await prisma.inventoryItem.findFirst({
          where: { id: data.inventoryItemId, site: { companyId } },
          select: { id: true },
        });
        if (!stockRow) return errorResponse("That stock item isn't in this company", 400);
        await prisma.inventoryItem.update({
          where: { id: data.inventoryItemId },
          data: { productId: id },
        });
      } else {
        await prisma.inventoryItem.updateMany({
          where: { productId: id, site: { companyId } },
          data: { productId: null },
        });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        kind: data.kind,
        category: data.category,
        unit: data.unit,
        unitLabel: data.unitLabel,
        standardPrice: data.standardPrice,
        costPrice: data.costPrice,
        defaultTaxRate: data.defaultTaxRate,
        currency: data.currency,
        maxDiscountPercent: data.maxDiscountPercent,
        imageUrl: data.imageUrl,
        notes: data.notes,
        isActive: data.isActive,
        attributes: (data.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    return successResponse(product);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/inventory/products/[id] error:", error);
    return errorResponse("Failed to update the catalogue item");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.product.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Catalogue item not found", 404);

    // Archived, never deleted: quotes, receipts and job cards already name this
    // item, and that history should still say what was sold.
    const product = await prisma.product.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
      select: { id: true, isActive: true, archivedAt: true },
    });

    return successResponse(product);
  } catch (error) {
    console.error("[API] DELETE /api/v2/inventory/products/[id] error:", error);
    return errorResponse("Failed to archive the catalogue item");
  }
}
