import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const [structures, activeStructures, invoices, issuedInvoices, overdueInvoices, receiptsPosted, waivedAmountAggregate, outstandingBalanceAggregate] =
      await Promise.all([
        prisma.schoolFeeStructure.count({ where: { companyId } }),
        prisma.schoolFeeStructure.count({ where: { companyId, status: "ACTIVE" } }),
        prisma.schoolFeeInvoice.count({ where: { companyId } }),
        prisma.schoolFeeInvoice.count({
          where: { companyId, status: { in: ["ISSUED", "PART_PAID"] } },
        }),
        prisma.schoolFeeInvoice.count({
          where: {
            companyId,
            dueDate: { lt: new Date() },
            status: { in: ["ISSUED", "PART_PAID"] },
            balanceAmount: { gt: 0 },
          },
        }),
        prisma.schoolFeeReceipt.count({ where: { companyId, status: "POSTED" } }),
        prisma.schoolFeeWaiver.aggregate({
          where: { companyId, status: "APPLIED" },
          _sum: { amount: true },
        }),
        prisma.schoolFeeInvoice.aggregate({
          where: {
            companyId,
            status: { in: ["ISSUED", "PART_PAID"] },
          },
          _sum: { balanceAmount: true },
        }),
      ]);

    return successResponse({
      success: true,
      data: {
        resource: "schools-fees",
        companyId,
        summary: {
          structures,
          activeStructures,
          invoices,
          issuedInvoices,
          overdueInvoices,
          receiptsPosted,
          waivedAmount: waivedAmountAggregate._sum.amount ?? 0,
          outstandingBalance: outstandingBalanceAggregate._sum.balanceAmount ?? 0,
        },
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/fees error:", error);
    return errorResponse("Failed to fetch schools fees summary");
  }
}
