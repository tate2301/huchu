import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const deal = await prisma.carSalesDeal.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        vehicleId: true,
        leadId: true,
        netAmount: true,
        paidAmount: true,
      },
    });
    if (!deal) return errorResponse("Deal not found", 404);
    if (!["QUOTED", "RESERVED"].includes(deal.status)) {
      return errorResponse("Only quoted or reserved deals can be contracted", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextStatus = deal.paidAmount >= deal.netAmount ? "DELIVERY_READY" : "CONTRACTED";

      await tx.carSalesVehicle.update({
        where: { id: deal.vehicleId },
        data: { status: "SOLD" },
      });

      if (deal.leadId) {
        await tx.carSalesLead.update({
          where: { id: deal.leadId },
          data: { status: "WON" },
        });
      }

      return tx.carSalesDeal.update({
        where: { id: deal.id },
        data: {
          status: nextStatus,
          contractedAt: new Date(),
        },
        include: {
          vehicle: {
            select: {
              id: true,
              stockNo: true,
              vin: true,
              make: true,
              model: true,
              year: true,
              status: true,
            },
          },
          lead: {
            select: { id: true, leadNo: true, customerName: true, status: true },
          },
          salesperson: { select: { id: true, name: true, email: true } },
          _count: { select: { payments: true } },
        },
      });
    });

    return successResponse(updated);
  } catch (error) {
    console.error("[API] POST /api/v2/autos/deals/[id]/contract error:", error);
    return errorResponse("Failed to contract deal");
  }
}
