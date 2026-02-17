import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getNextEntryNumber } from "@/lib/accounting/ledger";
import { resolvePostingPeriod } from "@/lib/accounting/period-lock";

const reverseSchema = z.object({
  reversalDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  reason: z.string().max(500).optional(),
  periodOverrideReason: z.string().max(500).optional(),
});

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

    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!entry || entry.companyId !== session.user.companyId) {
      return errorResponse("Journal entry not found", 404);
    }
    if (entry.status !== "POSTED") {
      return errorResponse("Only posted journal entries can be reversed", 400);
    }

    const existingReversal = await prisma.journalEntry.findFirst({
      where: {
        companyId: session.user.companyId,
        reversalOfEntryId: id,
      },
      select: { id: true },
    });
    if (existingReversal) {
      return errorResponse("Journal entry is already reversed", 400);
    }

    const reversalDate = validated.reversalDate ? new Date(validated.reversalDate) : new Date();
    const periodDecision = await resolvePostingPeriod({
      companyId: session.user.companyId,
      entryDate: reversalDate,
      actorRole: session.user.role,
      overrideReason: validated.periodOverrideReason,
    });
    if (!periodDecision.allowed) {
      return errorResponse(periodDecision.message ?? "Posting period is locked", 400, {
        code: periodDecision.code ?? "PERIOD_LOCKED",
      });
    }

    const entryNumber = await getNextEntryNumber(session.user.companyId);
    const reasonSuffix = validated.reason?.trim() ? ` (${validated.reason.trim()})` : "";

    const result = await prisma.$transaction(async (tx) => {
      const reversal = await tx.journalEntry.create({
        data: {
          companyId: session.user.companyId,
          entryNumber,
          entryDate: reversalDate,
          description: `Reversal of JE-${entry.entryNumber}${reasonSuffix}`,
          status: "POSTED",
          periodId: periodDecision.period.id,
          sourceType: "MANUAL",
          createdById: session.user.id,
          postedById: session.user.id,
          postedAt: new Date(),
          periodOverrideReason: periodDecision.requiresOverride ? periodDecision.overrideReason : undefined,
          periodOverrideById: periodDecision.requiresOverride ? session.user.id : undefined,
          periodOverrideAt: periodDecision.requiresOverride ? new Date() : undefined,
          reversalOfEntryId: entry.id,
          lines: {
            create: entry.lines.map((line) => ({
              accountId: line.accountId,
              debit: line.credit,
              credit: line.debit,
              memo: line.memo ? `Reversal: ${line.memo}` : "Reversal entry",
              costCenterId: line.costCenterId ?? undefined,
            })),
          },
        },
        include: { lines: true },
      });

      await tx.journalEntry.update({
        where: { id: entry.id },
        data: {
          status: "REVERSED",
          reversedById: session.user.id,
          reversedAt: new Date(),
        },
      });

      return reversal;
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/journals/[id]/reverse error:", error);
    return errorResponse("Failed to reverse journal entry");
  }
}
