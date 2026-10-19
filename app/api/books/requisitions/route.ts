import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks, tierOf } from "@/lib/books/core";
import { readRequisitionQuery, readRequisitions, requisitionsCsv } from "@/lib/books/requisitions-list";
import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/** Books → Requisitions (BkRequisitions): the CRM's and the shop's as one list, with what this person may do. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "bills" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = readRequisitionQuery(params);
    if (params.get("format") === "csv") {
      return new NextResponse(await requisitionsCsv(prisma, actor.companyId, query), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="requisitions.csv"' } });
    }
    const owner = tierOf(actor) === "owner";
    const view = await readRequisitions(prisma, actor.companyId, query, { userId: actor.userId, owner }, (await resolveBaseCurrency(actor.companyId)).toUpperCase());
    return successResponse({
      ...view,
      can: { approve: canDo(actor, "approve", { kind: "requisition" }).allowed, create: canDo(actor, "draft.create", { kind: "requisition", module: "crm" }).allowed },
      me: actor.userId,
      owner,
    });
  } catch (error) {
    console.error("[API] GET /api/books/requisitions error:", error);
    return errorResponse("Could not load the requisitions");
  }
}
