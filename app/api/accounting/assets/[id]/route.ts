import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().max(100).optional(),
  acquisitionDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  cost: z.number().min(0).optional(),
  salvageValue: z.number().min(0).optional(),
  usefulLifeMonths: z.number().int().min(1).optional(),
  depreciationMethod: z.enum(["STRAIGHT_LINE"]).optional(),
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

    const existing = await prisma.fixedAsset.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Asset not found", 404);
    }

    const updated = await prisma.fixedAsset.update({
      where: { id },
      data: {
        ...validated,
        acquisitionDate: validated.acquisitionDate ? new Date(validated.acquisitionDate) : undefined,
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/assets/[id] error:", error);
    return errorResponse("Failed to update asset");
  }
}
