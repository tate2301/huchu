import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  requireRetailSession,
} from "../_helpers";
import { openRetailShiftTransaction } from "../_services";

const openShiftSchema = z.object({
  shiftNo: z.string().min(1).max(50).optional(),
  siteId: z.string().uuid(),
  registerId: z.string().uuid(),
  openingFloat: z.number().min(0).optional(),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const shifts = await prisma.retailShift.findMany({
    where: { companyId: session.user.companyId },
    orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    take: 100,
  });

  const sites = await prisma.site.findMany({
    where: { id: { in: shifts.map((shift) => shift.siteId) } },
    select: { id: true, name: true, code: true },
  });
  const siteMap = new Map(sites.map((site) => [site.id, site]));

  const sales = await prisma.retailSale.findMany({
    where: { companyId: session.user.companyId, shiftId: { in: shifts.map((shift) => shift.id) } },
    include: { payments: true },
  });

  return successResponse({
    data: shifts.map((shift) => {
      const shiftSales = sales.filter((sale) => sale.shiftId === shift.id);
      return {
        ...shift,
        site: siteMap.get(shift.siteId) ?? null,
        saleCount: shiftSales.length,
        salesValue: shiftSales.reduce((total, sale) => total + sale.totalAmount, 0),
        tenderMix: shiftSales.flatMap((sale) => sale.payments).reduce<Record<string, number>>(
          (accumulator, payment) => {
            accumulator[payment.tenderType] = (accumulator[payment.tenderType] ?? 0) + payment.amount;
            return accumulator;
          },
          {},
        ),
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  try {
    const body = await request.json();
    const input = openShiftSchema.parse(body);
    const { shift, accounting } = await openRetailShiftTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      shiftNo: input.shiftNo ?? null,
      siteId: input.siteId,
      registerId: input.registerId,
      openingFloat: input.openingFloat ?? 0,
      notes: input.notes ?? null,
      periodOverrideReason: input.periodOverrideReason ?? null,
    });

    return successResponse({ ...shift, ...accounting }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/shifts error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to open shift", 400);
  }
}
