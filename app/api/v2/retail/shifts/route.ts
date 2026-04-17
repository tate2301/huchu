import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { ensureSiteAccess, requireRetailSession, upsertRetailRegister } from "../_helpers";

const openShiftSchema = z.object({
  shiftNo: z.string().min(1).max(50).optional(),
  siteId: z.string().uuid(),
  registerName: z.string().min(1).max(120),
  registerCode: z.string().min(1).max(50).optional().nullable(),
  openingFloat: z.number().min(0).optional(),
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
    const site = await ensureSiteAccess(session.user.companyId, input.siteId);
    if (!site) {
      return errorResponse("Invalid site", 400);
    }

    const existing = await prisma.retailShift.findFirst({
      where: {
        companyId: session.user.companyId,
        cashierId: session.user.id,
        status: "OPEN",
      },
    });
    if (existing) {
      return errorResponse("Close the current shift before opening a new one", 409);
    }

    const register = await upsertRetailRegister({
      companyId: session.user.companyId,
      siteId: site.id,
      registerName: input.registerName,
      registerCode: input.registerCode,
    });

    const providedCode = input.shiftNo
      ? normalizeProvidedId(input.shiftNo, "RETAIL_SHIFT")
      : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const shiftNo =
        providedCode ??
        (await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "RETAIL_SHIFT",
          siteId: site.id,
        }));

      try {
        const shift = await prisma.retailShift.create({
          data: {
            companyId: session.user.companyId,
            shiftNo,
            registerCode: register.code,
            registerName: register.name,
            siteId: site.id,
            cashierId: session.user.id,
            cashierName: session.user.name || session.user.email || "Cashier",
            openingFloat: input.openingFloat ?? 0,
            notes: input.notes?.trim() || null,
            status: "OPEN",
            expectedCash: input.openingFloat ?? 0,
          },
        });

        if ((shift.openingFloat ?? 0) > 0) {
          try {
            await createJournalEntryFromSource({
              companyId: session.user.companyId,
              sourceType: "RETAIL_SHIFT_OPEN",
              sourceId: shift.id,
              siteId: shift.siteId,
              registerCode: shift.registerCode,
              entryDate: shift.openedAt,
              description: `Retail shift open ${shift.shiftNo}`,
              createdById: session.user.id,
              amount: Math.abs(shift.openingFloat),
              netAmount: Math.abs(shift.openingFloat),
              taxAmount: 0,
              grossAmount: Math.abs(shift.openingFloat),
            });
          } catch (error) {
            console.error("[Accounting] Retail shift open posting failed:", error);
          }
        }

        return successResponse(shift, 201);
      } catch {
        if (providedCode) {
          return errorResponse("Shift number already exists", 409);
        }
      }
    }

    return errorResponse("Unable to generate shift number", 409);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/shifts error:", error);
    return errorResponse("Failed to open shift");
  }
}
