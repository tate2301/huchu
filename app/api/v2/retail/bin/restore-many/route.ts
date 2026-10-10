import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { binItemsInput, restoreManyFromBin } from "@/lib/retail/bin";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * The bin list's Restore (W-63): `{ items: [{ kind, id }] }` (1–100) →
 * `{ restored, refused: [{ kind, id, name, why }] }`. Bin update (owner,
 * manager). Each comes back on its own; one that cannot (deleted for good,
 * past 30 days, a name taken since) is refused with why and the rest go on.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.bin", "update");
  if (gate) return gate;

  const parsed = binItemsInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);

  const result = await restoreManyFromBin(
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
