import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { applyScrapBalanceDelta } from "@/lib/scrap-metal";

const balanceAdjustmentSchema = z.object({
  employeeId: z.string().uuid(),
  action: z.enum(["ISSUE_FUNDS", "RECEIVE_MONEY_BACK", "PAY_THEM"]),
  amount: z.number().positive(),
  note: z.string().trim().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const nonZeroOnly = searchParams.get("nonZero") === "true";
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (employeeId) where.employeeId = employeeId;
    if (nonZeroOnly) where.balance = { not: 0 };

    const [balances, total, deliveredByEmployee] = await Promise.all([
      prisma.scrapMetalEmployeeBalance.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeId: true,
              department: { select: { name: true } },
            },
          },
          _count: {
            select: {
              entries: true,
            },
          },
        },
        orderBy: [{ balance: "desc" }, { lastUpdated: "desc" }],
        skip,
        take: limit,
      }),
      prisma.scrapMetalEmployeeBalance.count({ where }),
      prisma.scrapMetalPurchase.groupBy({
        by: ["employeeId"],
        where: {
          companyId: session.user.companyId,
          ...(employeeId ? { employeeId } : null),
        },
        _sum: {
          totalAmount: true,
          weight: true,
        },
        _count: {
          _all: true,
        },
        _max: {
          purchaseDate: true,
        },
      }),
    ]);

    const deliveredMap = new Map(
      deliveredByEmployee.map((row) => [
        row.employeeId,
        {
          deliveredValue: row._sum.totalAmount ?? 0,
          deliveredWeight: row._sum.weight ?? 0,
          purchaseCount: row._count._all,
          lastPurchaseDate: row._max.purchaseDate,
        },
      ]),
    );

    const enrichedBalances = balances.map((balance) => {
      const delivered = deliveredMap.get(balance.employeeId);
      return {
        ...balance,
        deliveredValue: delivered?.deliveredValue ?? 0,
        deliveredWeight: delivered?.deliveredWeight ?? 0,
        purchaseCount: delivered?.purchaseCount ?? 0,
        lastPurchaseDate: delivered?.lastPurchaseDate ?? null,
        historyCount: balance._count.entries,
      };
    });

    return successResponse(paginationResponse(enrichedBalances, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/employee-balances error:", error);
    return errorResponse("Failed to fetch employee balances");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = balanceAdjustmentSchema.parse(body);

    const employee = await prisma.employee.findFirst({
      where: {
        id: validated.employeeId,
        companyId: session.user.companyId,
      },
      select: {
        id: true,
        name: true,
        employeeId: true,
        isActive: true,
      },
    });

    if (!employee) {
      return errorResponse("Worker not found", 404);
    }

    if (!employee.isActive) {
      return errorResponse("Worker is inactive", 400);
    }

    const actionConfig = {
      ISSUE_FUNDS: {
        amountDelta: validated.amount,
        entryType: "ADJUSTMENT" as const,
        notePrefix: "Funds issued",
      },
      RECEIVE_MONEY_BACK: {
        amountDelta: -validated.amount,
        entryType: "SETTLEMENT" as const,
        notePrefix: "Money received back",
      },
      PAY_THEM: {
        amountDelta: validated.amount,
        entryType: "SETTLEMENT" as const,
        notePrefix: "Paid out",
      },
    }[validated.action];

    const updatedBalance = await prisma.$transaction(async (tx) =>
      applyScrapBalanceDelta(tx, {
        companyId: session.user.companyId,
        employeeId: validated.employeeId,
        amountDelta: actionConfig.amountDelta,
        entryType: actionConfig.entryType,
        note: validated.note?.trim()
          ? `${actionConfig.notePrefix}: ${validated.note.trim()}`
          : actionConfig.notePrefix,
        createdById: session.user.id,
      }),
    );

    return successResponse({
      employee,
      balance: updatedBalance,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/scrap-metal/employee-balances error:", error);
    return errorResponse("Failed to update employee balance");
  }
}
