import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { retryPendingAccountingEvents } from "@/lib/accounting/integration";
import { hasRole } from "@/lib/roles";

const replaySchema = z.object({
  limit: z.number().int().min(1).max(1000).optional(),
  periodOverrideReason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session.user.role, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to replay accounting events", 403);
    }

    const body = await request.json().catch(() => ({}));
    const validated = replaySchema.parse(body);

    const summary = await retryPendingAccountingEvents({
      companyId: session.user.companyId,
      limit: validated.limit,
      actorRole: session.user.role,
      periodOverrideReason: validated.periodOverrideReason,
    });

    return successResponse(summary);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/integration/replay error:", error);
    return errorResponse("Failed to replay accounting integration events");
  }
}
