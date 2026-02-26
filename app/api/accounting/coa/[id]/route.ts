import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { validateParentAccount } from "@/lib/accounting/chart-of-accounts";

const updateSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(200).optional(),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]).optional(),
  nodeType: z.enum(["GROUP", "LEDGER"]).optional(),
  parentAccountId: z.string().uuid().nullable().optional(),
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

    if (validated.code !== undefined) {
      return errorResponse("Account code is immutable and cannot be changed", 400);
    }

    const account = await prisma.chartOfAccount.findUnique({
      where: { id },
      select: {
        companyId: true,
        systemManaged: true,
        type: true,
        nodeType: true,
        parentAccountId: true,
      },
    });
    if (!account || account.companyId !== session.user.companyId) {
      return errorResponse("Account not found", 404);
    }

    if (validated.nodeType === "LEDGER") {
      const hasChildren = await prisma.chartOfAccount.count({
        where: {
          companyId: session.user.companyId,
          parentAccountId: id,
          isActive: true,
        },
      });
      if (hasChildren > 0) {
        return errorResponse("Cannot convert account to LEDGER while it has child accounts", 400);
      }
    }

    const resolvedType = validated.type ?? account.type;
    const resolvedParentAccountId =
      validated.parentAccountId !== undefined ? validated.parentAccountId : account.parentAccountId;
    const parentMeta =
      resolvedParentAccountId !== undefined
        ? resolvedParentAccountId
          ? await validateParentAccount({
              companyId: session.user.companyId,
              parentAccountId: resolvedParentAccountId,
              accountType: resolvedType,
              accountId: id,
            })
          : { hierarchyPath: null as string | null, level: 0 }
        : null;

    const updated = await prisma.chartOfAccount.update({
      where: { id },
      data: {
        ...validated,
        hierarchyPath: parentMeta ? parentMeta.hierarchyPath : undefined,
        level: parentMeta ? parentMeta.level : undefined,
      },
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

    const hasActiveChildren = await prisma.chartOfAccount.count({
      where: {
        companyId: session.user.companyId,
        parentAccountId: id,
        isActive: true,
      },
    });
    if (hasActiveChildren > 0) {
      return errorResponse("Deactivate child accounts before deactivating a parent account", 400);
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
