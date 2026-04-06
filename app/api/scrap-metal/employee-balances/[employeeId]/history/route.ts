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
      prisma.employeePayment.findMany({
        where: {
          employeeId,
          payoutSource: "SCRAP",
        },
        orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
        take: 20,
        select: {
          id: true,
          dueDate: true,
          amount: true,
          amountUsd: true,
          paidAmount: true,
          paidAmountUsd: true,
          status: true,
          notes: true,
          createdAt: true,
          irregularPayoutBatchId: true,
        },
      }),
      prisma.irregularPayoutBatchItem.findMany({
        where: {
          employeeId,
          batch: {
            companyId: session.user.companyId,
            source: "SCRAP",
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 20,
        include: {
          batch: {
            select: {
              id: true,
              label: true,
              dueDate: true,
              workflowStatus: true,
              createdAt: true,
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
        const payment = payments.find((candidate) => candidate.irregularPayoutBatchId === item.batchId);
        return {
          id: item.id,
          amount: item.amount,
          notes: item.notes,
          createdAt: item.createdAt,
          batch: item.batch,
          payment: payment
            ? {
                id: payment.id,
                dueDate: payment.dueDate,
                amount: payment.amountUsd ?? payment.amount,
                paidAmount: payment.paidAmountUsd ?? payment.paidAmount ?? 0,
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
