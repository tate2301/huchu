import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requirePosDevice } from "@/lib/retail/devices";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../../_helpers";

type Context = { params: Promise<{ id: string }> };

/**
 * The receipt printed (10-setup 4.4): sets `printedAt` once, on a sale of
 * this shop. Onboarding's test sale reads it. Device and session.
 */
export async function POST(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;
  const { response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return errorResponse("That sale is not one of this shop's.", 404);
  const sale = await prisma.retailSale.findFirst({ where: { id, companyId: session.user.companyId }, select: { id: true } });
  if (!sale) return errorResponse("That sale is not one of this shop's.", 404);
  await prisma.retailSale.updateMany({ where: { id: sale.id, printedAt: null }, data: { printedAt: new Date() } });
  return new NextResponse(null, { status: 204 });
}
