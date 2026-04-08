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

const scopeEnum = z.enum(["INBOUND", "OUTBOUND", "BOTH"]);

const complianceRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scope: scopeEnum.default("BOTH"),
  materialId: z.string().uuid().nullable().optional(),
  category: z.enum(["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"]).nullable().optional(),
  requirePhotos: z.boolean().optional(),
  requirePaymentMethod: z.boolean().optional(),
  requirePaymentReference: z.boolean().optional(),
  requireNotes: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { page, limit, skip } = getPaginationParams(request);
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active") !== "false";

    const where = {
      companyId: session.user.companyId,
      ...(activeOnly ? { isActive: true } : {}),
    };

    const [rules, total] = await Promise.all([
      prisma.scrapTicketComplianceRule.findMany({
        where,
        include: {
          material: { select: { id: true, code: true, name: true, category: true } },
        },
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        skip,
        take: limit,
      }),
      prisma.scrapTicketComplianceRule.count({ where }),
    ]);

    return successResponse(paginationResponse(rules, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/compliance-rules error:", error);
    return errorResponse("Failed to fetch scrap compliance rules");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = complianceRuleSchema.parse(body);

    if (validated.materialId) {
      const material = await prisma.scrapMaterial.findFirst({
        where: { id: validated.materialId, companyId: session.user.companyId },
        select: { id: true, category: true, isActive: true },
      });
      if (!material) return errorResponse("Material not found", 404);
      if (!material.isActive) return errorResponse("Material is inactive", 400);
      if (validated.category && validated.category !== material.category) {
        return errorResponse("Category does not match selected material", 400);
      }
    }

    const created = await prisma.scrapTicketComplianceRule.create({
      data: {
        companyId: session.user.companyId,
        name: validated.name,
        scope: validated.scope,
        materialId: validated.materialId ?? null,
        category: validated.category ?? null,
        requirePhotos: validated.requirePhotos ?? false,
        requirePaymentMethod: validated.requirePaymentMethod ?? false,
        requirePaymentReference: validated.requirePaymentReference ?? false,
        requireNotes: validated.requireNotes ?? false,
        isActive: validated.isActive ?? true,
        createdById: session.user.id,
      },
      include: {
        material: { select: { id: true, code: true, name: true, category: true } },
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/scrap-metal/compliance-rules error:", error);
    return errorResponse("Failed to create scrap compliance rule");
  }
}
