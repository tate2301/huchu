import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { customerSpendChart, SPEND_RANGES } from "@/lib/retail/customers/spend-chart";
import { CUSTOMER_NOT_FOUND } from "@/lib/retail/customers/view";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../_helpers";

const rangeQuery = z.object({ range: z.enum(SPEND_RANGES).default("12m") });

/** Spend per month on a customer's record (CUS-03): `?range=3m|12m|all` → `{ unit, bars, yTop, yMid }`. `retail.customers:view`. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.customers", "view");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const query = rangeQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return errorResponse("Choose 3 months, 12 months or all time.", 400);

  const companyId = session.user.companyId;
  const found = await prisma.customer.findFirst({ where: { id: path.data.id, companyId }, select: { id: true } });
  if (!found) return errorResponse(CUSTOMER_NOT_FOUND, 404);
  return successResponse(await customerSpendChart(companyId, path.data.id, query.data.range));
}
