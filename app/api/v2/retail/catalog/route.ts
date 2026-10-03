import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { findLiveRetailCategory } from "@/lib/retail/categories";
import { productDetailFields, productDetailWrites } from "@/lib/retail/product-details";
import { loadShelfListings, upsertShelfListing } from "@/lib/retail/shelf-listing";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";
import { ensureInventoryItemAccess, requireRetailSession, resolveRetailSite } from "../_helpers";

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
  /**
   * The stock line this product sells from. Left out, the product gets a stock
   * line of its own at the shop's site — the ordinary case, and the reason a
   * shopkeeper adding a product never has to meet a "stock item" first.
   */
  inventoryItemId: z.string().uuid().optional(),
  /** What one of it is called — "bottle", "case". Only read for a new stock line. */
  unit: z.string().trim().min(1).max(40).optional(),
  siteId: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  sku: z.string().min(1).max(80).optional(),
  barcode: z.string().max(80).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  unitPrice: z.number().min(0),
  compareAtPrice: z.number().min(0).optional().nullable(),
  taxPercent: z.number().min(0).max(100).optional(),
  imageUrl: z.string().url().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  ...productDetailFields,
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

    if (input.categoryId && !(await findLiveRetailCategory(session.user.companyId, input.categoryId))) {
      return errorResponse("That category is not one of this shop's", 400);
    }

    if (!input.inventoryItemId) {
      return createWithOwnStockLine(session.user.companyId, input);
    }

    const inventoryItem = await ensureInventoryItemAccess(
      session.user.companyId,
      input.inventoryItemId,
    );

    if (!inventoryItem) {
      return errorResponse("That stock line is not in this workspace", 400);
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
          `${inventoryItem.name} is already sold as ${claimed.name} (${claimed.code})`,
          409,
        );
      }
    }

    // `Product.code` is the one identifier now. Falling back to the stock row's
    // own code keeps the "leave it blank and we name it" behaviour the reserved
    // catalogue code used to provide, without a second sequence to maintain.
    const sku = normalizeSku(input.sku ?? inventoryItem.itemCode);
    if (!sku) {
      return errorResponse("Give the product a code — its stock code has no usable characters", 400);
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
        ...productDetailWrites(input),
      });
      if (input.reorderLevel !== undefined) {
        await prisma.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: { minStock: input.reorderLevel },
        });
      }

      const [created] = await loadShelfListings(session.user.companyId, {
        productIds: [productId],
      });
      return successResponse(created ?? { id: productId, productId }, 201);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return errorResponse(`Another product already has the code ${sku}`, 409);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/catalog error:", error);
    return errorResponse("The product was not created");
  }
}

type CatalogItemInput = z.infer<typeof catalogItemSchema>;

/**
 * A new product with a stock line of its own.
 *
 * The line is made at the shop's site, in its first stock location (a site
 * with none gets "Shop floor"), coded with the product's own code so the two
 * cannot be told apart by a shopkeeper who never sees the stock screens. If the
 * product then fails to save, the line is taken back out rather than left as
 * an orphan nobody asked for.
 */
async function createWithOwnStockLine(companyId: string, input: CatalogItemInput) {
  const name = input.name?.trim();
  if (!name) return errorResponse("Give the product a name", 400);

  const sku = normalizeSku(input.sku ?? name);
  if (!sku) return errorResponse("Give the product a code — its name has no usable characters", 400);

  const { site, response } = await resolveRetailSite(companyId, input.siteId);
  if (response) return response;
  if (!site) return errorResponse("This workspace has no site to keep stock at", 400);

  const location =
    (await prisma.stockLocation.findFirst({
      where: { siteId: site.id, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })) ??
    (await prisma.stockLocation.create({
      data: { siteId: site.id, code: "SHOP-FLOOR", name: "Shop floor" },
      select: { id: true },
    }));

  let stockLineId: string;
  try {
    const line = await prisma.inventoryItem.create({
      data: {
        itemCode: sku,
        name,
        // The stores module's mining taxonomy. A shop's product is filed under
        // the shop's own category (`Product.categoryId`); this column is not
        // read anywhere in retail.
        category: "OTHER",
        unit: input.unit?.trim() || "each",
        siteId: site.id,
        locationId: location.id,
        ...(input.reorderLevel === undefined || input.reorderLevel === null ? {} : { minStock: input.reorderLevel }),
        ...(input.costPrice === undefined || input.costPrice === null ? {} : { unitCost: input.costPrice }),
      },
      select: { id: true },
    });
    stockLineId = line.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(`Another product already has the code ${sku}`, 409);
    }
    throw error;
  }

  try {
    const productId = await upsertShelfListing({
      companyId,
      productId: null,
      sku,
      name,
      inventoryItemId: stockLineId,
      unitPrice: input.unitPrice,
      taxPercent: input.taxPercent ?? 0,
      description: input.description?.trim() || null,
      barcode: input.barcode?.trim() || null,
      imageUrl: input.imageUrl ?? null,
      compareAtPrice: input.compareAtPrice ?? null,
      isActive: (input.status ?? "ACTIVE") === "ACTIVE",
      ...productDetailWrites(input),
    });
    const [created] = await loadShelfListings(companyId, { productIds: [productId] });
    return successResponse(created ?? { id: productId, productId }, 201);
  } catch (error) {
    await prisma.inventoryItem.delete({ where: { id: stockLineId } }).catch(() => {});
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(`Another product already has the code ${sku}`, 409);
    }
    throw error;
  }
}
