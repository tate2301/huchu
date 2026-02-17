import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  rate: z.number().positive().optional(),
  effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
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

    const existing = await prisma.currencyRate.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Currency rate not found", 404);
    }

    const updated = await prisma.currencyRate.update({
      where: { id },
      data: {
        rate: validated.rate,
        effectiveDate: validated.effectiveDate ? new Date(validated.effectiveDate) : undefined,
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/currency/[id] error:", error);
    return errorResponse("Failed to update currency rate");
  }
}
