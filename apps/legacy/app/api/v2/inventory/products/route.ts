import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, ProductKind } from "@corelithzw/db";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { PRODUCT_KINDS, productSchema } from "@/lib/inventory/catalogue";
import { priceProducts } from "@/lib/inventory/catalogue-service";

/**
 * The shared catalogue.
 *
 * Every selling module reads this one endpoint — the CRM when quoting, Retail
 * when listing, a workshop when building a job card. Prices come back already
 * resolved against the caller's price list so no module has to reimplement the
 * precedence rules.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");

    const result = await priceProducts(
      session.user.companyId,
      {
        q: searchParams.get("q")?.trim() || undefined,
        kind: PRODUCT_KINDS.includes(kind as (typeof PRODUCT_KINDS)[number])
          ? (kind as ProductKind)
          : undefined,
        category: searchParams.get("category")?.trim() || undefined,
        includeInactive: searchParams.get("includeInactive") === "1",
        stockableOnly: searchParams.get("stockableOnly") === "1",
      },
      {
        quantity: Number(searchParams.get("quantity")) || 1,
        priceListId: searchParams.get("priceListId"),
        withStock: searchParams.get("withStock") !== "0",
      },
    );

    return successResponse({ data: result.products, priceList: result.priceList });
  } catch (error) {
    console.error("[API] GET /api/v2/inventory/products error:", error);
    return errorResponse("Failed to fetch the catalogue");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = productSchema.parse(await request.json());

    const clash = await prisma.product.findFirst({
      where: { companyId, code: data.code },
      select: { id: true },
    });
    if (clash) return errorResponse(`Code "${data.code}" is already in use`, 409);

    const product = await prisma.product.create({
      data: {
        companyId,
        code: data.code,
        name: data.name,
        description: data.description ?? undefined,
        kind: data.kind ?? "GOODS",
        category: data.category ?? undefined,
        unit: data.unit ?? "EACH",
        unitLabel: data.unitLabel ?? undefined,
        standardPrice: data.standardPrice,
        costPrice: data.costPrice ?? undefined,
        defaultTaxRate: data.defaultTaxRate ?? 0,
        currency: data.currency ?? "USD",
        maxDiscountPercent: data.maxDiscountPercent ?? undefined,
        imageUrl: data.imageUrl ?? undefined,
        notes: data.notes ?? undefined,
        isActive: data.isActive ?? true,
        attributes: (data.attributes ?? undefined) as Prisma.InputJsonValue | undefined,
        createdById: session.user.id,
      },
    });

    return successResponse(product, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/inventory/products error:", error);
    return errorResponse("Failed to create the catalogue item");
  }
}
