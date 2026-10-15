import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { readerOf } from "@/lib/reports/custom/sources";
import { readCustomReport } from "@/lib/reports/custom/store";
import { reportSuggestions } from "@/lib/vane/status";

/**
 * Vane's open suggestions for a custom report this person can change: the
 * questions it wrote, waiting in the builder to be kept. Read only; keeping
 * one is the person's edit, saved when they publish.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const report = await readCustomReport(readerOf(session), id);
    if (!report) return errorResponse("Report not found", 404);
    if (!report.editable) return successResponse({ suggestions: [] });
    const suggestions = await reportSuggestions(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      role: session.user.role,
      reportId: id,
    });
    return successResponse({ suggestions });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/custom/[id]/suggestions error:", error);
    return errorResponse("Failed to read Vane's suggestions");
  }
}
