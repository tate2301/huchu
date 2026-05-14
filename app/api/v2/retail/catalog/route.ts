import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
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
  if (status && status !== "all") where.status = status;
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

  return successResponse({
    data: items.map((item) => ({
      ...item,
      inventoryItem: inventoryMap.get(item.inventoryItemId) ?? null,
      site: siteMap.get(item.siteId) ?? null,
    })),
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
            acquisitionMode: input.acquisitionMode?.trim() || "PURCHASE",
            imageUrl: input.imageUrl ?? null,
            status: input.status?.trim() || "ACTIVE",
          },
        });

        return successResponse(created, 201);
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
