import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../_helpers";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const shift = await prisma.retailShift.findFirst({
    where: {
      companyId: session.user.companyId,
      cashierId: session.user.id,
      status: "OPEN",
    },
    orderBy: { openedAt: "desc" },
  });

  if (!shift) {
    return successResponse({ data: null });
  }

  const site = await prisma.site.findUnique({
    where: { id: shift.siteId },
    select: { id: true, name: true, code: true },
  });

  const sales = await prisma.retailSale.findMany({
    where: { shiftId: shift.id },
    include: { payments: true, lines: true },
  });

  return successResponse({
    data: {
      ...shift,
      site,
      saleCount: sales.length,
      salesValue: sales.reduce((total, sale) => total + sale.totalAmount, 0),
      itemCount: sales.reduce(
        (total, sale) => total + sale.lines.reduce((lineTotal, line) => lineTotal + line.quantity, 0),
        0,
      ),
      cashSales: sales
        .flatMap((sale) => sale.payments)
        .filter((payment) => payment.tenderType === "CASH")
        .reduce((total, payment) => total + payment.amount, 0),
    },
  });
}
