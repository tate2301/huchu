import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { decideAction } from "@/lib/vane/actions/engine";

const decisionSchema = z.discriminatedUnion("approve", [
  z.object({ approve: z.literal(false) }),
  z.object({ approve: z.literal(true), changes: z.record(z.string(), z.unknown()).optional() }),
]);

/**
 * A person approves one of Vane's actions (with any inputs they changed) or
 * denies it. Approved, it runs now, through the module's own code, as them:
 * their role and the workspace's features are checked first, and the app's
 * activity log records it as theirs.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const body = decisionSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse("Say whether to approve it", 400);
    const outcome = await decideAction(
      prisma,
      { companyId: session.user.companyId, userId: session.user.id, role: session.user.role, session, requestUrl: request.url },
      (await params).id,
      body.data,
    );
    if (!outcome.ok) return errorResponse(outcome.error, outcome.status);
    return successResponse({ action: outcome.action });
  } catch (error) {
    console.error("[API] POST /api/vane/actions/[id] error:", error);
    return errorResponse("Could not record your decision");
  }
}
