import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ensureApproverRole } from "@/lib/hr-payroll";
import { prisma } from "@/lib/prisma";

const updateGoldPriceSchema = z.object({
  effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  priceUsdPerGram: z.number().positive().optional(),
  note: z.string().max(1000).nullable().optional(),
});

function toDateOnly(input: string) {
  const date = new Date(input);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to manage gold prices", 403);
    }

    const { id } = await params;
    const body = await request.json();
    const validated = updateGoldPriceSchema.parse(body);
    if (Object.keys(validated).length === 0) {
      return errorResponse("No fields provided", 400);
    }

    const existing = await prisma.goldPrice.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Gold price not found", 404);
    }

    const effectiveDate =
      validated.effectiveDate !== undefined ? toDateOnly(validated.effectiveDate) : undefined;

    if (effectiveDate) {
      const duplicate = await prisma.goldPrice.findUnique({
        where: {
          companyId_effectiveDate: {
            companyId: session.user.companyId,
            effectiveDate,
          },
        },
        select: { id: true },
      });
      if (duplicate && duplicate.id !== id) {
        return errorResponse("Another gold price already exists for this effective date", 409);
      }
    }

    const updated = await prisma.goldPrice.update({
      where: { id },
      data: {
        effectiveDate,
        priceUsdPerGram: validated.priceUsdPerGram,
        note:
          validated.note !== undefined
            ? (validated.note?.trim() || null)
            : undefined,
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/gold/prices/[id] error:", error);
    return errorResponse("Failed to update gold price");
  }
}

