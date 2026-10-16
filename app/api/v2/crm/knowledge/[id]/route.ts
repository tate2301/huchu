import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readKnowledgeDoc } from "@/lib/crm/knowledge/store";
import { prisma } from "@/lib/prisma";

import { requireCrmCapability } from "../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** One knowledge document: its words, its prices, and how many quotes were priced from it. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const doc = await readKnowledgeDoc(prisma, session.user.companyId, (await params).id);
    if (!doc) return errorResponse("That document is not in the knowledge base", 404);
    return successResponse({ data: doc, canEdit: await requireCrmCapability(session, "settings.manage") });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/knowledge/[id] error:", error);
    return errorResponse("Could not read the document");
  }
}

/** Removes a document and its prices. Quotes priced from it keep their lines; they lose only the link to where the price came from. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) return errorResponse("Removing from the knowledge base is a CRM settings change", 403);
    const id = (await params).id;
    const doc = await prisma.crmKnowledgeDoc.findFirst({ where: { id, companyId: session.user.companyId }, select: { url: true, title: true } });
    if (!doc) return errorResponse("That document is not in the knowledge base", 404);
    await prisma.crmKnowledgeDoc.deleteMany({ where: { id, companyId: session.user.companyId } });
    // The stored file goes too; a file left behind is not worth failing the removal over.
    await del(doc.url).catch((error) => console.error("[knowledge] could not delete the stored file", error));
    return successResponse({ deleted: doc.title });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/knowledge/[id] error:", error);
    return errorResponse("Could not remove the document");
  }
}
