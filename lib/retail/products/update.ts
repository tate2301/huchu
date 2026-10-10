import { Prisma } from "@prisma/client";

import { money, toNumberOrZero } from "@/lib/money";
import type { ApprovalLimits } from "@/lib/retail/approvals/limits";
import { auditRecordEdited, type RetailAuditActor } from "@/lib/retail/audit";
import { changePrices, defaultPriceList, PriceRefusal, repriceCostFollowers } from "@/lib/retail/prices/change";
import { setStockLineLevels } from "@/lib/retail/stock/lines";
import { recordOpeningStock } from "@/lib/retail/stock/opening";

import { categoryChecksWords } from "./age-check";
import {
  DEFAULT_DEPOSIT,
  checkProductUnique,
  liveCategoryOf,
  lockProductNames,
  ProductRefusal,
  stockSiteOf,
  supplierOf,
} from "./create";
import type { ProductPatch } from "./input";
import { productChanges, type FieldChange, type ProductValues } from "./view";

/**
 * Change a product (W-11, W-62; PRD-03): from the Edit sheet, several fields
 * at once, or one from the record's rail. All or nothing, in the caller's
 * transaction. A product in the bin is refused (409 "Restore it to change
 * it"); the name and barcode keep the rules a new product keeps; the price
 * goes through the price-change core (`TYPED`), so the owner rule applies and
 * the history row is written; Reorder at and Reorder are the default site's
 * line; opening stock and its site are taken only while the product has no
 * stock history. Each changed field writes `RETAIL_RECORD.EDITED`, the price
 * its `RETAIL_PRICE.CHANGED`. Nothing posts to the books except opening stock,
 * which the caller posts after the commit.
 */

type Tx = Prisma.TransactionClient;

export type ProductUpdated = {
  changed: FieldChange[];
  /** Opening stock recorded by this change, to post after the commit. */
  opening: { itemId: string; siteId: string; quantity: string; unitCost: string | null; amount: Prisma.Decimal | null } | null;
  code: string;
  name: string;
};

const num = (value: Prisma.Decimal | null | undefined) => (value === null || value === undefined ? null : toNumberOrZero(value));

export async function updateProduct(
  tx: Tx,
  args: { actor: RetailAuditActor; id: string; input: ProductPatch; limits: Pick<ApprovalLimits, "priceChanges" | "belowCostNeedsOwner"> },
): Promise<ProductUpdated> {
  const { actor, id, input } = args;
  const companyId = actor.companyId;
  await lockProductNames(tx, companyId);

  const product = await tx.product.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      code: true,
      name: true,
      barcode: true,
      archivedAt: true,
      costPrice: true,
      standardPrice: true,
      unit: true,
      returnable: true,
      depositAmount: true,
      imageUrl: true,
      ageRestricted: true,
      maxDiscountPercent: true,
      retailCategory: { select: { id: true, name: true, depositAmount: true, ageRestricted: true } },
      supplier: { select: { id: true, name: true } },
      inventoryItems: {
        orderBy: { createdAt: "asc" },
        select: { id: true, siteId: true, minStock: true, reorderQty: true, _count: { select: { movements: true } } },
      },
    },
  });
  if (!product) throw new ProductRefusal(404, "Product not found");
  if (product.archivedAt) throw new ProductRefusal(409, "Restore it to change it");

  const list = await defaultPriceList(tx, companyId);
  const listed = await tx.productPrice.findUnique({
    where: { priceListId_productId_minQuantity: { priceListId: list.id, productId: id, minQuantity: new Prisma.Decimal(1) } },
    select: { unitPrice: true },
  });
  const profile = await tx.retailShopProfile.findUnique({ where: { companyId }, select: { defaultSiteId: true } });
  const line = product.inventoryItems.find((row) => row.siteId === profile?.defaultSiteId) ?? product.inventoryItems[0] ?? null;
  const hasMovements = product.inventoryItems.some((row) => row._count.movements > 0);

  const before: ProductValues = {
    name: product.name,
    code: product.code,
    barcode: product.barcode,
    price: toNumberOrZero(listed?.unitPrice ?? product.standardPrice),
    cost: num(product.costPrice),
    reorderAt: num(line?.minStock),
    reorderQty: num(line?.reorderQty),
    category: product.retailCategory?.name ?? null,
    supplier: product.supplier?.name ?? null,
    soldAs: product.unit === "KILOGRAM" ? "BY_WEIGHT" : "SINGLE",
    returnable: product.returnable,
    depositAmount: num(product.depositAmount),
    imageUrl: product.imageUrl,
    ageCheck: product.ageRestricted,
    maxDiscountPercent: num(product.maxDiscountPercent),
  };

  // The rules a new product keeps, for what changes.
  const name = input.name !== undefined && input.name !== product.name ? input.name : undefined;
  const barcode = input.barcode !== undefined && input.barcode !== product.barcode ? input.barcode : undefined;
  await checkProductUnique(tx, companyId, { name, barcode: barcode ?? null }, id);
  const category =
    input.categoryId === undefined ? undefined : input.categoryId === null ? null : await liveCategoryOf(tx, companyId, input.categoryId);
  const supplier =
    input.supplierId === undefined ? undefined : input.supplierId === null ? null : await supplierOf(tx, companyId, input.supplierId);
  const code = input.code === undefined ? undefined : input.code.toUpperCase();
  if (code !== undefined && code !== product.code) {
    const taken = await tx.product.findFirst({ where: { companyId, code, id: { not: id } }, select: { name: true } });
    if (taken) throw new ProductRefusal(400, `${code} is taken by another product.`, "code");
  }
  // A category that checks ID checks it for every product in it.
  const checking = category === undefined ? product.retailCategory : category;
  if (input.ageCheck === false && checking?.ageRestricted) {
    throw new ProductRefusal(400, categoryChecksWords(checking.name), "ageCheck");
  }
  const opening = input.openingStock ? new Prisma.Decimal(input.openingStock) : null;
  if ((opening && opening.greaterThan(0)) || (input.siteId && line && input.siteId !== line.siteId)) {
    if (hasMovements) throw new ProductRefusal(400, "It has stock history already. Adjust stock instead.", "openingStock");
  }

  // A deposit of nothing is not returnable; any other deposit is.
  const returnable =
    input.returnable ??
    (input.depositAmount !== undefined ? input.depositAmount !== null && Number(input.depositAmount) > 0 : product.returnable);
  const deposit =
    returnable === false
      ? null
      : input.depositAmount !== undefined
        ? input.depositAmount === null
          ? null
          : money(input.depositAmount)
        : input.returnable === true && !product.returnable
          ? money(category?.depositAmount?.toString() ?? product.retailCategory?.depositAmount?.toString() ?? DEFAULT_DEPOSIT)
          : product.depositAmount;
  const cost = input.cost === undefined ? undefined : input.cost === null ? null : money(input.cost);
  // Sold as is the unit the till sells in and the stock line is counted in:
  // once stock has moved in one, it stays.
  const soldAs = input.soldAs !== undefined && input.soldAs !== before.soldAs ? input.soldAs : undefined;
  if (soldAs !== undefined && hasMovements) {
    throw new ProductRefusal(400, "It has stock history already. Add it again as a new product to sell it the other way.", "soldAs");
  }

  await tx.product.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(code !== undefined ? { code } : {}),
      ...(barcode !== undefined ? { barcode } : {}),
      ...(category !== undefined
        ? category
          ? { categoryId: category.id, defaultTaxRate: category.vatRate }
          : { categoryId: null }
        : {}),
      ...(supplier !== undefined ? { supplierId: supplier?.id ?? null } : {}),
      ...(cost !== undefined ? { costPrice: cost } : {}),
      ...(soldAs !== undefined ? { unit: soldAs === "BY_WEIGHT" ? "KILOGRAM" : "EACH" } : {}),
      ...(input.returnable !== undefined || input.depositAmount !== undefined ? { returnable, depositAmount: deposit } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.ageCheck !== undefined ? { ageRestricted: input.ageCheck } : {}),
      ...(input.maxDiscountPercent !== undefined
        ? { maxDiscountPercent: input.maxDiscountPercent === null ? null : new Prisma.Decimal(input.maxDiscountPercent) }
        : {}),
    },
  });
  if (name !== undefined) await tx.inventoryItem.updateMany({ where: { productId: id }, data: { name } });
  if (cost !== undefined && line) await tx.inventoryItem.update({ where: { id: line.id }, data: { unitCost: cost } });
  // Lists that follow the cost (Staff, cost plus 5%) move with it.
  if (cost !== undefined && cost !== null && !(product.costPrice && cost.equals(product.costPrice))) {
    await repriceCostFollowers(tx, companyId, id, actor);
  }
  if (soldAs !== undefined && line) {
    await tx.inventoryItem.update({ where: { id: line.id }, data: { unit: soldAs === "BY_WEIGHT" ? "kg" : "each" } });
  }
  if (line && (input.reorderAt !== undefined || input.reorderQty !== undefined)) {
    await setStockLineLevels(tx, line.id, { reorderAt: input.reorderAt, reorderQty: input.reorderQty });
  }

  // Opening stock, at the site asked for, while nothing has moved yet.
  let openingDone: ProductUpdated["opening"] = null;
  if (line && input.siteId && input.siteId !== line.siteId) {
    const site = await stockSiteOf(tx, companyId, input.siteId);
    const location = await tx.stockLocation.findFirst({
      where: { siteId: site.id, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!location) throw new ProductRefusal(400, "That site has no place to keep stock yet.", "siteId");
    await tx.inventoryItem.update({ where: { id: line.id }, data: { siteId: site.id, locationId: location.id } });
  }
  if (line && opening && opening.greaterThan(0)) {
    const unitCost = cost !== undefined ? cost : product.costPrice;
    const recorded = await recordOpeningStock(tx, { actor, itemId: line.id, quantity: opening, unitCost });
    openingDone = {
      itemId: line.id,
      siteId: input.siteId ?? line.siteId,
      quantity: opening.toString(),
      unitCost: unitCost?.toFixed(2) ?? null,
      amount: recorded.amount && recorded.amount.greaterThan(0) ? recorded.amount : null,
    };
  }

  // The price, through the core: the owner rule and the history row.
  if (input.price !== undefined && !money(input.price).equals(money(before.price))) {
    try {
      await changePrices(tx, {
        companyId,
        actor,
        listId: list.id,
        rows: [{ productId: id, price: input.price }],
        source: "TYPED",
        limits: args.limits,
      });
    } catch (error) {
      if (error instanceof PriceRefusal) throw new ProductRefusal(400, error.message, "price");
      throw error;
    }
  }

  const after: ProductValues = {
    ...before,
    ...(name !== undefined ? { name } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(barcode !== undefined ? { barcode } : {}),
    ...(input.price !== undefined ? { price: toNumberOrZero(money(input.price)) } : {}),
    ...(cost !== undefined ? { cost: num(cost) } : {}),
    ...(input.reorderAt !== undefined ? { reorderAt: input.reorderAt === null ? null : Number(input.reorderAt) } : {}),
    ...(input.reorderQty !== undefined ? { reorderQty: input.reorderQty === null ? null : Number(input.reorderQty) } : {}),
    ...(category !== undefined ? { category: category?.name ?? null } : {}),
    ...(supplier !== undefined ? { supplier: supplier?.name ?? null } : {}),
    ...(soldAs !== undefined ? { soldAs } : {}),
    returnable,
    depositAmount: num(deposit),
    ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
    ...(input.ageCheck !== undefined ? { ageCheck: input.ageCheck } : {}),
    ...(input.maxDiscountPercent !== undefined
      ? { maxDiscountPercent: input.maxDiscountPercent === null ? null : Number(input.maxDiscountPercent) }
      : {}),
  };
  const sent = Object.keys(input).filter((key) => input[key as keyof ProductPatch] !== undefined);
  const changed = productChanges(sent, before, after);
  for (const change of changed) {
    // The price writes its own event, with the list it is on.
    if (change.field === "price") continue;
    await auditRecordEdited(tx, {
      actor,
      entityType: "Product",
      entityId: id,
      field: change.field,
      label: change.label,
      from: change.from,
      to: change.to,
      kind: change.kind,
    });
  }

  return { changed, opening: openingDone, code: after.code, name: after.name };
}
