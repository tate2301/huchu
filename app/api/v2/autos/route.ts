import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const [
      leads,
      qualifiedLeads,
      vehiclesInStock,
      vehiclesReserved,
      activeDeals,
      contractedDeals,
      paymentsPosted,
      totalPipelineValue,
    ] = await Promise.all([
      prisma.carSalesLead.count({ where: { companyId } }),
      prisma.carSalesLead.count({ where: { companyId, status: "QUALIFIED" } }),
      prisma.carSalesVehicle.count({ where: { companyId, status: "IN_STOCK" } }),
      prisma.carSalesVehicle.count({ where: { companyId, status: "RESERVED" } }),
      prisma.carSalesDeal.count({
        where: { companyId, status: { in: ["QUOTED", "RESERVED", "CONTRACTED", "DELIVERY_READY"] } },
      }),
      prisma.carSalesDeal.count({ where: { companyId, status: "CONTRACTED" } }),
      prisma.carSalesPayment.count({ where: { companyId, status: "POSTED" } }),
      prisma.carSalesDeal.aggregate({
        where: {
          companyId,
          status: { in: ["QUOTED", "RESERVED", "CONTRACTED", "DELIVERY_READY"] },
        },
        _sum: { netAmount: true },
      }),
    ]);

    return successResponse({
      success: true,
      data: {
        resource: "autos",
        companyId,
        summary: {
          leads,
          qualifiedLeads,
          vehiclesInStock,
          vehiclesReserved,
          activeDeals,
          contractedDeals,
          paymentsPosted,
          pipelineNetAmount: totalPipelineValue._sum.netAmount ?? 0,
        },
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/autos error:", error);
    return errorResponse("Failed to fetch autos v2 data");
  }
}
