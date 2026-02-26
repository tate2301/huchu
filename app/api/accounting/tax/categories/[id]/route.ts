import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(1).max(200).optional(),
  scope: z.enum(["CUSTOMER", "VENDOR", "BOTH"]).optional(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.taxCategory.findUnique({ where: { id }, select: { companyId: true } });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Tax category not found", 404);
    }

    const body = await request.json();
    const validated = schema.parse(body);

    const updated = await prisma.taxCategory.update({
      where: { id },
      data: validated,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/tax/categories/[id] error:", error);
    return errorResponse("Failed to update tax category");
  }
}
