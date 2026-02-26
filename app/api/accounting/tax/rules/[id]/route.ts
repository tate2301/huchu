import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(1).max(200).optional(),
  appliesTo: z.enum(["SALES", "PURCHASE", "BOTH"]).optional(),
  priority: z.number().int().min(1).max(1000).optional(),
  taxCategoryId: z.string().uuid().optional().nullable(),
  templateId: z.string().uuid().optional(),
  currency: z.string().max(10).optional().nullable(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.taxRule.findUnique({ where: { id }, select: { companyId: true } });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Tax rule not found", 404);
    }

    const body = await request.json();
    const validated = schema.parse(body);

    const updated = await prisma.taxRule.update({
      where: { id },
      data: {
        ...validated,
        effectiveFrom:
          validated.effectiveFrom !== undefined
            ? validated.effectiveFrom
              ? new Date(validated.effectiveFrom)
              : null
            : undefined,
        effectiveTo:
          validated.effectiveTo !== undefined
            ? validated.effectiveTo
              ? new Date(validated.effectiveTo)
              : null
            : undefined,
      },
      include: {
        taxCategory: { select: { id: true, code: true, name: true } },
        template: { select: { id: true, code: true, name: true } },
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/tax/rules/[id] error:", error);
    return errorResponse("Failed to update tax rule");
  }
}
