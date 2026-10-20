import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { reopenPeriodWithVoucher } from "@/lib/accounting/closing";
import { guardBooks } from "@/lib/books/core";

const schema = z.object({
  periodId: z.string().uuid(),
  reason: z.string().min(3).max(2000),
  reopenedAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // Reopening a month is the owner's alone (books-final §2.2; it was managers too).
    const { refused } = await guardBooks(session, "period.reopen", { kind: "period" });
    if (refused) return refused;

    const body = await request.json();
    const validated = schema.parse(body);

    const result = await reopenPeriodWithVoucher({
      companyId: session.user.companyId,
      periodId: validated.periodId,
      reopenedById: session.user.id,
      reason: validated.reason,
      reopenedAt: validated.reopenedAt ? new Date(validated.reopenedAt) : undefined,
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/closing/period-reopen error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to reopen accounting period");
  }
}
