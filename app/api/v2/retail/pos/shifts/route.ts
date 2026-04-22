import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import {
  ensureRetailRegisterAccess,
  ensureSiteAccess,
  requireRetailSession,
} from "../../_helpers";
import { canAccessPosPortal } from "@/lib/retail/pos-host";

const openPosShiftSchema = z.object({
  shiftNo: z.string().min(1).max(50).optional(),
  siteId: z.string().uuid(),
  registerId: z.string().uuid(),
  openingFloat: z.number().min(0).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }
  if (!canAccessPosPortal(session.user.role)) {
    return errorResponse("POS access denied", 403);
  }

  try {
    const body = await request.json();
    const input = openPosShiftSchema.parse(body);
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

    const register = await ensureRetailRegisterAccess({
      companyId: session.user.companyId,
      siteId: site.id,
      registerId: input.registerId,
    });
    if (!register) {
      return errorResponse("Invalid register", 400);
    }

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
            console.error("[Accounting] POS shift open posting failed:", error);
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
    console.error("[API] POST /api/v2/retail/pos/shifts error:", error);
    return errorResponse("Failed to open shift");
  }
}
