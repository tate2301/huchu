import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getNextEntryNumber, ensurePeriodForDate, toMoney } from "@/lib/accounting/ledger";
import { resolvePostingPeriod } from "@/lib/accounting/period-lock";
import { findForeignAccountIds, findForeignCostCenterIds } from "@/lib/accounting/ownership";
import { ensureLedgerAccountIds } from "@/lib/accounting/chart-of-accounts";

const journalSchema = z.object({
  entryDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  description: z.string().min(1).max(500),
  status: z.enum(["DRAFT", "POSTED"]).optional(),
  periodOverrideReason: z.string().max(500).optional(),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        debit: z.number().min(0),
        credit: z.number().min(0),
        memo: z.string().max(500).optional(),
        costCenterId: z.string().uuid().optional(),
      }),
    )
    .min(2),
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

function linesStructurallyValid(lines: Array<{ debit: number; credit: number }>) {
  return lines.every((line) => {
    const debit = toMoney(line.debit);
    const credit = toMoney(line.credit);
    if (debit < 0 || credit < 0) return false;
    if (debit === 0 && credit === 0) return false;
    if (debit > 0 && credit > 0) return false;
    return true;
  });
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (status) where.status = status;
    if (startDate || endDate) {
      where.entryDate = {
        ...(startDate ? { gte: new Date(startDate) } : null),
        ...(endDate ? { lte: new Date(endDate) } : null),
      };
    }

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          period: { select: { id: true, startDate: true, endDate: true } },
        },
        orderBy: [{ entryDate: "desc" }, { entryNumber: "desc" }],
        skip,
        take: limit,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return successResponse(paginationResponse(entries, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/journals error:", error);
    return errorResponse("Failed to fetch journal entries");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = journalSchema.parse(body);

    if (!totalsMatch(validated.lines)) {
      return errorResponse("Debit and credit totals must balance", 400);
    }
    if (!linesStructurallyValid(validated.lines)) {
      return errorResponse("Each line must contain either debit or credit, not both", 400);
    }

    const foreignAccountIds = await findForeignAccountIds(
      session.user.companyId,
      validated.lines.map((line) => line.accountId),
    );
    if (foreignAccountIds.length > 0) {
      return errorResponse("One or more journal accounts are invalid for this company", 400, {
        accountIds: foreignAccountIds,
      });
    }

    const nonLedgerAccountIds = await ensureLedgerAccountIds(
      session.user.companyId,
      validated.lines.map((line) => line.accountId),
    );
    if (nonLedgerAccountIds.length > 0) {
      return errorResponse("Journal lines must post only to active LEDGER accounts", 400, {
        accountIds: nonLedgerAccountIds,
      });
    }

    const foreignCostCenterIds = await findForeignCostCenterIds(
      session.user.companyId,
      validated.lines.map((line) => line.costCenterId),
    );
    if (foreignCostCenterIds.length > 0) {
      return errorResponse("One or more cost centers are invalid for this company", 400, {
        costCenterIds: foreignCostCenterIds,
      });
    }

    const entryDate = new Date(validated.entryDate);
    const entryNumber = await getNextEntryNumber(session.user.companyId);
    let period = await ensurePeriodForDate(session.user.companyId, entryDate);
    let periodOverrideReason: string | undefined;
    let periodOverrideById: string | undefined;
    let periodOverrideAt: Date | undefined;

    if ((validated.status ?? "DRAFT") === "POSTED") {
      const periodDecision = await resolvePostingPeriod({
        companyId: session.user.companyId,
        entryDate,
        actorRole: session.user.role,
        overrideReason: validated.periodOverrideReason,
      });
      if (!periodDecision.allowed) {
        return errorResponse(periodDecision.message ?? "Posting period is locked", 400, {
          code: periodDecision.code ?? "PERIOD_LOCKED",
        });
      }
      period = periodDecision.period;
      if (periodDecision.requiresOverride) {
        periodOverrideReason = periodDecision.overrideReason;
        periodOverrideById = session.user.id;
        periodOverrideAt = new Date();
      }
    }

    const entry = await prisma.journalEntry.create({
      data: {
        companyId: session.user.companyId,
        entryNumber,
        entryDate,
        description: validated.description,
        status: validated.status ?? "DRAFT",
        periodId: period.id,
        sourceType: "MANUAL",
        createdById: session.user.id,
        postedById: validated.status === "POSTED" ? session.user.id : undefined,
        postedAt: validated.status === "POSTED" ? new Date() : undefined,
        periodOverrideReason,
        periodOverrideById,
        periodOverrideAt,
        lines: {
          create: validated.lines.map((line) => ({
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            memo: line.memo,
            costCenterId: line.costCenterId,
          })),
        },
      },
      include: { lines: true },
    });

    return successResponse(entry, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/journals error:", error);
    return errorResponse("Failed to create journal entry");
  }
}
