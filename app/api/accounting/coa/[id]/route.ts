import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(200).optional(),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]).optional(),
  category: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const account = await prisma.chartOfAccount.findUnique({
      where: { id },
    });

    if (!account || account.companyId !== session.user.companyId) {
      return errorResponse("Account not found", 404);
    }

    return successResponse(account);
  } catch (error) {
    console.error("[API] GET /api/accounting/coa/[id] error:", error);
    return errorResponse("Failed to fetch account");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const body = await request.json();
    const validated = updateSchema.parse(body);

    const account = await prisma.chartOfAccount.findUnique({
      where: { id },
      select: { companyId: true, systemManaged: true },
    });
    if (!account || account.companyId !== session.user.companyId) {
      return errorResponse("Account not found", 404);
    }

    if (account.systemManaged && validated.code) {
      return errorResponse("System-managed account codes cannot be changed", 400);
    }

    const updated = await prisma.chartOfAccount.update({
      where: { id },
      data: validated,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/coa/[id] error:", error);
    return errorResponse("Failed to update account");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const account = await prisma.chartOfAccount.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!account || account.companyId !== session.user.companyId) {
      return errorResponse("Account not found", 404);
    }

    const updated = await prisma.chartOfAccount.update({
      where: { id },
      data: { isActive: false },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("[API] DELETE /api/accounting/coa/[id] error:", error);
    return errorResponse("Failed to deactivate account");
  }
}
