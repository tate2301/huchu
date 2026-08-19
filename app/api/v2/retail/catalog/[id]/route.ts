import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { prisma } from "@/lib/prisma";
import {
  archiveShelfListing,
  loadShelfListing,
  upsertShelfListing,
} from "@/lib/retail/shelf-listing";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { ensureInventoryItemAccess, requireRetailSession } from "../../_helpers";

/**
 * One shelf line. `{id}` is a `Product.id` from S-4b.
 *
 * This is the endpoint both editable screens write to: the catalogue dialog and
 * the pricing table. It writes `Product` and the `ProductPrice` on the tenant's
 * `RETAIL` shelf list — the same rows the till reads its price out of — so an
 * edit here is an edit the counter charges, which is the whole point of the
 * cutover.
 */
const patchSchema = z.object({
  inventoryItemId: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  sku: z.string().min(1).max(80).optional(),
  barcode: z.string().max(80).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  unitPrice: z.number().min(0).optional(),
  compareAtPrice: z.number().min(0).optional().nullable(),
  taxPercent: z.number().min(0).max(100).optional(),
  imageUrl: z.string().url().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

function normalizeSku(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. One line off the range. Same gate as the list it came from.
  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  /*
    R-3.1. The segment, through a schema.

    Prisma is not injectable, so this is not a security fix. It is the
    difference between a 400 naming the parameter and a 404 that reads, to a
    shopkeeper, as "the receipt you are holding is not in the system".
  */
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
  const listing = await loadShelfListing(session.user.companyId, id);
  if (!listing) {
    return errorResponse("Catalog item not found", 404);
  }

  return successResponse(listing);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.catalog", "update");
  if (gate) return gate;

  try {
    const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
    const existing = await loadShelfListing(session.user.companyId, id);
    if (!existing) {
      return errorResponse("Catalog item not found", 404);
    }

    const body = await request.json();
    const input = patchSchema.parse(body);

    let inventoryItemId = existing.inventoryItemId;
    if (input.inventoryItemId && input.inventoryItemId !== existing.inventoryItemId) {
      const inventoryItem = await ensureInventoryItemAccess(
        session.user.companyId,
        input.inventoryItemId,
      );
      if (!inventoryItem) {
        return errorResponse("Invalid inventory item", 400);
      }
      if (inventoryItem.productId && inventoryItem.productId !== existing.productId) {
        return errorResponse("That stock item is already ranged under another product", 409);
      }
      inventoryItemId = inventoryItem.id;
      // The line it used to sell keeps nothing pointing at it, which is what
      // "moved to a different stock row" means.
      await prisma.inventoryItem.updateMany({
        where: { id: existing.inventoryItemId, productId: existing.productId },
        data: { productId: null },
      });
    }

    await upsertShelfListing({
      companyId: session.user.companyId,
      productId: existing.productId,
      sku: input.sku ? normalizeSku(input.sku) : existing.sku,
      name: input.name?.trim() || existing.name,
      inventoryItemId,
      // A PATCH that only moves the was-price must not reprice the shelf.
      unitPrice: input.unitPrice ?? existing.unitPrice,
      taxPercent: input.taxPercent ?? existing.taxPercent,
      ...(input.description === undefined ? {} : { description: input.description?.trim() ?? null }),
      ...(input.barcode === undefined ? {} : { barcode: input.barcode?.trim() || null }),
      ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
      ...(input.compareAtPrice === undefined ? {} : { compareAtPrice: input.compareAtPrice }),
      ...(input.status === undefined ? {} : { isActive: input.status === "ACTIVE" }),
    });

    const updated = await loadShelfListing(session.user.companyId, existing.productId);
    return successResponse(updated ?? existing);
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

  const gate = requireRetailPermission(session, "retail.catalog", "delete");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
  const existing = await loadShelfListing(session.user.companyId, id);
  if (!existing) {
    return errorResponse("Catalog item not found", 404);
  }

  // Archived, not deleted. See `archiveShelfListing`: sale lines point at this
  // product and a receipt reprint is not negotiable.
  await archiveShelfListing({
    companyId: session.user.companyId,
    productId: existing.productId,
  });

  return successResponse({ success: true });
}
