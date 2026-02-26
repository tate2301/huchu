import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(1).max(200),
  appliesTo: z.enum(["SALES", "PURCHASE", "BOTH"]).optional(),
  priority: z.number().int().min(1).max(1000).optional(),
  taxCategoryId: z.string().uuid().optional().nullable(),
  templateId: z.string().uuid(),
  currency: z.string().max(10).optional().nullable(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const rows = await prisma.taxRule.findMany({
      where: { companyId: session.user.companyId },
      include: {
        taxCategory: { select: { id: true, code: true, name: true } },
        template: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    return successResponse(rows);
  } catch (error) {
    console.error("[API] GET /api/accounting/tax/rules error:", error);
    return errorResponse("Failed to fetch tax rules");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = schema.parse(body);

    const row = await prisma.taxRule.create({
      data: {
        companyId: session.user.companyId,
        name: validated.name,
        appliesTo: validated.appliesTo ?? "BOTH",
        priority: validated.priority ?? 100,
        taxCategoryId: validated.taxCategoryId ?? null,
        templateId: validated.templateId,
        currency: validated.currency ?? null,
        effectiveFrom: validated.effectiveFrom ? new Date(validated.effectiveFrom) : null,
        effectiveTo: validated.effectiveTo ? new Date(validated.effectiveTo) : null,
        isActive: validated.isActive ?? true,
      },
      include: {
        taxCategory: { select: { id: true, code: true, name: true } },
        template: { select: { id: true, code: true, name: true } },
      },
    });

    return successResponse(row, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/tax/rules error:", error);
    return errorResponse("Failed to create tax rule");
  }
}
