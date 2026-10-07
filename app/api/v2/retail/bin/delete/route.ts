import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { binItemsInput, deleteFromBinForGood } from "@/lib/retail/bin";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * The bin's "Delete for good" (W-63): `{ items: [{ kind, id }] }` (1–100) →
 * `{ deleted, kept }`. Bin delete, the owner's alone ("Your role cannot
 * delete the bin"). Each is deleted, or kept for what was sold, paid or
 * counted against it; either way it leaves the bin and cannot be restored.
 * One that is not in the bin is skipped.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.bin", "delete");
  if (gate) return gate;

  const parsed = binItemsInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);

  const result = await deleteFromBinForGood(
    {
      companyId: session.user.companyId,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
    },
    parsed.data.items,
  );
  return successResponse(result);
}
