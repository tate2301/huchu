import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { linkFifoSale } from "@/lib/gold/fifo-link";
import { assertPeriodOpen, PeriodClosedError } from "@/lib/gold/period-close";

const bodySchema = z.object({
  saleGrams: z.number().positive(),
  saleDate: z.string().datetime({ offset: true }).or(z.string().date()),
  buyerInfo: z
    .object({ paymentMethod: z.string().optional() })
    .optional(),
  directPourIds: z.array(z.string().uuid()).optional(),
  notes: z.string().max(1000).optional(),
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
    const userId = session.user.id;
    const { id } = await params;

    const importRecord = await prisma.goldLedgerImport.findUnique({
      where: { id },
      select: { id: true, companyId: true, siteId: true, status: true },
    });
    if (!importRecord || importRecord.companyId !== companyId) {
      return errorResponse("Import not found", 404);
    }
    if (!importRecord.siteId) {
      return errorResponse("Import has no site set", 400);
    }
    if (importRecord.status === "COMMITTED") {
      return errorResponse("Import is already committed", 409);
    }

    const body = bodySchema.safeParse(await request.json());
    if (!body.success) {
      return errorResponse("Invalid request body", 400);
    }

    const { saleGrams, saleDate, buyerInfo, directPourIds, notes } = body.data;
    const saleDateObj = new Date(saleDate);
    const siteId = importRecord.siteId;

    // Period-close check (SUPERADMIN can still proceed but gets logged).
    try {
      await assertPeriodOpen(prisma, { companyId, siteId, businessDate: saleDateObj });
    } catch (err) {
      if (err instanceof PeriodClosedError) {
        if (!hasRole(session, ["SUPERADMIN"])) {
          return errorResponse(err.message, 409, {
            periodCloseId: err.periodCloseId,
            businessDate: saleDateObj.toISOString().slice(0, 10),
          });
        }
        // SUPERADMIN proceeds — period override is implicit.
      } else {
        throw err;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const fifoResult = await linkFifoSale(tx, {
        companyId,
        siteId,
        saleGrams,
        saleDate: saleDateObj,
        paymentMethod: buyerInfo?.paymentMethod ?? "CASH",
        notes,
        sourceLabel: `import studio manual sale`,
        createdById: userId,
        directPourIds,
      });

      // Insert a draft ledger entry for the sale so it appears in the studio table.
      const lineNoMax = await tx.goldLedgerEntry.aggregate({
        where: { importId: id },
        _max: { lineNo: true },
      });
      const nextLineNo = (lineNoMax._max.lineNo ?? 0) + 1;

      const entry = await tx.goldLedgerEntry.create({
        data: {
          importId: id,
          companyId,
          lineNo: nextLineNo,
          rawJson: JSON.stringify({ source: "manual-sale", saleGrams, saleDate }),
          rawLine: `Manual sale ${saleGrams.toFixed(3)} g`,
          parsedDate: saleDateObj,
          balGrams: -saleGrams,
          status: fifoResult.isAnomaly ? "ANOMALY" : "CREATED",
          buyerReceiptId: fifoResult.receiptId,
          errorMessage: fifoResult.isAnomaly
            ? `Inventory deficit ${fifoResult.remainingGrams.toFixed(3)} g`
            : null,
        },
        select: { id: true, lineNo: true },
      });

      return { fifoResult, entry };
    });

    return successResponse({
      entryId: result.entry.id,
      lineNo: result.entry.lineNo,
      receiptId: result.fifoResult.receiptId,
      consumedGrams: result.fifoResult.consumedGrams,
      remainingGrams: result.fifoResult.remainingGrams,
      isAnomaly: result.fifoResult.isAnomaly,
    }, 201);
  } catch (error) {
    console.error("[API] POST /api/gold/imports/[id]/sales/commit error:", error);
    return errorResponse("Failed to commit sale");
  }
}
