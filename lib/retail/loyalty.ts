import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { getLoyaltyTier } from "@/lib/retail/loyalty-rules";

export function parseLoyaltyRedeemPoints(notes: string | null | undefined) {
  const text = notes ?? "";
  const match = text.match(/LOYALTY_REDEEM:(\d+)/);
  return match ? Number(match[1]) : 0;
}

export async function getCustomerLoyaltyBalance(input: {
  companyId: string;
  customerName: string;
}) {
  const aggregate = await prisma.retailSale.aggregate({
    where: {
      companyId: input.companyId,
      customerName: input.customerName,
      status: "POSTED",
    },
    _sum: {
      totalAmount: true,
    },
  });

  const sales = await prisma.retailSale.findMany({
    where: {
      companyId: input.companyId,
      customerName: input.customerName,
      status: "POSTED",
    },
    select: { notes: true },
  });
  const redeemedPoints = sales.reduce((sum, sale) => sum + parseLoyaltyRedeemPoints(sale.notes), 0);
  const earnedPoints = Math.max(Math.floor(toNumberOrZero(aggregate._sum.totalAmount)), 0);
  const balance = Math.max(earnedPoints - redeemedPoints, 0);
  return {
    earnedPoints,
    redeemedPoints,
    balance,
    tier: getLoyaltyTier(balance),
  };
}
