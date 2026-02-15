import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const DAY_MS = 1000 * 60 * 60 * 24;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const asOfParam = searchParams.get("asOf");
    const asOf = asOfParam ? new Date(asOfParam) : new Date();

    const bills = await prisma.purchaseBill.findMany({
      where: {
        companyId: session.user.companyId,
        status: { in: ["RECEIVED", "PAID"] },
      },
      include: { vendor: true },
      orderBy: [{ billDate: "desc" }],
    });

    const rowsByVendor = new Map<
      string,
      { id: string; name: string; current: number; days30: number; days60: number; days90: number; days90Plus: number; total: number }
    >();

    bills.forEach((bill) => {
      const balance =
        bill.total - (bill.amountPaid ?? 0) - (bill.debitNoteTotal ?? 0) - (bill.writeOffTotal ?? 0);
      if (balance <= 0) return;

      const dueDate = bill.dueDate ?? bill.billDate;
      const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / DAY_MS);

      const row =
        rowsByVendor.get(bill.vendorId) ?? {
          id: bill.vendorId,
          name: bill.vendor?.name ?? "Unknown",
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          days90Plus: 0,
          total: 0,
        };

      if (daysPastDue <= 0) row.current += balance;
      else if (daysPastDue <= 30) row.days30 += balance;
      else if (daysPastDue <= 60) row.days60 += balance;
      else if (daysPastDue <= 90) row.days90 += balance;
      else row.days90Plus += balance;

      row.total += balance;
      rowsByVendor.set(bill.vendorId, row);
    });

    return successResponse({
      asOf: asOf.toISOString(),
      rows: Array.from(rowsByVendor.values()),
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/reports/ap-aging error:", error);
    return errorResponse("Failed to fetch AP aging");
  }
}
