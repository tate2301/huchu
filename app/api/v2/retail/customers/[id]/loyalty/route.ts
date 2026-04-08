import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getCustomerLoyaltyBalance, parseLoyaltyRedeemPoints } from "@/lib/retail/loyalty";
import { requireRetailSession } from "../../../_helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, companyId: session.user.companyId, isActive: true },
    select: { id: true, name: true, phone: true, email: true },
  });
  if (!customer) {
    return errorResponse("Customer not found", 404);
  }

  const sales = await prisma.retailSale.findMany({
    where: {
      companyId: session.user.companyId,
      customerName: customer.name,
      status: "POSTED",
    },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    take: 120,
    select: {
      id: true,
      saleNo: true,
      saleType: true,
      totalAmount: true,
      notes: true,
      postedAt: true,
      createdAt: true,
    },
  });

  const loyalty = await getCustomerLoyaltyBalance({
    companyId: session.user.companyId,
    customerName: customer.name,
  });

  const ledger = sales.map((sale) => {
    const earned = Math.max(Math.floor(sale.totalAmount), 0);
    const redeemed = parseLoyaltyRedeemPoints(sale.notes);
    const delta = earned - redeemed;
    return {
      id: sale.id,
      saleNo: sale.saleNo,
      saleType: sale.saleType,
      postedAt: sale.postedAt ?? sale.createdAt,
      amount: sale.totalAmount,
      earnedPoints: earned,
      redeemedPoints: redeemed,
      delta,
    };
  });

  return successResponse({
    customer,
    loyalty,
    ledger,
  });
}
