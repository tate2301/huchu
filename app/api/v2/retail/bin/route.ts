import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { binInput, binKind, BinRefusal, moveToBin } from "@/lib/retail/bin";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../_helpers";

/**
 * Move one record to the bin (W-63): `{ kind, id }` → `{ binnedAt, keptUntil }`.
 * Moving to the bin is the record's delete right, which managers and owners
 * hold; it is kept 30 days and `POST /bin/restore` brings it back.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const parsed = binInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);

  const [resource, action] = binKind(parsed.data.kind).deleteRight;
  const gate = requireRetailPermission(session, resource, action);
  if (gate) return gate;

  try {
    const moved = await moveToBin(
      {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
      },
      parsed.data,
    );
    return successResponse(moved);
  } catch (error) {
    if (error instanceof BinRefusal) return errorResponse(error.message, error.status);
    throw error;
  }
}
