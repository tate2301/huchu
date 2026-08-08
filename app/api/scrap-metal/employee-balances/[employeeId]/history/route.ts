import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    employeeId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { employeeId } = await context.params;

    const [balance, entries, purchases, payments, batchItems] = await Promise.all([
      prisma.scrapMetalEmployeeBalance.findFirst({
        where: {
          companyId: session.user.companyId,
          employeeId,
        },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeId: true,
              department: { select: { name: true } },
            },
          },
        },
      }),
      prisma.scrapMetalBalanceEntry.findMany({
        where: {
          companyId: session.user.companyId,
          employeeId,
        },
        orderBy: [{ createdAt: "desc" }],
        take: 40,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.scrapMetalPurchase.findMany({
        where: {
          companyId: session.user.companyId,
          employeeId,
        },
        orderBy: [{ purchaseDate: "desc" }],
        take: 30,
        include: {
          site: { select: { id: true, name: true, code: true } },
          material: { select: { id: true, code: true, name: true, category: true } },
          sellerProfile: { select: { id: true, fullName: true, nationalId: true } },
          batchItems: {
            select: {
              batch: {
                select: {
                  id: true,
                  batchNumber: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      // `SettlementPayment`, not the gold half of `EmployeePayment`: there `amount`
      // was a Float read in whatever `unit` said, and the link back to the batch
      // was a nullable column shared with three other payout kinds.
      prisma.settlementPayment.findMany({
        where: {
          companyId: session.user.companyId,
          employeeId,
          source: "SCRAP",
        },
        orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
        take: 20,
        select: {
          id: true,
          dueDate: true,
          amount: true,
          paidAmount: true,
          status: true,
          notes: true,
          createdAt: true,
          batchItemId: true,
        },
      }),
      prisma.settlementBatchItem.findMany({
        where: {
          employeeId,
          batch: {
            companyId: session.user.companyId,
            run: { source: "SCRAP" },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 20,
        include: {
          batch: {
            select: {
              id: true,
              code: true,
              status: true,
              createdAt: true,
              run: { select: { dueDate: true } },
            },
          },
        },
      }),
    ]);

    if (!balance) {
      return errorResponse("Balance not found", 404);
    }

    return successResponse({
      balance: {
        id: balance.id,
        amount: balance.balance,
        lastUpdated: balance.lastUpdated,
        employee: balance.employee,
      },
      entries: entries.map((entry) => ({
        id: entry.id,
        entryType: entry.entryType,
        amountDelta: entry.amountDelta,
        balanceAfter: entry.balanceAfter,
        note: entry.note,
        sourceId: entry.sourceId,
        createdAt: entry.createdAt,
        createdBy: entry.createdBy,
      })),
      deliveries: purchases.map((purchase) => ({
        id: purchase.id,
        purchaseNumber: purchase.purchaseNumber,
        purchaseDate: purchase.purchaseDate,
        weight: purchase.weight,
        totalAmount: purchase.totalAmount,
        currency: purchase.currency,
        category: purchase.category,
        site: purchase.site,
        material: purchase.material,
        sellerName: purchase.sellerProfile?.fullName ?? purchase.sellerName,
        sellerIdNumber: purchase.sellerProfile?.nationalId ?? null,
        batch: purchase.batchItems[0]?.batch ?? null,
      })),
      settlements: batchItems.map((item) => {
        // Matched on the batch item, not on a date range. The screen this feeds
        // used to reconcile payments to batches by comparing period windows,
        // which quietly paired the wrong two rows whenever an operator was
        // settled twice in one month.
        const payment = payments.find((candidate) => candidate.batchItemId === item.id);
        return {
          id: item.id,
          amount: item.amount,
          notes: item.notes,
          createdAt: item.createdAt,
          batch: {
            id: item.batch.id,
            label: item.batch.code,
            dueDate: item.batch.run.dueDate,
            workflowStatus: item.batch.status,
            createdAt: item.batch.createdAt,
          },
          payment: payment
            ? {
                id: payment.id,
                dueDate: payment.dueDate,
                amount: payment.amount,
                paidAmount: payment.paidAmount ?? 0,
                status: payment.status,
                notes: payment.notes,
                createdAt: payment.createdAt,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/employee-balances/[employeeId]/history error:", error);
    return errorResponse("Failed to load balance history");
  }
}
