import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { addEntry, decideEntries, entryInputSchema, listEntries } from "@/lib/crm/knowledge/entries";
import { prisma } from "@/lib/prisma";

import { requireCrmCapability } from "../../_helpers";

/** The knowledge base's FAQs, facts and tips. Anybody in the CRM reads them. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const docId = new URL(request.url).searchParams.get("docId") ?? undefined;
    return successResponse({ data: await listEntries(prisma, session.user.companyId, { docId }), canEdit: await requireCrmCapability(session, "settings.manage") });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/knowledge/entries error:", error);
    return errorResponse("Could not read the knowledge base");
  }
}

const decideSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), keep: z.boolean() });

/** Writes an entry (or keeps an answer Vane gave as one), or keeps or lets go of the entries Vane found. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) return errorResponse("Adding to the knowledge base is a CRM settings change", 403);
    const body = await request.json();
    const decision = decideSchema.safeParse(body);
    if (decision.success) return successResponse({ changed: await decideEntries(prisma, session.user.companyId, decision.data.ids, decision.data.keep) });
    const entry = await addEntry(prisma, { companyId: session.user.companyId, userId: session.user.id }, entryInputSchema.parse(body));
    return successResponse(entry, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(error.issues[0]?.message ?? "Fill it in", 400);
    console.error("[API] POST /api/v2/crm/knowledge/entries error:", error);
    return errorResponse("Could not add it to the knowledge base");
  }
}
