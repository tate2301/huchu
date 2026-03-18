import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const scrapMetalPriceSchema = z.object({
  materialId: z.string().uuid().optional(),
  category: z.enum([
    "BATTERIES",
    "COPPER",
    "ALUMINUM",
    "STEEL",
    "BRASS",
    "MIXED",
    "OTHER",
  ]),
  effectiveDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  pricePerKg: z.number().min(0),
  currency: z.string().trim().min(1).max(10).optional(),
  note: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const materialId = searchParams.get("materialId");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (category) where.category = category;
    if (materialId) where.materialId = materialId;

    const [prices, total] = await Promise.all([
      prisma.scrapMetalPrice.findMany({
        where,
        include: {
          material: {
            select: { id: true, code: true, name: true, category: true },
          },
        },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.scrapMetalPrice.count({ where }),
    ]);

    return successResponse(paginationResponse(prices, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/pricing error:", error);
    return errorResponse("Failed to fetch scrap metal prices");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = scrapMetalPriceSchema.parse(body);

    const effectiveDate = new Date(validated.effectiveDate);
    const currency = validated.currency?.trim().toUpperCase() || "USD";
    const material = validated.materialId
      ? await prisma.scrapMaterial.findFirst({
          where: {
            id: validated.materialId,
            companyId: session.user.companyId,
          },
          select: { id: true, category: true },
        })
      : null;

    if (validated.materialId && !material) {
      return errorResponse("Invalid material", 404);
    }
    if (material && material.category !== validated.category) {
      return errorResponse("Material category does not match the selected category", 400);
    }

    // Check for duplicate
    const existing = await prisma.scrapMetalPrice.findFirst({
      where: {
        companyId: session.user.companyId,
        materialId: validated.materialId ?? null,
        category: validated.category,
        effectiveDate,
      },
    });

    if (existing) {
      return errorResponse(
        "A price already exists for this category and effective date",
        409
      );
    }

    const price = await prisma.scrapMetalPrice.create({
      data: {
        companyId: session.user.companyId,
        materialId: validated.materialId ?? undefined,
        category: validated.category,
        effectiveDate,
        pricePerKg: validated.pricePerKg,
        currency,
        note: validated.note?.trim() || undefined,
        createdById: session.user.id,
      },
      include: {
        material: {
          select: { id: true, code: true, name: true, category: true },
        },
      },
    });

    return successResponse(price, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/scrap-metal/pricing error:", error);
    return errorResponse("Failed to create scrap metal price");
  }
}
