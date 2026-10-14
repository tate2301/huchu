import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canReadReport } from "@/lib/reports/access";
import { scheduleInputSchema } from "@/lib/reports/schedule";
import { createSchedule, listSchedules, readersOf } from "@/lib/reports/schedules";
import { getReport } from "@/lib/reports/server";

/** A report's schedules, and the people it may be sent to. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { key } = await params;
    const report = getReport(key);
    if (!report || !canReadReport(report.definition, { role: session.user.role, enabledFeatures: session.user.enabledFeatures })) {
      return errorResponse("Report not found", 404);
    }
    const actor = { companyId: session.user.companyId, userId: session.user.id, role: session.user.role };
    const [schedules, people] = await Promise.all([listSchedules(actor, key), readersOf(session.user.companyId, report.definition)]);
    return successResponse({ schedules, people });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/[key]/schedules error:", error);
    return errorResponse("Could not read the schedules");
  }
}

/**
 * A person starts sending the report. Only from a signed-in person's request:
 * Vane has no route or tool that makes one.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { key } = await params;
    const parsed = scheduleInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "That schedule could not be read", 400);
    const outcome = await createSchedule(
      { companyId: session.user.companyId, userId: session.user.id, role: session.user.role, enabledFeatures: session.user.enabledFeatures },
      key,
      parsed.data,
    );
    if ("error" in outcome) return errorResponse(outcome.error, outcome.status);
    return successResponse({ schedule: outcome }, 201);
  } catch (error) {
    console.error("[API] POST /api/v2/reports/[key]/schedules error:", error);
    return errorResponse("Could not start sending the report");
  }
}
