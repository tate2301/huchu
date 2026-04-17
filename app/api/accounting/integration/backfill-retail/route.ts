import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { backfillRetailAccounting } from "@/lib/accounting/integration";
import { hasRole } from "@/lib/roles";

const schema = z.object({
  dryRun: z.boolean().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  periodOverrideReason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session.user.role, ["SUPERADMIN", "MANAGER", "SHOP_MANAGER"])) {
      return errorResponse("Insufficient permissions to backfill retail accounting", 403);
    }

    const body = await request.json().catch(() => ({}));
    const validated = schema.parse(body);

    const result = await backfillRetailAccounting({
      companyId: session.user.companyId,
      actorId: session.user.id,
      actorRole: session.user.role,
      periodOverrideReason: validated.periodOverrideReason,
      dryRun: validated.dryRun ?? true,
      limit: validated.limit,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/integration/backfill-retail error:", error);
    return errorResponse("Failed to backfill retail accounting");
  }
}
