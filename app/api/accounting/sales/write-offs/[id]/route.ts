import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { recalcSalesInvoiceBalance } from "@/lib/accounting/balances";
import { guardBooks, voidMoney, VoidRefused } from "@/lib/books/core";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

const voidSchema = z.object({ reason: z.string().trim().min(3).max(300).optional() });

/**
 * Undoing a bad-debt write-off voids it (books-final §6.2 fix 13): its posting
 * is mirrored under `void:<id>` through the core, the write-off stays, marked
 * VOIDED, its receivables line stops counting and the invoice is owed again.
 * It used to delete the write-off and its journals outright. The owner's, or
 * a manager's or accountant's the owner let void.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const body = voidSchema.parse(await request.json().catch(() => ({})));

    const { actor, refused } = await guardBooks(session, "void", { kind: "write-off" });
    if (refused) return refused;

    const existing = await prisma.salesWriteOff.findUnique({
      where: { id },
      select: { id: true, companyId: true, invoiceId: true, status: true, amount: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Write-off record not found", 404);
    }
    if (existing.status === "VOIDED") return errorResponse("This write-off is void already.", 409);

    const posted = await prisma.journalEntry.findFirst({
      where: { companyId: session.user.companyId, sourceType: "SALES_WRITE_OFF", sourceId: existing.id, status: "POSTED" },
      select: { id: true },
    });
    let mirrorEntryId: string | null = null;
    if (posted) {
      const voided = await voidMoney({
        companyId: session.user.companyId,
        sourceType: "SALES_WRITE_OFF",
        sourceId: existing.id,
        reason: body.reason ?? "Write-off undone in Accounting, Sales",
        actor,
        eventType: "books.write-off.voided",
      });
      mirrorEntryId = voided.mirrorEntryId;
    }
    await prisma.salesWriteOff.update({ where: { id: existing.id }, data: { status: "VOIDED" } });
    await recalcSalesInvoiceBalance(existing.invoiceId);

    return successResponse({ id: existing.id, invoiceId: existing.invoiceId, voided: true, mirrorEntryId });
  } catch (error) {
    if (error instanceof VoidRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] DELETE /api/accounting/sales/write-offs/[id] error:", error);
    return errorResponse("Failed to void the write-off");
  }
}
