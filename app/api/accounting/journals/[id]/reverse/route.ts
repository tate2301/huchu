import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { JournalReversalError, reverseJournalEntry } from "@/lib/accounting/journals";

const reverseSchema = z.object({
  reversalDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  reason: z.string().max(500).optional(),
  periodOverrideReason: z.string().max(500).optional(),
});

/**
 * Reverse a posted journal by hand. The rules — and why the original stays
 * POSTED while the mirror cancels it — live in `lib/accounting/journals.ts`,
 * which an invoice edit reverses through as well.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const validated = reverseSchema.parse(body);

    const reversal = await prisma.$transaction((tx) =>
      reverseJournalEntry(tx, {
        companyId: session.user.companyId,
        entryId: id,
        actorId: session.user.id,
        actorRole: session.user.role,
        reversalDate: validated.reversalDate ? new Date(validated.reversalDate) : undefined,
        reason: validated.reason,
        periodOverrideReason: validated.periodOverrideReason,
      }),
    );

    return successResponse(reversal, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof JournalReversalError) {
      return errorResponse(error.message, error.status, error.code ? { code: error.code } : undefined);
    }
    console.error("[API] POST /api/accounting/journals/[id]/reverse error:", error);
    return errorResponse("Failed to reverse journal entry");
  }
}
