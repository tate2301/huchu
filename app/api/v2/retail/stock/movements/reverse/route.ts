import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { POSTED_REASONS, reverseMovements, ReverseRefused, type ReversedMovement } from "@/lib/retail/stock/reverse";

import { postRetailJournal, requireRetailSession } from "../../../_helpers";

const bodySchema = z.object({
  ids: z.array(z.string().uuid("Pick movements from the list.")).min(1, "Tick at least one movement.").max(200, "Reverse 200 or fewer at a time."),
});

/**
 * What the adjustment put on the books: its journal's debits. An adjustment
 * whose posting has not landed is valued as it would have been, at the
 * line's cost.
 */
async function postedValue(movement: ReversedMovement, companyId: string): Promise<number> {
  const entry = await prisma.journalEntry.findFirst({
    where: { companyId, sourceType: "RETAIL_STOCK_ADJUSTMENT", sourceId: movement.id },
    select: { lines: { select: { debit: true } } },
  });
  const posted = entry ? entry.lines.reduce((sum, line) => sum + line.debit, 0) : null;
  return Math.round((posted ?? Math.abs(movement.change) * movement.unitCost) * 100) / 100;
}

/** The books follow an adjustment put back: the opposite of what it posted. */
async function postReversal(movement: ReversedMovement, actor: { companyId: string; userId: string; role: string }) {
  if (!POSTED_REASONS.has(movement.reason)) return;
  const value = await postedValue(movement, actor.companyId);
  if (value <= 0) return;
  const loss = movement.change < 0;
  await postRetailJournal({
    companyId: actor.companyId,
    sourceType: "RETAIL_STOCK_ADJUSTMENT",
    sourceId: movement.reversalId,
    sourceSubtype: loss ? "LOSS" : "GAIN",
    siteId: movement.siteId,
    entryDate: new Date(),
    description: `Reversed stock adjustment ${movement.reference ?? ""}`.trim(),
    createdById: actor.userId,
    actorRole: actor.role,
    amount: value,
    netAmount: value,
    taxAmount: 0,
    grossAmount: value,
    invertDirection: loss,
    inventory: {
      lines: [
        {
          inventoryItemId: movement.itemId,
          itemName: movement.itemName,
          quantity: Math.abs(movement.change),
          unitCost: Math.round((value / Math.abs(movement.change)) * 100) / 100,
          totalCost: value,
        },
      ],
      totalCost: value,
    },
  });
}

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
      await postReversal(movement, { companyId: actor.companyId, userId: actor.userId, role: session.user.role });
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
