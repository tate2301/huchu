import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const reconcileSchema = z.object({
  reconciliationId: z.string().uuid(),
  transactionIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = reconcileSchema.parse(body);

    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: validated.reconciliationId },
      select: { id: true, companyId: true, bankAccountId: true, status: true },
    });

    if (!reconciliation || reconciliation.companyId !== session.user.companyId) {
      return errorResponse("Reconciliation not found", 404);
    }

    if (reconciliation.status !== "OPEN") {
      return errorResponse("Only open reconciliations can be updated", 400);
    }

    const result = await prisma.bankTransaction.updateMany({
      where: {
        id: { in: validated.transactionIds },
        companyId: session.user.companyId,
        bankAccountId: reconciliation.bankAccountId,
      },
      data: {
        reconciliationId: reconciliation.id,
        reconciledAt: new Date(),
      },
    });

    return successResponse({ updated: result.count });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/banking/reconcile error:", error);
    return errorResponse("Failed to reconcile transactions");
  }
}
