import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readDocumentWithVane } from "@/lib/crm/knowledge/read-with-vane";
import { prisma } from "@/lib/prisma";
import { VaneWriteRefused } from "@/lib/vane/write";

import { requireCrmCapability } from "../../../_helpers";

export const maxDuration = 60;

/** Vane reads a document for its FAQs, facts, tips and prices; what it finds waits on the document's page to be kept. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) return errorResponse("Adding to the knowledge base is a CRM settings change", 403);
    const found = await readDocumentWithVane(prisma, { companyId: session.user.companyId, userId: session.user.id, name: session.user.name ?? null }, (await params).id);
    return successResponse(found);
  } catch (error) {
    if (error instanceof VaneWriteRefused) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/v2/crm/knowledge/[id]/vane-read error:", error);
    return errorResponse("Vane could not read it");
  }
}
