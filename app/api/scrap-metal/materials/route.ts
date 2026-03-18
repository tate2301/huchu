import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";

const materialSchema = z.object({
  code: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(120),
  category: z.enum([
    "BATTERIES",
    "COPPER",
    "ALUMINUM",
    "STEEL",
    "BRASS",
    "MIXED",
    "OTHER",
  ]),
  defaultPricePerKg: z.number().min(0),
  currency: z.string().trim().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const active = searchParams.get("active");
    const search = searchParams.get("search")?.trim();
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };
    if (category) where.category = category;
    if (active === "true") where.isActive = true;
    if (active === "false") where.isActive = false;
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    const [materials, total] = await Promise.all([
      prisma.scrapMaterial.findMany({
        where,
        include: {
          _count: {
            select: {
              prices: true,
              purchases: true,
              batches: true,
              sales: true,
            },
          },
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.scrapMaterial.count({ where }),
    ]);

    return successResponse(paginationResponse(materials, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/materials error:", error);
    return errorResponse("Failed to fetch scrap materials");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = materialSchema.parse(body);
    const code = validated.code
      ? normalizeProvidedId(validated.code, "SCRAP_MATERIAL")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "SCRAP_MATERIAL",
        });
    const currency = validated.currency?.trim().toUpperCase() || "USD";

    const existing = await prisma.scrapMaterial.findFirst({
      where: {
        companyId: session.user.companyId,
        code,
      },
      select: { id: true },
    });

    if (existing) {
      return errorResponse("Material code already exists", 409);
    }

    const material = await prisma.scrapMaterial.create({
      data: {
        companyId: session.user.companyId,
        code,
        name: validated.name,
        category: validated.category,
        defaultPricePerKg: validated.defaultPricePerKg,
        currency,
        isActive: validated.isActive ?? true,
        notes: validated.notes || undefined,
      },
      include: {
        _count: {
          select: {
            prices: true,
            purchases: true,
            batches: true,
            sales: true,
          },
        },
      },
    });

    return successResponse(material, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/scrap-metal/materials error:", error);
    return errorResponse("Failed to create scrap material");
  }
}
