import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  bankName: z.string().max(200).optional(),
  accountNumber: z.string().max(100).optional(),
  currency: z.string().min(1).max(10).optional(),
  openingBalance: z.number().min(0).optional(),
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

    const existing = await prisma.bankAccount.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Bank account not found", 404);
    }

    const updated = await prisma.bankAccount.update({
      where: { id },
      data: validated,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/banking/accounts/[id] error:", error);
    return errorResponse("Failed to update bank account");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.bankAccount.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Bank account not found", 404);
    }

    const updated = await prisma.bankAccount.update({
      where: { id },
      data: { isActive: false },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("[API] DELETE /api/accounting/banking/accounts/[id] error:", error);
    return errorResponse("Failed to deactivate bank account");
  }
}
