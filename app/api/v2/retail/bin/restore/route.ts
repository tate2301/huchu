import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { binInput, BinRefusal, restoreFromBin } from "@/lib/retail/bin";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * Restore one record from the bin (W-63): `{ kind, id }` → `{ restored: true }`.
 * Bin update (owner, manager). 404 when it is not in the bin; 410 once it was
 * deleted for good or has been there more than 30 days.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.bin", "update");
  if (gate) return gate;

  const parsed = binInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);

  try {
    await restoreFromBin(
      {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
      },
      parsed.data,
    );
    return successResponse({ restored: true });
  } catch (error) {
    if (error instanceof BinRefusal) return errorResponse(error.message, error.status);
    throw error;
  }
}
