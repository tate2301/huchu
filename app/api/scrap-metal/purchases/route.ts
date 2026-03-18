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
import { captureAccountingEvent } from "@/lib/accounting/integration";

const scrapMetalPurchaseSchema = z.object({
  purchaseNumber: z.string().min(1).max(50).optional(),
  purchaseDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  siteId: z.string().uuid(),
  employeeId: z.string().uuid(),
  sellerProfileId: z.string().uuid(),
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
  weight: z.number().positive(),
  pricePerKg: z.number().min(0),
  currency: z.string().trim().min(1).max(10).optional(),
  sellerName: z.string().max(200).optional(),
  sellerPhone: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const employeeId = searchParams.get("employeeId");
    const category = searchParams.get("category");
    const materialId = searchParams.get("materialId");
    const unbatched = searchParams.get("unbatched") === "true";
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (siteId) where.siteId = siteId;
    if (employeeId) where.employeeId = employeeId;
    if (category) where.category = category;
    if (materialId) where.materialId = materialId;
    if (unbatched) where.batchItems = { none: {} };

    const [purchases, total] = await Promise.all([
      prisma.scrapMetalPurchase.findMany({
        where,
        include: {
          site: { select: { id: true, name: true, code: true } },
          employee: { select: { id: true, name: true, employeeId: true } },
          sellerProfile: { select: { id: true, fullName: true, phone: true, nationalId: true } },
          material: { select: { id: true, code: true, name: true, category: true } },
          batchItems: { select: { batchId: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.scrapMetalPurchase.count({ where }),
    ]);

    return successResponse(paginationResponse(purchases, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/purchases error:", error);
    return errorResponse("Failed to fetch scrap metal purchases");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = scrapMetalPurchaseSchema.parse(body);

    const [site, employee, sellerProfile, material] = await Promise.all([
      prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { id: true, companyId: true, isActive: true },
      }),
      prisma.employee.findUnique({
        where: { id: validated.employeeId },
        select: { id: true, companyId: true, isActive: true },
      }),
      prisma.scrapSellerProfile.findFirst({
        where: {
          id: validated.sellerProfileId,
          companyId: session.user.companyId,
        },
        select: { id: true, fullName: true, phone: true, isActive: true },
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

    if (!employee || employee.companyId !== session.user.companyId || !employee.isActive) {
      return errorResponse("Invalid employee", 400);
    }
    if (!sellerProfile) {
      return errorResponse("Invalid seller profile", 404);
    }
    if (!sellerProfile.isActive) {
      return errorResponse("Seller profile is inactive", 400);
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

    const purchaseDate = new Date(validated.purchaseDate);
    const currentPrice = await prisma.scrapMetalPrice.findFirst({
      where: {
        companyId: session.user.companyId,
        category: validated.category,
        materialId: validated.materialId ?? null,
        effectiveDate: {
          lte: purchaseDate,
        },
      },
      orderBy: { effectiveDate: "desc" },
      select: { pricePerKg: true },
    }) ?? await prisma.scrapMetalPrice.findFirst({
      where: {
        companyId: session.user.companyId,
        category: validated.category,
        materialId: null,
        effectiveDate: {
          lte: purchaseDate,
        },
      },
      orderBy: { effectiveDate: "desc" },
      select: { pricePerKg: true },
    });

    if (!currentPrice) {
      return errorResponse(
        `No price configured for ${validated.category}. Add a price before recording purchases.`,
        409
      );
    }

    const purchaseNumber = validated.purchaseNumber
      ? normalizeProvidedId(validated.purchaseNumber, "SCRAP_METAL_PURCHASE")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "SCRAP_METAL_PURCHASE",
          siteId: validated.siteId,
        });

    const existingPurchaseNumber = await prisma.scrapMetalPurchase.findFirst({
      where: {
        companyId: session.user.companyId,
        purchaseNumber,
      },
      select: { id: true },
    });

    if (existingPurchaseNumber) {
      return errorResponse("Purchase number already exists", 409);
    }

    const totalAmount = validated.weight * validated.pricePerKg;
    const currency = validated.currency?.trim().toUpperCase() || "USD";

    const purchase = await prisma.$transaction(async (tx) => {
      // Create purchase
      const newPurchase = await tx.scrapMetalPurchase.create({
        data: {
          companyId: session.user.companyId,
          siteId: validated.siteId,
          purchaseNumber,
          purchaseDate,
          employeeId: validated.employeeId,
          sellerProfileId: validated.sellerProfileId,
          materialId: validated.materialId,
          category: validated.category,
          weight: validated.weight,
          pricePerKg: validated.pricePerKg,
          totalAmount,
          currency,
          sellerName: sellerProfile.fullName,
          sellerPhone: sellerProfile.phone,
          notes: validated.notes?.trim() || undefined,
          createdById: session.user.id,
        },
        include: {
          site: { select: { id: true, name: true, code: true } },
          employee: { select: { id: true, name: true, employeeId: true } },
          sellerProfile: { select: { id: true, fullName: true, phone: true, nationalId: true } },
          material: { select: { id: true, code: true, name: true, category: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      // Update employee balance (positive = employee owes company)
      await tx.scrapMetalEmployeeBalance.upsert({
        where: {
          companyId_employeeId: {
            companyId: session.user.companyId,
            employeeId: validated.employeeId,
          },
        },
        create: {
          companyId: session.user.companyId,
          employeeId: validated.employeeId,
          balance: totalAmount,
        },
        update: {
          balance: {
            increment: totalAmount,
          },
        },
      });

      return newPurchase;
    });

    // Capture accounting event
    try {
      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "scrap-metal",
        sourceAction: "purchase",
        sourceType: "SCRAP_METAL_PURCHASE",
        sourceId: purchase.id,
        entryDate: purchase.purchaseDate,
        description: `Scrap metal purchase ${purchase.purchaseNumber} - ${validated.category}`,
        amount: purchase.totalAmount,
        netAmount: purchase.totalAmount,
        taxAmount: 0,
        grossAmount: purchase.totalAmount,
        currency: purchase.currency,
        createdById: session.user.id,
        payload: {
          category: validated.category,
          weight: validated.weight,
          pricePerKg: validated.pricePerKg,
          employeeId: validated.employeeId,
        },
      });
    } catch (error) {
      console.error("[Accounting] Scrap metal purchase event failed:", error);
    }

    return successResponse(purchase, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/scrap-metal/purchases error:", error);
    return errorResponse("Failed to create scrap metal purchase");
  }
}
