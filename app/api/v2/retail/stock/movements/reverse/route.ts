import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { reversalJournal, reverseMovements, ReverseRefused } from "@/lib/retail/stock/reverse";

import { postRetailJournal, requireRetailSession } from "../../../_helpers";

const bodySchema = z.object({
  ids: z.array(z.string().uuid("Pick movements from the list.")).min(1, "Tick at least one movement.").max(200, "Reverse 200 or fewer at a time."),
});

/**
 * Reverse movements (30-stock 4.3, W-28 step 3): `{ ids }` (1–200) →
 * `{ reversed: [{ id, reference }], skipped: [{ id, reference, kind, why }] }`.
 * Breakage, own use, found more, fixed mistakes and case breaks go back with
 * a movement the other way and their journal reversed; sales, deliveries,
 * counts and transfers are skipped with why. `retail.adjustments:approve`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.adjustments", "approve");
  if (gate) return gate;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse(issue?.message ?? "Tick at least one movement.", 400, {
      fieldErrors: { ids: issue?.message ?? "Tick at least one movement." },
    });
  }

  const actor = {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name,
    userRole: session.user.role,
  };
  try {
    const result = await reverseMovements({ actor, ids: parsed.data.ids });
    for (const movement of result.reversed) {
      const journal = await reversalJournal(movement, { companyId: actor.companyId, userId: actor.userId, role: session.user.role ?? null });
      if (journal) await postRetailJournal(journal);
    }
    return successResponse({
      reversed: result.reversed.map(({ id, reference }) => ({ id, reference })),
      skipped: result.skipped,
    });
  } catch (error) {
    if (error instanceof ReverseRefused) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/retail/stock/movements/reverse error:", error);
    return errorResponse("That did not work. Nothing was changed; try again.");
  }
}
