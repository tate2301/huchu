import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { setScheduleActive } from "@/lib/reports/schedules";

const bodySchema = z.object({ active: z.boolean() });

/** Stop sending a report, or start again. A person, its maker or a manager. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("Say whether it sends", 400);
    const outcome = await setScheduleActive(
      { companyId: session.user.companyId, userId: session.user.id, role: session.user.role },
      id,
      parsed.data.active,
    );
    if (outcome !== true) return errorResponse(outcome.error, outcome.status);
    return successResponse({ ok: true });
  } catch (error) {
    console.error("[API] PATCH /api/v2/reports/schedules/[id] error:", error);
    return errorResponse("Could not change the schedule");
  }
}
