import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { priceEntrySchema, priceListSchema, validatePriceList } from "@corelithzw/module-stock/catalogue";

const updateSchema = priceListSchema.partial().extend({
  /** Replace the list's prices wholesale. */
  entries: z.array(priceEntrySchema).max(2000).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const list = await prisma.priceList.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        entries: {
          include: {
            product: { select: { id: true, code: true, name: true, standardPrice: true } },
          },
          orderBy: [{ productId: "asc" }, { minQuantity: "asc" }],
        },
      },
    });
    if (!list) return errorResponse("Price list not found", 404);

    return successResponse(list);
  } catch (error) {
    console.error("[API] GET /api/v2/inventory/price-lists/[id] error:", error);
    return errorResponse("Failed to fetch the price list");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.priceList.findFirst({
      where: { id, companyId },
      select: { id: true, kind: true, region: true },
    });
    if (!existing) return errorResponse("Price list not found", 404);

    const data = updateSchema.parse(await request.json());

    const problem = validatePriceList({
      kind: data.kind ?? existing.kind,
      region: data.region ?? existing.region,
    });
    if (problem) return errorResponse(problem, 400);

    if (data.entries) {
      const productIds = Array.from(new Set(data.entries.map((entry) => entry.productId)));
      const count = await prisma.product.count({ where: { id: { in: productIds }, companyId } });
      if (count !== productIds.length) {
        return errorResponse("A price refers to an item that isn't in this catalogue", 400);
      }
    }

    const list = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.priceList.updateMany({
          where: { companyId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      // Prices are replaced as a set rather than diffed: a half-applied change
      // would price things wrongly in a way nobody notices until an invoice
      // goes out.
      if (data.entries) {
        await tx.productPrice.deleteMany({ where: { priceListId: id } });
        if (data.entries.length) {
          await tx.productPrice.createMany({
            data: data.entries.map((entry) => ({
              companyId,
              priceListId: id,
              productId: entry.productId,
              minQuantity: entry.minQuantity ?? 1,
              unitPrice: entry.unitPrice,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.priceList.update({
        where: { id },
        data: {
          name: data.name,
          kind: data.kind,
          isDefault: data.isDefault,
          region: data.region,
          currency: data.currency,
          isActive: data.isActive,
        },
        include: { _count: { select: { entries: true } } },
      });
    });

    return successResponse(list);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/inventory/price-lists/[id] error:", error);
    return errorResponse("Failed to update the price list");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.priceList.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, isDefault: true },
    });
    if (!existing) return errorResponse("Price list not found", 404);
    if (existing.isDefault) {
      // Removing the default would silently move every unpriced sale onto
      // standard prices, which is a price change nobody asked for.
      return errorResponse("Make another list the default before retiring this one", 409);
    }

    const list = await prisma.priceList.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });

    return successResponse(list);
  } catch (error) {
    console.error("[API] DELETE /api/v2/inventory/price-lists/[id] error:", error);
    return errorResponse("Failed to retire the price list");
  }
}
