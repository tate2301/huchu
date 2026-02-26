import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { issueFiscalReceipt } from "@/lib/accounting/fiscalisation";
import { hasRole } from "@/lib/roles";

const schema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session.user.role, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to replay fiscal receipts", 403);
    }

    const body = await request.json().catch(() => ({}));
    const validated = schema.parse(body);
    const limit = validated.limit ?? 50;

    const now = new Date();
    const candidates = await prisma.fiscalReceipt.findMany({
      where: {
        companyId: session.user.companyId,
        status: { in: ["FAILED", "PENDING"] },
        invoiceId: { not: null },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: [{ updatedAt: "asc" }],
      take: limit,
      select: { id: true, invoiceId: true },
    });

    let queued = 0;
    let failed = 0;
    for (const receipt of candidates) {
      try {
        const result = await issueFiscalReceipt(session.user.companyId, receipt.invoiceId!, session.user.id);
        if (result.status === "FAILED") {
          failed += 1;
        } else {
          queued += 1;
        }
      } catch {
        failed += 1;
      }
    }

    return successResponse({
      processed: candidates.length,
      queued,
      failed,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/fiscalisation/replay error:", error);
    return errorResponse("Failed to replay fiscal receipts");
  }
}
