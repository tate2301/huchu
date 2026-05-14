import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { ensureInventoryItemAccess, requireRetailManager, requireRetailSession } from "../../_helpers";

const patchSchema = z.object({
  inventoryItemId: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  sku: z.string().min(1).max(80).optional(),
  barcode: z.string().max(80).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  unitPrice: z.number().min(0).optional(),
  compareAtPrice: z.number().min(0).optional().nullable(),
  taxPercent: z.number().min(0).max(100).optional(),
  acquisitionMode: z.string().min(1).max(40).optional(),
  imageUrl: z.string().url().optional().nullable(),
  status: z.string().min(1).max(40).optional(),
});

function normalizeSku(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getCatalogItem(companyId: string, id: string) {
  return prisma.retailCatalogItem.findFirst({
    where: { id, companyId },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { id } = await params;
  const item = await getCatalogItem(session.user.companyId, id);
  if (!item) {
    return errorResponse("Catalog item not found", 404);
  }

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: item.inventoryItemId },
    select: { id: true, itemCode: true, name: true, currentStock: true, unit: true },
  });

  return successResponse({
    ...item,
    inventoryItem,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailManager(session);
  if (gate) return gate;

  try {
    const { id } = await params;
    const existing = await getCatalogItem(session.user.companyId, id);
    if (!existing) {
      return errorResponse("Catalog item not found", 404);
    }

    const body = await request.json();
    const input = patchSchema.parse(body);

    let inventoryItemId = existing.inventoryItemId;
    let siteId = existing.siteId;

    if (input.inventoryItemId) {
      const inventoryItem = await ensureInventoryItemAccess(session.user.companyId, input.inventoryItemId);
      if (!inventoryItem) {
        return errorResponse("Invalid inventory item", 400);
      }
      inventoryItemId = inventoryItem.id;
      siteId = inventoryItem.siteId;
    }

    const updated = await prisma.retailCatalogItem.update({
      where: { id: existing.id },
      data: {
        inventoryItemId,
        siteId,
        name: input.name?.trim(),
        sku: input.sku ? normalizeSku(input.sku) : undefined,
        barcode: input.barcode?.trim() ?? input.barcode,
        description: input.description?.trim() ?? input.description,
        unitPrice: input.unitPrice,
        compareAtPrice: input.compareAtPrice,
        taxPercent: input.taxPercent,
        acquisitionMode: input.acquisitionMode?.trim(),
        imageUrl: input.imageUrl ?? undefined,
        status: input.status?.trim(),
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/retail/catalog/[id] error:", error);
    return errorResponse("Failed to update catalog item");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailManager(session);
  if (gate) return gate;

  const { id } = await params;
  const existing = await getCatalogItem(session.user.companyId, id);
  if (!existing) {
    return errorResponse("Catalog item not found", 404);
  }

  await prisma.retailCatalogItem.delete({
    where: { id: existing.id },
  });

  return successResponse({ success: true });
}
