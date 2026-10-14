import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canReadReport } from "@/lib/reports/access";
import { getReportDefinition } from "@/lib/reports/registry";
import { giveJobSchema, giveVaneJob } from "@/lib/vane/panel";

/**
 * Give Vane a job: queued for the worker. With `about`, it is a figure on a
 * report to explain (PageVaneReport), asked only about a report this person
 * can open.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const body = giveJobSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse("Say what the job is in a few words", 400);
    const about = body.data.about;
    if (about) {
      const definition = getReportDefinition(about.report);
      const user = session.user as { role: string; enabledFeatures?: string[] };
      if (!definition || !canReadReport(definition, { role: user.role, enabledFeatures: user.enabledFeatures })) {
        return errorResponse("That report is not one you can open", 404);
      }
    }
    const job = await giveVaneJob(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      text: body.data.text,
      about,
    });
    return successResponse(job, 201);
  } catch (error) {
    console.error("[API] POST /api/vane/jobs error:", error);
    return errorResponse("Could not hand the job to Vane");
  }
}
