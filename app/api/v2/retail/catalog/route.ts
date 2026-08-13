import { NextRequest, NextResponse } from "next/server";
import { Prisma, RetailAcquisitionMode, RetailCatalogItemStatus } from "@prisma/client";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { linkListingToCore, resolveShelfPrices } from "@/lib/retail/shelf-pricing";
import { ensureInventoryItemAccess, requireRetailManager, requireRetailSession } from "../_helpers";

const catalogItemSchema = z.object({
  catalogCode: z.string().min(1).max(50).optional(),
  inventoryItemId: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  sku: z.string().min(1).max(80).optional(),
  barcode: z.string().max(80).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  unitPrice: z.number().min(0),
  compareAtPrice: z.number().min(0).optional().nullable(),
  taxPercent: z.number().min(0).max(100).optional(),
  acquisitionMode: z.nativeEnum(RetailAcquisitionMode).optional(),
  imageUrl: z.string().url().optional().nullable(),
  status: z.nativeEnum(RetailCatalogItemStatus).optional(),
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

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const siteId = searchParams.get("siteId")?.trim();
  const status = searchParams.get("status")?.trim();

  const where: Prisma.RetailCatalogItemWhereInput = {
    companyId: session.user.companyId,
  };

  if (siteId) where.siteId = siteId;
  if (status && status !== "all") {
    const parsed = RetailCatalogItemStatus[status as keyof typeof RetailCatalogItemStatus];
    if (!parsed) return errorResponse(`Unknown status "${status}"`, 400);
    where.status = parsed;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { catalogCode: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { barcode: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await prisma.retailCatalogItem.findMany({
    where,
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  const [inventoryItems, sites] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { id: { in: items.map((item) => item.inventoryItemId) } },
      select: {
        id: true,
        itemCode: true,
        name: true,
        currentStock: true,
        unit: true,
        locationId: true,
      },
    }),
    prisma.site.findMany({
      where: { id: { in: items.map((item) => item.siteId) } },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const inventoryMap = new Map(inventoryItems.map((item) => [item.id, item]));
  const siteMap = new Map(sites.map((site) => [site.id, site]));

  // S-3. The admin list shows what the till will charge, which means resolving
  // it the same way the till does rather than reading the listing column. A
  // pricing screen that disagrees with the counter is worse than no screen.
  const shelfPrices = await resolveShelfPrices(
    session.user.companyId,
    items.map((item) => ({
      id: item.id,
      productId: item.productId,
      unitPrice: item.unitPrice,
      taxPercent: item.taxPercent,
    })),
  );

  return successResponse({
    data: items.map((item) => {
      const shelf = shelfPrices.get(item.id);
      return {
        ...item,
        unitPrice: shelf?.unitPrice ?? Number(item.unitPrice),
        taxPercent: shelf?.taxPercent ?? Number(item.taxPercent),
        taxInclusive: shelf?.taxInclusive ?? false,
        currency: shelf?.currency ?? "USD",
        priceListId: shelf?.priceListId ?? null,
        priceSource: shelf?.priceSource ?? "LISTING",
        pricedAt: shelf?.pricedAt ?? null,
        inventoryItem: inventoryMap.get(item.inventoryItemId) ?? null,
        site: siteMap.get(item.siteId) ?? null,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailManager(session);
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = catalogItemSchema.parse(body);
    const inventoryItem = await ensureInventoryItemAccess(session.user.companyId, input.inventoryItemId);

    if (!inventoryItem) {
      return errorResponse("Invalid inventory item", 400);
    }

    const providedCode = input.catalogCode
      ? normalizeProvidedId(input.catalogCode, "RETAIL_CATALOG_ITEM")
      : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const catalogCode =
        providedCode ??
        (await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "RETAIL_CATALOG_ITEM",
          siteId: inventoryItem.siteId,
        }));

      try {
        const created = await prisma.retailCatalogItem.create({
          data: {
            companyId: session.user.companyId,
            catalogCode,
            inventoryItemId: inventoryItem.id,
            siteId: inventoryItem.siteId,
            name: input.name?.trim() || inventoryItem.name,
            sku: normalizeSku(input.sku ?? catalogCode),
            barcode: input.barcode?.trim() || null,
            description: input.description?.trim() || null,
            unitPrice: input.unitPrice,
            compareAtPrice: input.compareAtPrice ?? null,
            taxPercent: input.taxPercent ?? 0,
            acquisitionMode: input.acquisitionMode ?? RetailAcquisitionMode.PURCHASE,
            imageUrl: input.imageUrl ?? null,
            status: input.status ?? RetailCatalogItemStatus.ACTIVE,
          },
        });

        // Core is the price engine from S-3 onward, so a listing has to arrive
        // with a product behind it. Created after the row rather than inside
        // its retry loop: the loop exists to survive a catalog-code collision,
        // and re-running the core link on every collision would be noise.
        const productId = await linkListingToCore({
          companyId: session.user.companyId,
          listingId: created.id,
          productId: created.productId,
          sku: created.sku,
          name: created.name,
          description: created.description,
          barcode: created.barcode,
          imageUrl: created.imageUrl,
          inventoryItemId: created.inventoryItemId,
          unitPrice: created.unitPrice,
          taxPercent: created.taxPercent,
        });

        return successResponse({ ...created, productId }, 201);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          if (providedCode) {
            return errorResponse("Catalog code or SKU already exists", 409);
          }
          continue;
        }
        throw error;
      }
    }

    return errorResponse("Unable to generate catalog code", 409);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/catalog error:", error);
    return errorResponse("Failed to create catalog item");
  }
}
