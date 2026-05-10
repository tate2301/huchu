import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, errorResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { planFifoSale } from "@/lib/gold/fifo-link";
import { NextResponse as NR } from "next/server";

const bodySchema = z.object({
  saleGrams: z.number().positive(),
  saleDate: z.string().datetime({ offset: true }).or(z.string().date()),
  buyerInfo: z
    .object({ paymentMethod: z.string().optional() })
    .optional(),
  directPourIds: z.array(z.string().uuid()).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Operator-level access required", 403);
    }

    const companyId = session.user.companyId;
    const { id } = await params;

    const importRecord = await prisma.goldLedgerImport.findUnique({
      where: { id },
      select: { id: true, companyId: true, siteId: true },
    });
    if (!importRecord || importRecord.companyId !== companyId) {
      return errorResponse("Import not found", 404);
    }
    if (!importRecord.siteId) {
      return errorResponse("Import has no site set", 400);
    }

    const body = bodySchema.safeParse(await request.json());
    if (!body.success) {
      return errorResponse("Invalid request body", 400);
    }

    const { saleGrams, saleDate, directPourIds } = body.data;

    const plan = await planFifoSale(prisma, {
      companyId,
      siteId: importRecord.siteId,
      saleGrams,
      saleDate: new Date(saleDate),
      directPourIds,
    });

    return NR.json({
      consumedGrams: plan.consumedGrams,
      remainingGrams: plan.remainingGrams,
      isAnomaly: plan.isAnomaly,
      plannedBatches: plan.plannedBatches.map((b) => ({
        pourId: b.pourId,
        pourBarId: b.pourBarId,
        siteId: b.siteId,
        siteName: b.siteName,
        pourDate: b.pourDate.toISOString(),
        grams: b.grams,
        valueUsd: b.valueUsd,
      })),
      totalUsd: plan.totalUsd,
      priceUsdPerGram: plan.priceUsdPerGram,
      priceSource: plan.priceSource,
      isCrossSite: plan.isCrossSite,
    });
  } catch (error) {
    console.error("[API] POST /api/gold/imports/[id]/sales/preview error:", error);
    return errorResponse("Failed to compute FIFO preview");
  }
}
