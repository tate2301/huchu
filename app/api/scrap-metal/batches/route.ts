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
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";

const scrapMetalBatchSchema = z.object({
  batchNumber: z.string().min(1).max(50).optional(),
  siteId: z.string().uuid(),
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
  collectionStartDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  notes: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const category = searchParams.get("category");
    const materialId = searchParams.get("materialId");
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (siteId) where.siteId = siteId;
    if (category) where.category = category;
    if (materialId) where.materialId = materialId;
    if (status) where.status = status;

    const [batches, total] = await Promise.all([
      prisma.scrapMetalBatch.findMany({
        where,
        include: {
          site: { select: { id: true, name: true, code: true } },
          material: { select: { id: true, code: true, name: true, category: true } },
          createdBy: { select: { id: true, name: true } },
          _count: {
            select: { items: true },
          },
        },
        orderBy: [{ collectionStartDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.scrapMetalBatch.count({ where }),
    ]);

    return successResponse(paginationResponse(batches, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/batches error:", error);
    return errorResponse("Failed to fetch scrap metal batches");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = scrapMetalBatchSchema.parse(body);

    const [site, material] = await Promise.all([
      prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { id: true, companyId: true, isActive: true },
      }),
      validated.materialId
        ? prisma.scrapMaterial.findFirst({
            where: {
              id: validated.materialId,
              companyId: session.user.companyId,
            },
            select: { id: true, category: true, isActive: true },
          })
        : Promise.resolve(null),
    ]);

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403);
    }
    if (!site.isActive) {
      return errorResponse("Site is not active", 400);
    }
    if (validated.materialId && !material) {
      return errorResponse("Invalid material", 404);
    }
    if (material && !material.isActive) {
      return errorResponse("Material is inactive", 400);
    }
    if (material && material.category !== validated.category) {
      return errorResponse("Material category does not match the selected category", 400);
    }

    const batchNumber = validated.batchNumber
      ? normalizeProvidedId(validated.batchNumber, "SCRAP_METAL_BATCH")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "SCRAP_METAL_BATCH",
        });

    const existingBatchNumber = await prisma.scrapMetalBatch.findFirst({
      where: {
        companyId: session.user.companyId,
        batchNumber,
      },
      select: { id: true },
    });

    if (existingBatchNumber) {
      return errorResponse("Batch number already exists", 409);
    }

    const batch = await prisma.scrapMetalBatch.create({
      data: {
        companyId: session.user.companyId,
        siteId: validated.siteId,
        materialId: validated.materialId,
        batchNumber,
        category: validated.category,
        status: "COLLECTING",
        collectionStartDate: new Date(validated.collectionStartDate),
        notes: validated.notes?.trim() || undefined,
        createdById: session.user.id,
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
        material: { select: { id: true, code: true, name: true, category: true } },
        createdBy: { select: { id: true, name: true } },
        _count: {
          select: { items: true },
        },
      },
    });

    return successResponse(batch, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/scrap-metal/batches error:", error);
    return errorResponse("Failed to create scrap metal batch");
  }
}
