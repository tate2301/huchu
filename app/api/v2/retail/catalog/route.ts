import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { loadShelfListings, upsertShelfListing } from "@/lib/retail/shelf-listing";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";
import { ensureInventoryItemAccess, requireRetailSession } from "../_helpers";

/**
 * The back-office range.
 *
 * S-4b — `Product` + `InventoryItem`, not `RetailCatalogItem`. The wire shape is
 * the one the catalogue and pricing screens already read, minus two fields that
 * had no meaning once the item master moved: `catalogCode`, which `Product.code`
 * subsumes (it was a second identifier for the same line, reserved from a
 * sequence and shown beside the SKU it duplicated), and `acquisitionMode`, a
 * single-valued enum nothing has ever written anything but `PURCHASE` to.
 */
/**
 * R-3.1. What the range list accepts.
 *
 * `status` took a hand-written three-way comparison, and `"all"` was accepted
 * as a synonym for absent — kept, because the catalogue screen sends it.
 *
 * R-3.2. `limit` is new, and so is the fact that there is one. This read was
 * the unbounded one: `loadShelfListings` with no `take`, one price resolution
 * per row, and a shop that ranges 4,000 lines got all 4,000 on every keystroke
 * of the search box. The cap is generous because a shopkeeper scrolling their
 * own range is the normal case and paging it would be a worse screen.
 */
const catalogQuery = z.object({
  search: z.string().trim().max(200).optional(),
  siteId: z.string().uuid().optional(),
  status: z.enum(["all", "ACTIVE", "INACTIVE"]).optional(),
  limit: z.coerce.number().int().min(1).max(2_000).optional(),
});

const catalogItemSchema = z.object({
  inventoryItemId: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  sku: z.string().min(1).max(80).optional(),
  barcode: z.string().max(80).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  unitPrice: z.number().min(0),
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

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. A cashier reads the range — a till that cannot list its stock cannot
  // sell — and a stock clerk reads it to count against. Nobody else does.
  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  const query = parseRetailQuery(request, catalogQuery);
  if (query.response) return query.response;

  const data = await loadShelfListings(session.user.companyId, {
    siteId: query.data.siteId ?? null,
    search: query.data.search || null,
    status: query.data.status === "all" ? null : (query.data.status ?? null),
    take: query.data.limit ?? 1_000,
  });

  return successResponse({ data });
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.catalog", "create");
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = catalogItemSchema.parse(body);
    const inventoryItem = await ensureInventoryItemAccess(
      session.user.companyId,
      input.inventoryItemId,
    );

    if (!inventoryItem) {
      return errorResponse("Invalid inventory item", 400);
    }

    // A stock row already sold under another product cannot be re-pointed here:
    // `InventoryItem.productId` names exactly one, and moving it would move the
    // other line's stock. The S-4a migration refused on the same
    // condition, for the same reason.
    if (inventoryItem.productId) {
      const claimed = await prisma.product.findFirst({
        where: { id: inventoryItem.productId, companyId: session.user.companyId },
        select: { code: true, name: true, archivedAt: true },
      });
      if (claimed && !claimed.archivedAt) {
        return errorResponse(
          `${inventoryItem.name} is already ranged as ${claimed.name} (${claimed.code})`,
          409,
        );
      }
    }

    // `Product.code` is the one identifier now. Falling back to the stock row's
    // own code keeps the "leave it blank and we name it" behaviour the reserved
    // catalogue code used to provide, without a second sequence to maintain.
    const sku = normalizeSku(input.sku ?? inventoryItem.itemCode);
    if (!sku) {
      return errorResponse("Give the item a SKU — its stock code has no usable characters", 400);
    }

    try {
      const productId = await upsertShelfListing({
        companyId: session.user.companyId,
        productId: null,
        sku,
        name: input.name?.trim() || inventoryItem.name,
        inventoryItemId: inventoryItem.id,
        unitPrice: input.unitPrice,
        taxPercent: input.taxPercent ?? 0,
        description: input.description?.trim() || null,
        barcode: input.barcode?.trim() || null,
        imageUrl: input.imageUrl ?? null,
        compareAtPrice: input.compareAtPrice ?? null,
        isActive: (input.status ?? "ACTIVE") === "ACTIVE",
      });

      const [created] = await loadShelfListings(session.user.companyId, {
        productIds: [productId],
      });
      return successResponse(created ?? { id: productId, productId }, 201);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return errorResponse(`SKU ${sku} already exists`, 409);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/catalog error:", error);
    return errorResponse("Failed to create catalog item");
  }
}
