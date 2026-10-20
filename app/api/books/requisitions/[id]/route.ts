import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks, tierOf } from "@/lib/books/core";
import { readRequisitionRecord } from "@/lib/books/requisition-record";
import { prisma } from "@/lib/prisma";

/** One requisition in Books (BkRequisition, BkRequisitionPhone), the CRM's or the shop's, with what this person may do. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "bills" });
    if (refused) return refused;
    const { id } = await params;
    const record = await readRequisitionRecord(prisma, actor.companyId, id);
    if (!record) return errorResponse("Requisition not found", 404);
    const decide = canDo(actor, "approve", { kind: "requisition", module: record.source === "Retail" ? "retail" : "crm", ownerId: record.requestedById });
    const ownerOnly = record.overLimit && tierOf(actor) !== "owner";
    const waiting = record.status === "SUBMITTED";
    return successResponse({
      ...record,
      can: {
        decide: waiting && decide.allowed && !ownerOnly,
        why: !waiting ? null : !decide.allowed ? decide.reason : ownerOnly ? "Over its limit, only the owner approves it." : null,
        reopen: record.status === "ACQUITTED" && canDo(actor, "void", { kind: "requisition" }).allowed,
      },
      sourceHref: record.source === "Retail" ? `/retail/buying/requisitions/${id}` : `/crm/requisitions/${id}`,
    });
  } catch (error) {
    console.error("[API] GET /api/books/requisitions/[id] error:", error);
    return errorResponse("Could not read the requisition");
  }
}
