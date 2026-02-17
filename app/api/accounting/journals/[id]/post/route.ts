import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/accounting/ledger";
import { resolvePostingPeriod } from "@/lib/accounting/period-lock";

const postSchema = z.object({
  periodOverrideReason: z.string().max(500).optional(),
});

function totalsMatch(lines: Array<{ debit: number; credit: number }>) {
  const totals = lines.reduce(
    (acc, line) => ({
      debit: acc.debit + toMoney(line.debit),
      credit: acc.credit + toMoney(line.credit),
    }),
    { debit: 0, credit: 0 },
  );
  return Math.abs(totals.debit - totals.credit) <= 0.01;
}

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
    const validated = postSchema.parse(body);

    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!entry || entry.companyId !== session.user.companyId) {
      return errorResponse("Journal entry not found", 404);
    }
    if (entry.status === "POSTED") {
      return errorResponse("Journal entry already posted", 400);
    }
    if (!totalsMatch(entry.lines)) {
      return errorResponse("Cannot post unbalanced journal entry", 400);
    }

    const periodDecision = await resolvePostingPeriod({
      companyId: session.user.companyId,
      entryDate: entry.entryDate,
      actorRole: session.user.role,
      overrideReason: validated.periodOverrideReason,
    });
    if (!periodDecision.allowed) {
      return errorResponse(periodDecision.message ?? "Posting period is locked", 400, {
        code: periodDecision.code ?? "PERIOD_LOCKED",
      });
    }

    const updated = await prisma.journalEntry.update({
      where: { id },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        postedById: session.user.id,
        periodId: periodDecision.period.id,
        periodOverrideReason: periodDecision.requiresOverride ? periodDecision.overrideReason : undefined,
        periodOverrideById: periodDecision.requiresOverride ? session.user.id : undefined,
        periodOverrideAt: periodDecision.requiresOverride ? new Date() : undefined,
      },
      include: { lines: true },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/journals/[id]/post error:", error);
    return errorResponse("Failed to post journal entry");
  }
}
