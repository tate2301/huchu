import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { recalcSalesInvoiceBalance } from "@/lib/accounting/balances";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    if (session.user.role !== "SUPERADMIN") {
      return errorResponse("Only superadmin can delete bad debt write-off records", 403);
    }

    const existing = await prisma.salesWriteOff.findUnique({
      where: { id },
      select: { id: true, companyId: true, invoiceId: true },
    });

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Write-off record not found", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentLedgerEntry.deleteMany({
        where: {
          companyId: session.user.companyId,
          sourceType: "SALES_WRITE_OFF",
          sourceId: existing.id,
        },
      });

      await tx.accountingIntegrationEvent.deleteMany({
        where: {
          companyId: session.user.companyId,
          sourceType: "SALES_WRITE_OFF",
          sourceId: existing.id,
        },
      });

      await tx.journalEntry.deleteMany({
        where: {
          companyId: session.user.companyId,
          sourceType: "SALES_WRITE_OFF",
          sourceId: existing.id,
        },
      });

      await tx.salesWriteOff.delete({
        where: { id: existing.id },
      });
    });

    await recalcSalesInvoiceBalance(existing.invoiceId);

    return successResponse({
      id: existing.id,
      invoiceId: existing.invoiceId,
      deleted: true,
    });
  } catch (error) {
    console.error("[API] DELETE /api/accounting/sales/write-offs/[id] error:", error);
    return errorResponse("Failed to delete write-off record");
  }
}
