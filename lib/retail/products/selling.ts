import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";

/**
 * Stop selling products, or sell them again (20-products 4.2, W-11's archive).
 *
 * An archived product (`isActive` false) leaves every till and reorder
 * suggestion — the till ranges only active products — but keeps its stock,
 * its prices and its history, and comes back as it stood. It is not the bin:
 * a product in the bin is refused here ("Restore it to change it").
 *
 * All or nothing, in one transaction: every id is checked against the
 * caller's company first, and each product that changes writes its
 * `RETAIL_PRODUCT.ARCHIVED` / `UNARCHIVED` event beside the change. A product
 * already in the state asked for is left alone and not counted.
 */

/** At most this many in one request, as every bulk action. */
export const SELLING_BATCH_MAX = 500;

const sellingInput = z.object({
  ids: z
    .array(z.string().uuid("That is not one of this shop's products."))
    .min(1, "Tick at least one product.")
    .max(SELLING_BATCH_MAX, `Tick ${SELLING_BATCH_MAX} or fewer products.`),
});

/** The request body, checked: the ids, or the sentence and field errors to answer 400 with. */
export function parseSellingIds(
  body: unknown,
): { ids: string[] } | { error: string; fieldErrors: Record<string, string[] | undefined> } {
  const parsed = sellingInput.safeParse(body);
  if (parsed.success) return { ids: parsed.data.ids };
  const fieldErrors = parsed.error.flatten().fieldErrors;
  return { error: fieldErrors.ids?.[0] ?? "Tick at least one product.", fieldErrors };
}

export class SellingRefusal extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
  }
}

export async function setProductsSelling(input: {
  actor: RetailAuditActor;
  ids: readonly string[];
  selling: boolean;
}): Promise<number> {
  const ids = [...new Set(input.ids)];
  return prisma.$transaction(async (tx) => {
    const found = await tx.product.findMany({
      where: { id: { in: ids }, companyId: input.actor.companyId },
      select: { id: true, name: true, isActive: true, archivedAt: true },
    });
    if (found.length !== ids.length) throw new SellingRefusal("Product not found", 404);
    const binned = found.find((product) => product.archivedAt);
    if (binned) throw new SellingRefusal(`${binned.name} is in the bin. Restore it to change it.`, 409);

    const changing = found.filter((product) => product.isActive !== input.selling);
    if (changing.length === 0) return 0;
    await tx.product.updateMany({
      where: { id: { in: changing.map((product) => product.id) } },
      data: { isActive: input.selling },
    });
    for (const product of changing) {
      await writeRetailAuditEvent(tx, {
        actor: input.actor,
        eventType: input.selling ? RETAIL_AUDIT_EVENTS.productUnarchived : RETAIL_AUDIT_EVENTS.productArchived,
        entityType: "Product",
        entityId: product.id,
        payload: { name: product.name },
      });
    }
    return changing.length;
  });
}
