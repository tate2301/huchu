import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { addRows, belowCostRefusal, PriceListRefusal } from "@/lib/retail/price-lists/service";

import { findDefaultPriceList } from "./change";
import { addedSentence } from "./words";

/**
 * Putting products on a price list and taking them off (W-16, PRD-07).
 *
 * Added products are priced from the list's base: its basis list, else the
 * default list. "The Retail price" copies it, "Retail less 8%" takes 8% off
 * to the cent, "Set each one" copies it for the person to change in the list.
 * A product priced the way the list's own rule prices it keeps following its
 * base; any other price is its own. Products already on the list are left
 * as they are. Nothing leaves the default list: a product leaves it by being
 * archived.
 */

export const addProductsInput = z.object({
  productIds: z.array(z.string().uuid()).min(1, "Pick the products to add.").max(500, "Add at most 500 products at a time."),
  pricedAt: z.enum(["BASE", "BASE_LESS", "EACH"]),
  less: z.string().max(12).nullish(),
  fromQuantity: z.number().int().min(1).max(10000).nullish(),
});

export type AddProductsInput = z.infer<typeof addProductsInput>;

export const removeProductsInput = z.object({ productIds: z.array(z.string().uuid()).min(1).max(500) });

const LESS_MESSAGE = "Make it 0% to 90%.";

/** "8%" or "8" as a number from 0 to 90, else null. */
export function lessPercent(typed: string | null | undefined): number | null {
  const match = /^\s*(\d{1,2}(?:\.\d{1,2})?)\s*%?\s*$/.exec(typed ?? "");
  if (!match) return null;
  const value = Number(match[1]);
  return value <= 90 ? value : null;
}

/** `base × (1 − less/100)` to the cent, half up. */
export function lessOf(base: Prisma.Decimal, less: number): Prisma.Decimal {
  return base.times(new Prisma.Decimal(100).minus(less).dividedBy(100)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

async function liveList(companyId: string, id: string) {
  const list = await prisma.priceList.findFirst({
    where: { id, companyId, archivedAt: null },
    select: { id: true, name: true, isDefault: true, state: true, basis: true, basisListId: true, adjustPercent: true, minQuantity: true },
  });
  if (!list) throw new PriceListRefusal(404, "Price list not found");
  return list;
}

export async function addProductsToList(
  actor: RetailAuditActor,
  listId: string,
  input: AddProductsInput,
): Promise<{ data: { added: number; skipped: number }; message: string }> {
  const { companyId } = actor;
  const list = await liveList(companyId, listId);
  const less = input.pricedAt === "BASE_LESS" ? lessPercent(input.less) : 0;
  if (less === null) throw new PriceListRefusal(400, LESS_MESSAGE, { less: LESS_MESSAGE });
  const minQuantity = input.fromQuantity ?? list.minQuantity;

  return prisma.$transaction(async (tx) => {
    const baseId = (list.basis === "LIST" ? list.basisListId : null) ?? (await findDefaultPriceList(tx, companyId))?.id ?? null;
    const products = await tx.product.findMany({
      where: { companyId, id: { in: input.productIds }, archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        standardPrice: true,
        prices: { where: { priceListId: { in: [list.id, ...(baseId ? [baseId] : [])] } }, select: { priceListId: true, minQuantity: true, unitPrice: true } },
      },
    });
    if (products.length === 0) throw new PriceListRefusal(400, "Pick the products to add.", { products: "Pick the products to add." });
    const fresh = products.filter((product) => !product.prices.some((price) => price.priceListId === list.id));

    // The list's own rule: its base as it is, or less the list's percentage.
    const adjust = list.adjustPercent === null ? 0 : Number(list.adjustPercent);
    const followsRule =
      list.basis === "LIST" && ((input.pricedAt === "BASE" && adjust === 0) || (input.pricedAt === "BASE_LESS" && less === -adjust));
    const rows = fresh.map((product) => {
      const base =
        product.prices.find((price) => price.priceListId === baseId && price.minQuantity.equals(1))?.unitPrice ??
        product.standardPrice ??
        new Prisma.Decimal(0);
      return {
        productId: product.id,
        minQuantity: new Prisma.Decimal(minQuantity),
        unitPrice: input.pricedAt === "BASE_LESS" ? lessOf(base, less) : base,
        followsBase: followsRule,
      };
    });

    // A list the tills charge carries nothing under cost unless the owner puts it there (PRD-05).
    if (list.isDefault || list.state === "ON") {
      const sentence = await belowCostRefusal(tx, actor, rows);
      if (sentence) throw new PriceListRefusal(400, sentence, { products: sentence });
    }
    await addRows(tx, { companyId, actor, listId: list.id, rows, at: new Date() });
    if (rows.length > 0) {
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.priceListProductsAdded,
        entityType: "PriceList",
        entityId: list.id,
        payload: { count: rows.length, names: fresh.map((product) => product.name) },
      });
    }
    const skipped = products.length - fresh.length;
    return {
      data: { added: rows.length, skipped },
      message: addedSentence(list.name, rows.length, skipped, input.pricedAt === "EACH"),
    };
  });
}

/**
 * "Remove from this list": the products' rows go, each with its REMOVED line
 * in the price history, and anything scheduled for them on the list is
 * cancelled. Tills charge them from the other lists that apply.
 */
export async function removeProductsFromList(actor: RetailAuditActor, listId: string, productIds: string[]): Promise<{ removed: number }> {
  const { companyId } = actor;
  const list = await liveList(companyId, listId);
  if (list.isDefault) throw new PriceListRefusal(409, `Products cannot leave ${list.name}. Archive the product instead.`);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.productPrice.findMany({
      where: { companyId, priceListId: list.id, productId: { in: productIds } },
      select: { id: true, productId: true, minQuantity: true, unitPrice: true, product: { select: { name: true } } },
    });
    if (rows.length === 0) return { removed: 0 };
    const now = new Date();
    await tx.productPrice.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    await tx.productPriceChange.createMany({
      data: rows.map((row) => ({
        companyId,
        priceListId: list.id,
        productId: row.productId,
        minQuantity: row.minQuantity,
        fromPrice: row.unitPrice,
        toPrice: null,
        source: "REMOVED" as const,
        effectiveAt: now,
        appliedAt: now,
        createdById: actor.userId,
      })),
    });
    const products = [...new Map(rows.map((row) => [row.productId, row.product.name])).entries()];
    await tx.productPriceChange.updateMany({
      where: { priceListId: list.id, productId: { in: products.map(([id]) => id) }, appliedAt: null, cancelledAt: null },
      data: { cancelledAt: now },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.priceListProductsRemoved,
      entityType: "PriceList",
      entityId: list.id,
      payload: { count: products.length, names: products.map(([, name]) => name).sort() },
    });
    return { removed: products.length };
  });
}
