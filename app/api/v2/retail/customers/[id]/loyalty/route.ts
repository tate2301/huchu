import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { balance, customerTier } from "@/lib/retail/loyalty/ledger";
import { loadLoyaltySettings } from "@/lib/retail/loyalty/settings";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. One customer's points and the history behind them, read at the
  // counter while they wait. Selling, not reporting.
  const gate = requireRetailPermission(session, "retail.customers", "view");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
  const companyId = session.user.companyId;
  const customer = await prisma.customer.findFirst({
    where: { id, companyId, isActive: true },
    select: { id: true, name: true, phone: true, email: true },
  });
  if (!customer) {
    return errorResponse("Customer not found", 404);
  }

  // CUS-01: the points ledger, newest first, each row with the sale it moved on.
  const settings = await loadLoyaltySettings(companyId);
  const [entries, held, tier, totals] = await Promise.all([
    prisma.retailPointsEntry.findMany({
      where: { companyId, customerId: customer.id },
      orderBy: { seq: "desc" },
      take: 120,
      select: {
        id: true,
        points: true,
        createdAt: true,
        sale: { select: { id: true, saleNo: true, saleType: true, totalAmount: true } },
      },
    }),
    balance(prisma, customer.id),
    customerTier(prisma, { companyId, customerId: customer.id, at: new Date(), settings }),
    prisma.retailPointsEntry.groupBy({
      by: ["kind"],
      where: { companyId, customerId: customer.id, kind: { in: ["EARNED", "SPENT"] } },
      _sum: { points: true },
    }),
  ]);
  const sumOf = (kind: "EARNED" | "SPENT") => Math.abs(totals.find((row) => row.kind === kind)?._sum.points ?? 0);

  return successResponse({
    customer,
    loyalty: { earnedPoints: sumOf("EARNED"), redeemedPoints: sumOf("SPENT"), balance: held, tier },
    ledger: entries.map((entry) => ({
      id: entry.id,
      saleId: entry.sale?.id ?? null,
      saleNo: entry.sale?.saleNo ?? "",
      saleType: entry.sale?.saleType ?? "",
      postedAt: entry.createdAt,
      amount: toNumberOrZero(entry.sale?.totalAmount ?? 0),
      earnedPoints: Math.max(entry.points, 0),
      redeemedPoints: Math.max(-entry.points, 0),
      delta: entry.points,
    })),
  });
}
