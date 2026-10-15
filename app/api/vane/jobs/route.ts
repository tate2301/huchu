import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canReadReport } from "@/lib/reports/access";
import { getReportDefinition } from "@/lib/reports/registry";
import { explainSchema, queueExplain } from "@/lib/vane/explain";

/**
 * Explain a figure on a report (PageVaneReport): the question is queued for
 * the worker as a job of its own, asked only about a report this person can
 * open. The answer opens in the Vane panel (`?explain=<job>`).
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const body = explainSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse("Say which figure to explain", 400);
    const { about } = body.data;
    const definition = getReportDefinition(about.report);
    const user = session.user as { role: string; enabledFeatures?: string[] };
    if (!definition || !canReadReport(definition, { role: user.role, enabledFeatures: user.enabledFeatures })) {
      return errorResponse("That report is not one you can open", 404);
    }
    const job = await queueExplain(prisma, { companyId: session.user.companyId, userId: session.user.id, about });
    return successResponse(job, 201);
  } catch (error) {
    console.error("[API] POST /api/vane/jobs error:", error);
    return errorResponse("Vane did not get the question");
  }
}
