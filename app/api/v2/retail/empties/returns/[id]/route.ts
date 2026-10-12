import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { emptiesReturn } from "@/lib/retail/stock/empties";

import { requireRetailSession } from "../../../_helpers";

/**
 * One return to a supplier, for "Record their credit note" (STK-09): who it
 * went to, what they still owe on it and its reference. `retail.empties:update`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.empties", "update");
  if (gate) return gate;

  const { id } = await params;
  const found = await emptiesReturn(prisma, session.user.companyId, id);
  if (!found) return errorResponse("Return not found", 404);
  return successResponse({ data: { id: found.id, supplier: found.supplier, owed: found.owed.toFixed(2), reference: found.reference } });
}
