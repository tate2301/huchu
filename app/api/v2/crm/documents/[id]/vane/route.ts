import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { deleteVaneQuote, issueVaneQuote, vaneQuoteView, VaneQuoteRefused } from "@/lib/crm/knowledge/vane-quote";
import { canEditRecord } from "@/lib/crm/permissions";
import { prisma } from "@/lib/prisma";

import { requireCrmCapability } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** The quote record's owner, for the same checks raising a quote makes. */
async function ownerOf(companyId: string, documentId: string) {
  return prisma.crmLeadDocument.findFirst({
    where: { id: documentId, companyId, type: "QUOTATION" },
    select: { quotationId: true, deal: { select: { assignedToId: true } }, lead: { select: { assignedToId: true } } },
  });
}

/** Vane's part in a quote: where each line's price came from, and whether it is Vane's draft waiting to be issued. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const doc = await ownerOf(session.user.companyId, (await params).id);
    if (!doc?.quotationId) return errorResponse("That quote is not here", 404);
    const view = await vaneQuoteView(prisma, session.user.companyId, doc.quotationId);
    if (!view) return errorResponse("That quote is not here", 404);
    const assignedToId = doc.deal?.assignedToId ?? doc.lead?.assignedToId ?? null;
    const canDecide = (await canEditRecord(session, assignedToId)) && (await requireCrmCapability(session, "documents.issue"));
    return successResponse({ data: view, canDecide });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/documents/[id]/vane error:", error);
    return errorResponse("Could not read the quote");
  }
}

/** A person issues Vane's draft quote: it becomes theirs, and is sent as any quote is. */
export async function POST(request: NextRequest, { params }: Params) {
  return decide(request, params, "issue");
}

/** A person deletes Vane's draft quote, which nobody issued. */
export async function DELETE(request: NextRequest, { params }: Params) {
  return decide(request, params, "delete");
}

async function decide(request: NextRequest, params: Params["params"], what: "issue" | "delete") {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const id = (await params).id;
    const doc = await ownerOf(session.user.companyId, id);
    if (!doc) return errorResponse("That quote is not here", 404);
    const assignedToId = doc.deal?.assignedToId ?? doc.lead?.assignedToId ?? null;
    if (!(await canEditRecord(session, assignedToId)) || !(await requireCrmCapability(session, "documents.issue"))) {
      return errorResponse("You cannot issue quotes on this record", 403);
    }
    const done =
      what === "issue" ? await issueVaneQuote({ companyId: session.user.companyId, userId: session.user.id }, id) : await deleteVaneQuote(session.user.companyId, id);
    return successResponse(done);
  } catch (error) {
    if (error instanceof VaneQuoteRefused) return errorResponse(error.message, 409);
    console.error(`[API] ${what} /api/v2/crm/documents/[id]/vane error:`, error);
    return errorResponse(what === "issue" ? "Could not issue the quote" : "Could not delete the draft");
  }
}
