import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  address: z.string().max(300).optional(),
  taxNumber: z.string().max(100).optional(),
  vatNumber: z.string().max(100).optional(),
  taxCategoryId: z.string().uuid().optional().nullable(),
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

    const existing = await prisma.vendor.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Vendor not found", 404);
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: validated,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/purchases/vendors/[id] error:", error);
    return errorResponse("Failed to update vendor");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.vendor.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Vendor not found", 404);
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: { isActive: false },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("[API] DELETE /api/accounting/purchases/vendors/[id] error:", error);
    return errorResponse("Failed to deactivate vendor");
  }
}
