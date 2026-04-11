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
import {
  parseScrapTicketPhotosJson,
  scrapTicketPhotoArraySchema,
  serializeScrapTicketPhotos,
} from "@/lib/scrap-metal/attachments";
import { applyScrapBalanceDelta } from "@/lib/scrap-metal";
import { resolveScrapTicketComplianceRequirements } from "@/lib/scrap-metal/compliance-rules";
import { validateScrapTicketCompliance } from "@/lib/scrap-metal/compliance-validation";

const purchaseTicketPhotoArraySchema = scrapTicketPhotoArraySchema.refine(
  (items) => items.every((item) => item.context === "scrap-purchase-ticket-photo"),
  "Only purchase ticket photo attachments are allowed",
);

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
  paymentMethod: z.string().max(100).optional(),
  paymentReference: z.string().max(100).optional(),
  sellerName: z.string().max(200).optional(),
  sellerPhone: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
  attachments: purchaseTicketPhotoArraySchema.optional(),
  status: z.enum(["DRAFT", "POSTED", "CANCELLED", "REVERSED"]).optional(),
});

async function loadPurchaseByNumber(companyId: string, purchaseNumber: string) {
  const purchase = await prisma.scrapMetalPurchase.findFirst({
    where: {
      companyId,
      purchaseNumber,
    },
    include: {
      site: { select: { id: true, name: true, code: true } },
      employee: { select: { id: true, name: true, employeeId: true } },
      sellerProfile: { select: { id: true, fullName: true, phone: true, nationalId: true } },
      material: { select: { id: true, code: true, name: true, category: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!purchase) return null;
  return {
    ...purchase,
    attachments: parseScrapTicketPhotosJson(purchase.attachmentsJson),
  };
}

async function ensurePurchaseAccountingEvent(input: {
  companyId: string;
  createdById: string;
  purchase: {
    id: string;
    purchaseDate: Date;
    purchaseNumber: string;
    totalAmount: number;
    currency: string;
    category: string;
    weight: number;
    pricePerKg: number;
    employeeId: string;
    status: string;
  };
}) {
  if (input.purchase.status !== "POSTED") return;

  try {
    await captureAccountingEvent({
      companyId: input.companyId,
      sourceDomain: "scrap-metal",
      sourceAction: "purchase",
      sourceType: "SCRAP_METAL_PURCHASE",
      sourceId: input.purchase.id,
      entryDate: input.purchase.purchaseDate,
      description: `Scrap metal purchase ${input.purchase.purchaseNumber} - ${input.purchase.category}`,
      amount: input.purchase.totalAmount,
      netAmount: input.purchase.totalAmount,
      taxAmount: 0,
      grossAmount: input.purchase.totalAmount,
      currency: input.purchase.currency,
      createdById: input.createdById,
      payload: {
        category: input.purchase.category,
        weight: input.purchase.weight,
        pricePerKg: input.purchase.pricePerKg,
        employeeId: input.purchase.employeeId,
      },
    });
  } catch (error) {
    console.error("[Accounting] Scrap metal purchase event failed:", error);
  }
}

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
    const status = searchParams.get("status");
    const unbatched = searchParams.get("unbatched") === "true";
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (siteId) where.siteId = siteId;
    if (employeeId) where.employeeId = employeeId;
    if (category) where.category = category;
    if (materialId) where.materialId = materialId;
    if (status) where.status = status;
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

    const normalizedPurchases = purchases.map((purchase) => ({
      ...purchase,
      attachments: parseScrapTicketPhotosJson(purchase.attachmentsJson),
    }));

    return successResponse(paginationResponse(normalizedPurchases, total, page, limit));
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

    const purchaseNumber = validated.purchaseNumber
      ? normalizeProvidedId(validated.purchaseNumber, "SCRAP_METAL_PURCHASE")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "SCRAP_METAL_PURCHASE",
          siteId: validated.siteId,
        });

    const existingPurchase = await loadPurchaseByNumber(session.user.companyId, purchaseNumber);
    if (existingPurchase) {
      await ensurePurchaseAccountingEvent({
        companyId: session.user.companyId,
        createdById: session.user.id,
        purchase: {
          id: existingPurchase.id,
          purchaseDate: existingPurchase.purchaseDate,
          purchaseNumber: existingPurchase.purchaseNumber,
          totalAmount: existingPurchase.totalAmount,
          currency: existingPurchase.currency,
          category: existingPurchase.category,
          weight: existingPurchase.weight,
          pricePerKg: existingPurchase.pricePerKg,
          employeeId: existingPurchase.employeeId,
          status: existingPurchase.status,
        },
      });
      return successResponse(existingPurchase);
    }

    const totalAmount = validated.weight * validated.pricePerKg;
    const currency = validated.currency?.trim().toUpperCase() || "USD";

    const ticketStatus = validated.status ?? "POSTED";
    if (ticketStatus !== "DRAFT") {
      const requirements = await resolveScrapTicketComplianceRequirements(prisma, {
        companyId: session.user.companyId,
        direction: "INBOUND",
        materialId: validated.materialId ?? null,
        category: validated.category,
      });
      const complianceErrors = validateScrapTicketCompliance({
        requirements,
        attachmentsCount: validated.attachments?.length ?? 0,
        paymentMethod: validated.paymentMethod,
        paymentReference: validated.paymentReference,
        notes: validated.notes,
      });
      if (complianceErrors.length > 0) {
        return errorResponse("Compliance requirements not met", 409, complianceErrors);
      }
    }

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
          paymentMethod: validated.paymentMethod?.trim() || undefined,
          paymentReference: validated.paymentReference?.trim() || undefined,
          attachmentsJson: serializeScrapTicketPhotos(validated.attachments),
          sellerName: sellerProfile.fullName,
          sellerPhone: sellerProfile.phone,
          notes: validated.notes?.trim() || undefined,
          status: ticketStatus,
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

      if (ticketStatus === "POSTED") {
        await applyScrapBalanceDelta(tx, {
          companyId: session.user.companyId,
          employeeId: validated.employeeId,
          amountDelta: totalAmount,
          entryType: "PURCHASE",
          sourceId: newPurchase.id,
          note: `Purchase ${newPurchase.purchaseNumber}`,
          createdById: session.user.id,
        });
      }

      return newPurchase;
    });

    await ensurePurchaseAccountingEvent({
      companyId: session.user.companyId,
      createdById: session.user.id,
      purchase: {
        id: purchase.id,
        purchaseDate: purchase.purchaseDate,
        purchaseNumber: purchase.purchaseNumber,
        totalAmount: purchase.totalAmount,
        currency: purchase.currency,
        category: validated.category,
        weight: validated.weight,
        pricePerKg: validated.pricePerKg,
        employeeId: validated.employeeId,
        status: purchase.status,
      },
    });

    return successResponse(
      {
        ...purchase,
        attachments: parseScrapTicketPhotosJson(purchase.attachmentsJson),
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/scrap-metal/purchases error:", error);
    return errorResponse("Failed to create scrap metal purchase");
  }
}
