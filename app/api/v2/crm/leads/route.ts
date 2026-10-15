import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { createLead, createLeadSchema, LeadRefused } from "@/lib/crm/create-lead";
import { leadsRegister } from "@/lib/crm/registers/server/leads";
import { registerGet } from "@/lib/crm/registers/server/route";

/** The list: see `registerGet` — the page's own query string, paged. */
export async function GET(request: NextRequest) {
  return registerGet(request, leadsRegister);
}

/** New lead, by the signed-in person (`lib/crm/create-lead.ts`). */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const data = createLeadSchema.parse(await request.json());
    const { lead, score, assignment } = await createLead({ companyId: session.user.companyId, userId: session.user.id }, data);
    return successResponse({ ...lead, scoreBreakdown: score, assignment }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    if (error instanceof LeadRefused) return errorResponse(error.message, 400);
    console.error("[API] POST /api/v2/crm/leads error:", error);
    return errorResponse("Failed to create lead");
  }
}
