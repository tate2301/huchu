import { randomUUID } from "node:crypto";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import type { RetailAuditActor } from "@/lib/retail/audit";

import { changePrices, PriceRefusal } from "./change";
import { NOT_ON_LIST, savedSentence } from "./words";

/**
 * The worksheet's save bar (W-14, PRD-07): the prices typed on one list, saved
 * together as one TYPED batch, all or nothing. A refused row comes back with
 * its sentence ("Below cost needs the owner. It costs US$13.03.") and nothing
 * is saved. Followers move with the rows they follow (PRD-05). A row someone
 * else changed since the list was opened is refused, and a typed price cancels
 * what was scheduled for it on the list (98-decisions, PRD-07).
 */

export const worksheetInput = z.object({
  changes: z
    .array(
      z.object({
        id: z.string().uuid(),
        value: z.string().max(24),
        /** The price the cell held when the person started typing ("" for none). */
        was: z.string().max(24),
      }),
    )
    .min(1)
    .max(500),
});

/** The list is not the shop's. */
export class WorksheetMissing extends Error {
  constructor() {
    super("Price list not found");
  }
}

export async function saveWorksheet(
  actor: RetailAuditActor,
  listId: string,
  changes: Array<{ id: string; value: string; was: string }>,
): Promise<{ data: { saved: number; batchId: string }; message: string }> {
  const list = await prisma.priceList.findFirst({
    where: { id: listId, companyId: actor.companyId, archivedAt: null },
    select: { id: true, minQuantity: true },
  });
  if (!list) throw new WorksheetMissing();
  const latest = new Map(changes.map((change) => [change.id, change]));
  const ids = [...latest.keys()];
  const batchId = randomUUID();
  return prisma.$transaction(async (tx) => {
    // Only the rows the worksheet shows: a product already on this list.
    const onList = new Set(
      (
        await tx.productPrice.findMany({
          where: { priceListId: list.id, minQuantity: list.minQuantity, productId: { in: ids } },
          select: { productId: true },
        })
      ).map((row) => row.productId),
    );
    const refused: Record<string, string> = {};
    for (const id of ids) if (!onList.has(id)) refused[id] = NOT_ON_LIST;
    let result = { applied: 0, unscheduled: 0 };
    try {
      result = await changePrices(tx, {
        companyId: actor.companyId,
        actor,
        listId: list.id,
        rows: ids
          .filter((id) => onList.has(id))
          .map((id) => ({ productId: id, price: latest.get(id)!.value, was: latest.get(id)!.was, minQuantity: list.minQuantity })),
        source: "TYPED",
        batchId,
        limits: await getApprovalLimits(actor.companyId, tx),
      });
    } catch (error) {
      if (!(error instanceof PriceRefusal)) throw error;
      Object.assign(refused, error.refused);
    }
    // Every refusal at once, and nothing saved.
    if (Object.keys(refused).length > 0) throw new PriceRefusal(refused);
    return { data: { saved: result.applied, batchId }, message: savedSentence(result.applied, result.unscheduled) };
  });
}
