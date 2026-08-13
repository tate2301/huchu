import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import {
  requireRetailPos,
  requireRetailSession,
  resolveRetailSite,
} from "../_helpers";
import { openRetailShiftTransaction } from "../_services";

const openShiftSchema = z.object({
  shiftNo: z.string().min(1).max(50).optional(),
  siteId: z.string().uuid().optional(),
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

  // R-2.3. The back-office shift list: every cashier's drawer and every
  // variance. A cashier's own shift reaches them through `pos/current-shift`,
  // which stays open — this is the till supervisor's view of everyone else.
  const gate = requireRetailPermission(session, "retail.cash-control", "view");
  if (gate) return gate;

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
        salesValue: toNumberOrZero(sumMoney(shiftSales.map((sale) => sale.totalAmount))),
        tenderMix: shiftSales.flatMap((sale) => sale.payments).reduce<Record<string, number>>(
          (accumulator, payment) => {
            accumulator[payment.tenderType] =
              (accumulator[payment.tenderType] ?? 0) + toNumberOrZero(payment.amount);
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

  const gate = requireRetailPos(session);
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = openShiftSchema.parse(body);
    const { site, response: siteResponse } = await resolveRetailSite(
      session.user.companyId,
      input.siteId,
    );
    if (siteResponse || !site) return siteResponse ?? errorResponse("Invalid site", 400);

    const { shift, accounting } = await openRetailShiftTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      shiftNo: input.shiftNo ?? null,
      siteId: site.id,
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
