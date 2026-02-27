import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const reserveSchema = z.object({
  reservedUntil: z.string().datetime(),
});

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

    const body = await request.json();
    const validated = reserveSchema.parse(body);
    const reservedUntil = new Date(validated.reservedUntil);
    if (reservedUntil <= new Date()) {
      return errorResponse("reservedUntil must be in the future", 400);
    }

    const deal = await prisma.carSalesDeal.findFirst({
      where: { id, companyId },
      select: { id: true, status: true, vehicleId: true },
    });
    if (!deal) return errorResponse("Deal not found", 404);
    if (!["DRAFT", "QUOTED"].includes(deal.status)) {
      return errorResponse("Only draft or quoted deals can be reserved", 400);
    }

    const activeDeal = await prisma.carSalesDeal.findFirst({
      where: {
        companyId,
        vehicleId: deal.vehicleId,
        id: { not: deal.id },
        status: { in: ["RESERVED", "CONTRACTED", "DELIVERY_READY"] },
      },
      select: { id: true, dealNo: true, status: true },
    });
    if (activeDeal) {
      return errorResponse(
        `Vehicle already linked to active deal ${activeDeal.dealNo} (${activeDeal.status})`,
        409,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.carSalesVehicle.update({
        where: { id: deal.vehicleId },
        data: { status: "RESERVED" },
      });
      return tx.carSalesDeal.update({
        where: { id: deal.id },
        data: {
          status: "RESERVED",
          reservedUntil,
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
          salesperson: { select: { id: true, name: true, email: true } },
          _count: { select: { payments: true } },
        },
      });
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/autos/deals/[id]/reserve error:", error);
    return errorResponse("Failed to reserve deal");
  }
}
