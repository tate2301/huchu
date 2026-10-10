import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getLoyaltyTier, parseLoyaltyRedeemPoints } from "@/lib/retail/loyalty-rules";

export async function getCustomerLoyaltyBalance(input: {
  companyId: string;
  customerName: string;
}) {
  // Every row, voided sales included: a void is its own negative row, so a voided
  // sale and its void come to nothing. Leaving the voided sale out took its points twice.
  const aggregate = await prisma.retailSale.aggregate({
    where: {
      companyId: input.companyId,
      customerName: input.customerName,
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
