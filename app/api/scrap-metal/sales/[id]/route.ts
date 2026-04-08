import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  parseScrapTicketPhotosJson,
  scrapTicketPhotoArraySchema,
  serializeScrapTicketPhotos,
} from "@/lib/scrap-metal/attachments";
import { hasRole } from "@/lib/roles";
import { resolveScrapTicketComplianceRequirements } from "@/lib/scrap-metal/compliance-rules";
import { validateScrapTicketCompliance } from "@/lib/scrap-metal/compliance-validation";

const saleTicketPhotoArraySchema = scrapTicketPhotoArraySchema.refine(
  (items) => items.every((item) => item.context === "scrap-sale-ticket-photo"),
  "Only sale ticket photo attachments are allowed",
);

const saleUpdateSchema = z.object({
  saleDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/))
    .optional(),
  materialId: z.string().uuid().nullable().optional(),
  buyerName: z.string().min(1).max(200).optional(),
  buyerContact: z.string().max(100).nullable().optional(),
  recordedWeight: z.number().positive().optional(),
  soldWeight: z.number().positive().optional(),
  pricePerKg: z.number().min(0).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  paymentMethod: z.string().max(100).nullable().optional(),
  paymentReference: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  attachments: saleTicketPhotoArraySchema.nullable().optional(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "COMPLETED", "CANCELLED"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await context.params;

    const canManageSales = hasRole(session.user.role, ["SUPERADMIN", "MANAGER"]);

    const existing = await prisma.scrapMetalSale.findFirst({
      where: { id, companyId: session.user.companyId },
      select: {
        id: true,
        status: true,
        soldWeight: true,
        pricePerKg: true,
        recordedWeight: true,
        materialId: true,
        paymentMethod: true,
        paymentReference: true,
        notes: true,
        attachmentsJson: true,
        batch: { select: { category: true } },
      },
    });
    if (!existing) return errorResponse("Sale not found", 404);
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      return errorResponse("Completed or cancelled sales cannot be edited", 400);
    }

    const body = await request.json();
    const validated = saleUpdateSchema.parse(body);

    if (!canManageSales) {
      if (validated.status && validated.status !== "DRAFT") {
        return errorResponse("Only managers can submit or approve outbound tickets", 403);
      }
      if (existing.status !== "DRAFT") {
        return errorResponse("Only draft outbound tickets can be edited by clerks", 403);
      }
    }
    if (validated.materialId) {
      const material = await prisma.scrapMaterial.findFirst({
        where: { id: validated.materialId, companyId: session.user.companyId },
        select: { id: true, category: true, isActive: true },
      });
      if (!material) return errorResponse("Invalid material", 404);
      if (!material.isActive) return errorResponse("Material is inactive", 400);
      if (material.category !== existing.batch.category) {
        return errorResponse("Material category must match the batch category", 400);
      }
    }

    const recordedWeight = validated.recordedWeight ?? existing.recordedWeight;
    const soldWeight = validated.soldWeight ?? existing.soldWeight;
    const pricePerKg = validated.pricePerKg ?? existing.pricePerKg;
    const nextStatus = validated.status ?? existing.status;
    const nextMaterialId =
      validated.materialId === undefined ? existing.materialId : validated.materialId;
    const nextAttachments =
      validated.attachments === undefined
        ? parseScrapTicketPhotosJson(existing.attachmentsJson)
        : validated.attachments ?? [];
    const nextPaymentMethod = validated.paymentMethod === undefined ? existing.paymentMethod : validated.paymentMethod;
    const nextPaymentReference =
      validated.paymentReference === undefined ? existing.paymentReference : validated.paymentReference;
    const nextNotes = validated.notes === undefined ? existing.notes : validated.notes;

    if (nextStatus !== "DRAFT") {
      const requirements = await resolveScrapTicketComplianceRequirements(prisma, {
        companyId: session.user.companyId,
        direction: "OUTBOUND",
        materialId: nextMaterialId,
        category: existing.batch.category,
      });
      const complianceErrors = validateScrapTicketCompliance({
        requirements,
        attachmentsCount: nextAttachments.length,
        paymentMethod: nextPaymentMethod,
        paymentReference: nextPaymentReference,
        notes: nextNotes,
      });
      if (complianceErrors.length > 0) {
        return errorResponse("Compliance requirements not met", 409, complianceErrors);
      }
    }

    const sale = await prisma.scrapMetalSale.update({
      where: { id },
      data: {
        saleDate: validated.saleDate ? new Date(validated.saleDate) : undefined,
        materialId: validated.materialId === null ? null : validated.materialId,
        buyerName: validated.buyerName,
        buyerContact: validated.buyerContact === null ? null : validated.buyerContact,
        recordedWeight: validated.recordedWeight,
        soldWeight: validated.soldWeight,
        weightDiscrepancy: recordedWeight - soldWeight,
        pricePerKg: validated.pricePerKg,
        totalAmount: soldWeight * pricePerKg,
        currency: validated.currency?.trim().toUpperCase(),
        paymentMethod: validated.paymentMethod === null ? null : validated.paymentMethod,
        paymentReference:
          validated.paymentReference === null ? null : validated.paymentReference,
        notes: validated.notes === null ? null : validated.notes,
        status: validated.status,
        attachmentsJson:
          validated.attachments === undefined
            ? undefined
            : serializeScrapTicketPhotos(validated.attachments),
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
        material: { select: { id: true, code: true, name: true, category: true } },
        approvedBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return successResponse({
      ...sale,
      attachments: parseScrapTicketPhotosJson(sale.attachmentsJson),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/scrap-metal/sales/[id] error:", error);
    return errorResponse("Failed to update scrap sale");
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await context.params;

    const sale = await prisma.scrapMetalSale.findFirst({
      where: { id, companyId: session.user.companyId },
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
        material: { select: { id: true, code: true, name: true, category: true } },
        approvedBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!sale) return errorResponse("Sale not found", 404);
    return successResponse({
      ...sale,
      attachments: parseScrapTicketPhotosJson(sale.attachmentsJson),
    });
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/sales/[id] error:", error);
    return errorResponse("Failed to load scrap sale");
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await context.params;

    const existing = await prisma.scrapMetalSale.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, status: true },
    });
    if (!existing) return errorResponse("Sale not found", 404);
    if (existing.status === "APPROVED" || existing.status === "COMPLETED") {
      return errorResponse("Approved or completed sales cannot be deleted", 409);
    }

    await prisma.scrapMetalSale.delete({ where: { id } });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/scrap-metal/sales/[id] error:", error);
    return errorResponse("Failed to remove scrap sale");
  }
}
