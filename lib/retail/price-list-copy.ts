import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";

/**
 * A new price list that starts as a copy of another (10-setup W-03 step 3,
 * "Copy prices from a site"): the Price list field's quick add "Name" and
 * "Start from". Every price on the list it starts from is copied, with the
 * list's currency and whether its prices include VAT. The products area's
 * full "New price list" (rules, audiences, adjustments) builds on its own
 * service; this is the copy the Sites sheets need.
 */

export class PriceListCopyRefusal extends Error {
  constructor(
    readonly field: "name" | "from",
    message: string,
  ) {
    super(message);
    this.name = "PriceListCopyRefusal";
  }
}

export async function copyPriceList(
  actor: RetailAuditActor,
  input: { name: string; fromId: string },
): Promise<{ id: string; name: string; products: number }> {
  const name = input.name.trim();
  if (!name) throw new PriceListCopyRefusal("name", "Name is needed.");
  if (name.length > 80) throw new PriceListCopyRefusal("name", "Keep the name to 80 characters.");
  const { companyId } = actor;

  try {
    return await prisma.$transaction(async (tx) => {
      const from = await tx.priceList.findFirst({
        where: { id: input.fromId, companyId, isActive: true },
        select: { id: true, name: true, currency: true, taxInclusive: true },
      });
      if (!from) throw new PriceListCopyRefusal("from", "Start from one of your price lists.");
      const clash = await tx.priceList.findFirst({
        where: { companyId, name: { equals: name, mode: "insensitive" } },
        select: { name: true },
      });
      if (clash) throw new PriceListCopyRefusal("name", `There is already a price list called ${clash.name}.`);

      const list = await tx.priceList.create({
        data: { companyId, name, kind: "STANDARD", currency: from.currency, taxInclusive: from.taxInclusive },
        select: { id: true, name: true },
      });
      const entries = await tx.productPrice.findMany({
        where: { companyId, priceListId: from.id },
        select: { productId: true, minQuantity: true, unitPrice: true },
      });
      if (entries.length > 0) {
        await tx.productPrice.createMany({
          data: entries.map((entry) => ({ companyId, priceListId: list.id, ...entry })),
        });
      }
      const products = new Set(entries.map((entry) => entry.productId)).size;
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.priceListCreated,
        entityType: "PriceList",
        entityId: list.id,
        payload: { name: list.name, products, rule: "COPY", from: from.name },
      });
      return { id: list.id, name: list.name, products };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PriceListCopyRefusal("name", `There is already a price list called ${name}.`);
    }
    throw error;
  }
}
