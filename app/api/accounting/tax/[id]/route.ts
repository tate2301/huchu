import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  rate: z.number().min(0).max(100).optional(),
  type: z.string().max(50).optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const body = await request.json();
    const validated = updateSchema.parse(body);

    const existing = await prisma.taxCode.findUnique({
      where: { id },
      select: { companyId: true },
    });

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Tax code not found", 404);
    }

    const updated = await prisma.taxCode.update({
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
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/tax/[id] error:", error);
    return errorResponse("Failed to update tax code");
  }
}
