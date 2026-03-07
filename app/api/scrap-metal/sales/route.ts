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
import { hasRole } from "@/lib/roles";

const scrapMetalSaleSchema = z.object({
  saleNumber: z.string().min(1).max(50).optional(),
  saleDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  siteId: z.string().uuid(),
  batchId: z.string().uuid(),
  buyerName: z.string().min(1).max(200),
  buyerContact: z.string().max(100).optional(),
  recordedWeight: z.number().positive(),
  soldWeight: z.number().positive(),
  pricePerKg: z.number().min(0),
  currency: z.string().trim().min(1).max(10).optional(),
  paymentMethod: z.string().max(100).optional(),
  paymentReference: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (siteId) where.siteId = siteId;
    if (status) where.status = status;

    const [sales, total] = await Promise.all([
      prisma.scrapMetalSale.findMany({
        where,
        include: {
          site: { select: { id: true, name: true, code: true } },
          batch: {
            select: {
              id: true,
              batchNumber: true,
              category: true,
              totalWeight: true,
            },
          },
          approvedBy: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.scrapMetalSale.count({ where }),
    ]);

    return successResponse(paginationResponse(sales, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/sales error:", error);
    return errorResponse("Failed to fetch scrap metal sales");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // Only managers and superusers can create sales
    if (!hasRole(session.user.role, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse(
        "Only managers and superusers can create sales",
        403
      );
    }

    const body = await request.json();
    const validated = scrapMetalSaleSchema.parse(body);

    const [site, batch] = await Promise.all([
      prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { id: true, companyId: true, isActive: true },
      }),
      prisma.scrapMetalBatch.findUnique({
        where: { id: validated.batchId },
        select: {
          id: true,
          companyId: true,
          siteId: true,
          category: true,
          status: true,
          totalWeight: true,
        },
      }),
    ]);

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403);
    }
    if (!site.isActive) {
      return errorResponse("Site is not active", 400);
    }

    if (!batch || batch.companyId !== session.user.companyId) {
      return errorResponse("Batch not found", 404);
    }

    if (batch.status !== "READY" && batch.status !== "COLLECTING") {
      return errorResponse(
        "Batch must be in READY or COLLECTING status to create a sale",
        400
      );
    }

    if (batch.siteId !== validated.siteId) {
      return errorResponse("Batch and sale must be at the same site", 400);
    }

    const saleNumber = validated.saleNumber
      ? normalizeProvidedId(validated.saleNumber, "SCRAP_METAL_SALE")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "SCRAP_METAL_SALE",
        });

    const existingSaleNumber = await prisma.scrapMetalSale.findFirst({
      where: {
        companyId: session.user.companyId,
        saleNumber,
      },
      select: { id: true },
    });

    if (existingSaleNumber) {
      return errorResponse("Sale number already exists", 409);
    }

    const weightDiscrepancy = validated.recordedWeight - validated.soldWeight;
    const totalAmount = validated.soldWeight * validated.pricePerKg;
    const saleDate = new Date(validated.saleDate);
    const currency = validated.currency?.trim().toUpperCase() || "USD";

    const sale = await prisma.$transaction(async (tx) => {
      // Create sale
      const newSale = await tx.scrapMetalSale.create({
        data: {
          companyId: session.user.companyId,
          siteId: validated.siteId,
          batchId: validated.batchId,
          saleNumber,
          saleDate,
          buyerName: validated.buyerName.trim(),
          buyerContact: validated.buyerContact?.trim() || undefined,
          recordedWeight: validated.recordedWeight,
          soldWeight: validated.soldWeight,
          weightDiscrepancy,
          pricePerKg: validated.pricePerKg,
          totalAmount,
          currency,
          paymentMethod: validated.paymentMethod?.trim() || undefined,
          paymentReference: validated.paymentReference?.trim() || undefined,
          status: "PENDING_APPROVAL",
          notes: validated.notes?.trim() || undefined,
          createdById: session.user.id,
        },
        include: {
          site: { select: { id: true, name: true, code: true } },
          batch: {
            select: {
              id: true,
              batchNumber: true,
              category: true,
              totalWeight: true,
            },
          },
          approvedBy: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      // Update batch status to SOLD (pending approval)
      await tx.scrapMetalBatch.update({
        where: { id: validated.batchId },
        data: {
          status: "SOLD",
          collectionEndDate: saleDate,
        },
      });

      return newSale;
    });

    return successResponse(sale, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/scrap-metal/sales error:", error);
    return errorResponse("Failed to create scrap metal sale");
  }
}
