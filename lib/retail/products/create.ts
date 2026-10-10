import { Prisma, type RetailPriceChangeSource } from "@prisma/client";

import { money, toNumberOrZero } from "@/lib/money";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { RETAIL_AUDIT_EVENTS, auditAmount, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { STANDARD_VAT_RATE } from "@/lib/retail/category-words";
import type { ApprovalLimits } from "@/lib/retail/approvals/limits";
import { defaultPriceList, priceChangeNeedsOwner } from "@/lib/retail/prices/change";
import { recordOpeningStock } from "@/lib/retail/stock/opening";

import { categoryChecksWords } from "./age-check";
import { normalizeSku, type ProductInput } from "./input";

/**
 * Add a product (W-09, PRD-03): one record. The product, its stock line at
 * the site it is kept at, its price on the default list and the history row
 * that says it was put there, its opening stock, and its event — in the
 * caller's transaction. Saved means on sale, on every till.
 *
 * Names are serialised per company with an advisory lock rather than a unique
 * index: the `Product` table is shared with modules whose rows may already
 * repeat a name. The opening stock's journal is posted by the caller after
 * the commit, from `opening.amount`.
 */

type Tx = Prisma.TransactionClient;

/** A refusal with its status, its sentence and the field it belongs under. */
export class ProductRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly field: string | null = null,
  ) {
    super(message);
  }
}

/** The default deposit on a returnable bottle when its category names none. */
export const DEFAULT_DEPOSIT = "0.10";

/** Take the company's product-name lock for the rest of the transaction. */
export async function lockProductNames(tx: Tx, companyId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:product-name`}))`;
}

/** Refuses a name another live product has, or a barcode a live product or bundle has. */
export async function checkProductUnique(
  tx: Tx,
  companyId: string,
  input: { name?: string; barcode?: string | null },
  self: string | null = null,
): Promise<void> {
  const others = { companyId, archivedAt: null, ...(self ? { id: { not: self } } : {}) };
  if (input.name !== undefined) {
    const named = await tx.product.findFirst({
      where: { ...others, name: { equals: input.name, mode: "insensitive" } },
      select: { name: true },
    });
    if (named) throw new ProductRefusal(400, `There is already a product called ${named.name}.`, "name");
  }
  if (input.barcode) {
    // A bundle's barcode too (PRD-08): one scan finds one thing.
    const [scanned, bundle] = await Promise.all([
      tx.product.findFirst({ where: { ...others, barcode: input.barcode }, select: { name: true } }),
      tx.retailBundle.findFirst({ where: { companyId, archivedAt: null, barcode: input.barcode }, select: { name: true } }),
    ]);
    const taken = scanned?.name ?? bundle?.name;
    if (taken) throw new ProductRefusal(400, `${taken} already has this barcode.`, "barcode");
  }
}

/** The company's live category, or a refusal under Category. */
export async function liveCategoryOf(tx: Tx, companyId: string, categoryId: string) {
  const category = await tx.retailCategory.findFirst({
    where: { id: categoryId, companyId, archivedAt: null },
    select: { id: true, name: true, vatRate: true, ageRestricted: true, returnable: true, depositAmount: true },
  });
  if (!category) throw new ProductRefusal(400, "That category is not one of this shop's.", "categoryId");
  return category;
}

/** The company's active supplier, or a refusal under Supplier. */
export async function supplierOf(tx: Tx, companyId: string, supplierId: string) {
  const supplier = await tx.vendor.findFirst({ where: { id: supplierId, companyId, isActive: true }, select: { id: true, name: true } });
  if (!supplier) throw new ProductRefusal(400, "That supplier is not one of this shop's.", "supplierId");
  return supplier;
}

/**
 * Where a new product's stock is kept: the site asked for (an open site of
 * the company), else the shop's default site, else its only (or first) open
 * site.
 */
export async function stockSiteOf(tx: Tx, companyId: string, siteId: string | null | undefined) {
  if (siteId) {
    const site = await tx.site.findFirst({ where: { id: siteId, companyId, isActive: true }, select: { id: true, name: true } });
    if (!site) throw new ProductRefusal(400, "That site is not one of this shop's.", "siteId");
    return site;
  }
  const profile = await tx.retailShopProfile.findUnique({
    where: { companyId },
    select: { defaultSite: { select: { id: true, name: true, isActive: true } } },
  });
  if (profile?.defaultSite?.isActive) return { id: profile.defaultSite.id, name: profile.defaultSite.name };
  const open = await tx.site.findFirst({
    where: { companyId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!open) throw new ProductRefusal(400, "This shop has no open site to keep stock at. Add one in Setup › Sites.", "siteId");
  return open;
}

/** A code no product of the company has, nor any stock line at the site: the name's, then -2, -3… */
async function freeCode(tx: Tx, companyId: string, siteId: string, name: string): Promise<string> {
  const base = normalizeSku(name) || "PRODUCT";
  const [products, lines] = await Promise.all([
    tx.product.findMany({ where: { companyId, code: { startsWith: base } }, select: { code: true } }),
    tx.inventoryItem.findMany({ where: { siteId, itemCode: { startsWith: base } }, select: { itemCode: true } }),
  ]);
  const taken = new Set([...products.map((row) => row.code), ...lines.map((row) => row.itemCode)]);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const code = `${base}-${n}`;
    if (!taken.has(code)) return code;
  }
}

/**
 * Who adds it. Provisioning a shop's starter range has nobody to name
 * (`userId` null): the product is nobody's, its event is under nobody, and it
 * cannot carry opening stock.
 */
export type ProductActor = Omit<RetailAuditActor, "userId"> & { userId: string | null };

export type ProductCreated = {
  productId: string;
  code: string;
  name: string;
  price: string;
  site: { id: string; name: string };
  itemId: string;
  /** What the opening stock is worth at cost, to post after the commit; null with no stock or no cost. */
  opening: { quantity: string; unitCost: string | null; amount: Prisma.Decimal | null } | null;
};

export async function createProduct(
  tx: Tx,
  args: {
    actor: ProductActor;
    input: ProductInput;
    source: Extract<RetailPriceChangeSource, "ADDED" | "IMPORT">;
    siteId?: string | null;
    /**
     * The shop's approval limits, when a person adds it with a cost. A first
     * price below that cost needs the owner, as a change to one does. "Price
     * changes need the owner" does not stop a manager adding a product: its
     * first price is not a change, and adding products is the manager's (W-09).
     */
    limits?: Pick<ApprovalLimits, "belowCostNeedsOwner">;
    /**
     * A case of a single (PRD-08, `packs.ts`): the single, how many it holds,
     * whether the till breaks it, and the other sites to keep an empty line
     * of it at (where the single has one), its unit "case" at each.
     */
    pack?: { of: { id: string; name: string }; size: number; breakAtTill: boolean; alsoAt: string[] };
  },
): Promise<ProductCreated> {
  const { actor, input } = args;
  const companyId = actor.companyId;

  // 1. One name at a time per company; then the rules a name, barcode, category and supplier keep.
  await lockProductNames(tx, companyId);
  await checkProductUnique(tx, companyId, { name: input.name, barcode: input.barcode ?? null });
  const category = input.categoryId ? await liveCategoryOf(tx, companyId, input.categoryId) : null;
  // A category that checks ID checks it for every product in it: No is refused here as the PATCH refuses it.
  if (input.ageCheck === false && category?.ageRestricted) {
    throw new ProductRefusal(400, categoryChecksWords(category.name), "ageCheck");
  }
  const supplier = input.supplierId ? await supplierOf(tx, companyId, input.supplierId) : null;
  const site = await stockSiteOf(tx, companyId, input.siteId ?? args.siteId ?? null);

  const price = money(input.price);
  const cost = input.cost ? money(input.cost) : null;
  if (args.limits) {
    const limits = { priceChanges: "MANAGERS" as const, belowCostNeedsOwner: args.limits.belowCostNeedsOwner };
    const refusal = priceChangeNeedsOwner(limits, actor, { price, cost });
    if (refusal) throw new ProductRefusal(400, refusal, "price");
  }

  // 2. Its code.
  const code = await freeCode(tx, companyId, site.id, input.name);

  // 3. The product.
  const byWeight = input.soldAs === "BY_WEIGHT";
  const returnable = input.returnable ?? false;
  const deposit = returnable
    ? money(input.depositAmount ?? (category?.depositAmount ? category.depositAmount.toString() : DEFAULT_DEPOSIT))
    : null;
  const product = await tx.product.create({
    data: {
      companyId,
      code,
      name: input.name,
      kind: "GOODS",
      categoryId: category?.id ?? null,
      defaultTaxRate: category ? category.vatRate : new Prisma.Decimal(STANDARD_VAT_RATE),
      // Null follows the category; the sheet's Yes or No is the product's own.
      ageRestricted: input.ageCheck ?? null,
      maxDiscountPercent: input.maxDiscountPercent ? new Prisma.Decimal(input.maxDiscountPercent) : null,
      returnable,
      depositAmount: deposit,
      unit: byWeight ? "KILOGRAM" : "EACH",
      costPrice: cost,
      supplierId: supplier?.id ?? null,
      standardPrice: price,
      barcode: input.barcode ?? null,
      imageUrl: input.imageUrl ?? null,
      isActive: true,
      createdById: actor.userId,
      ...(args.pack ? { packOfId: args.pack.of.id, packSize: args.pack.size, breakAtTill: args.pack.breakAtTill } : {}),
    },
    select: { id: true },
  });

  // 4. Its stock line, at the site, in the site's first place.
  const location =
    (await tx.stockLocation.findFirst({
      where: { siteId: site.id, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })) ??
    (await tx.stockLocation.create({ data: { siteId: site.id, code: "SHOP-FLOOR", name: "Shop floor" }, select: { id: true } }));
  const line = await tx.inventoryItem.create({
    data: {
      itemCode: code,
      name: input.name,
      category: "RETAIL",
      unit: args.pack ? "case" : byWeight ? "kg" : category?.ageRestricted ? "bottle" : "each",
      siteId: site.id,
      locationId: location.id,
      minStock: input.reorderAt ? new Prisma.Decimal(input.reorderAt) : null,
      unitCost: cost,
      productId: product.id,
    },
    select: { id: true },
  });

  // A case is kept wherever its single is: an empty line at each other site.
  for (const siteId of args.pack?.alsoAt ?? []) {
    if (siteId === site.id) continue;
    const place = await tx.stockLocation.findFirst({ where: { siteId, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!place) continue;
    const taken = await tx.inventoryItem.findFirst({ where: { siteId, itemCode: code }, select: { id: true } });
    await tx.inventoryItem.create({
      data: {
        itemCode: taken ? `${code}-${product.id.slice(0, 4).toUpperCase()}` : code,
        name: input.name,
        category: "RETAIL",
        unit: "case",
        siteId,
        locationId: place.id,
        unitCost: cost,
        productId: product.id,
      },
    });
  }

  // 5. On sale: its price on the default list, and the history row that says so.
  const list = await defaultPriceList(tx, companyId);
  const now = new Date();
  await tx.productPrice.create({
    data: { companyId, priceListId: list.id, productId: product.id, minQuantity: new Prisma.Decimal(1), unitPrice: price },
  });
  await tx.productPriceChange.create({
    data: {
      companyId,
      priceListId: list.id,
      productId: product.id,
      minQuantity: new Prisma.Decimal(1),
      fromPrice: null,
      toPrice: price,
      source: args.source,
      effectiveAt: now,
      appliedAt: now,
      createdById: actor.userId,
    },
  });

  // 6. What was already on the shelf.
  const quantity = input.openingStock ? new Prisma.Decimal(input.openingStock) : null;
  const opening =
    quantity && quantity.greaterThan(0)
      ? {
          quantity: quantity.toString(),
          unitCost: cost?.toFixed(2) ?? null,
          amount: (await recordOpeningStock(tx, { actor: named(actor), itemId: line.id, quantity, unitCost: cost })).amount,
        }
      : null;

  // 7. Its event.
  const payload = {
    code,
    name: input.name,
    price: auditAmount(price),
    category: category?.name ?? null,
    openingStock: opening?.quantity ?? null,
    site: site.name,
    ...(args.pack ? { packOf: args.pack.of.name, packSize: args.pack.size } : {}),
  };
  if (actor.userId) {
    await writeRetailAuditEvent(tx, {
      actor: named(actor),
      eventType: RETAIL_AUDIT_EVENTS.productCreated,
      entityType: "Product",
      entityId: product.id,
      payload,
    });
  } else {
    await writePlatformAuditEvent(
      {
        companyId,
        actorId: null,
        eventType: RETAIL_AUDIT_EVENTS.productCreated,
        entityType: "Product",
        entityId: product.id,
        payload: { actorRole: null, actorName: null, ...payload },
      },
      tx,
    );
  }

  return {
    productId: product.id,
    code,
    name: input.name,
    price: price.toFixed(2),
    site,
    itemId: line.id,
    opening: opening
      ? { ...opening, amount: opening.amount && opening.amount.greaterThan(0) ? opening.amount : null }
      : null,
  };
}

function named(actor: ProductActor): RetailAuditActor {
  if (!actor.userId) throw new ProductRefusal(400, "Opening stock needs someone to have counted it.", "openingStock");
  return { ...actor, userId: actor.userId };
}

/** Opening stock to post: the product, its line and site, and what it is worth at cost. */
export type OpeningPosting = {
  productId: string;
  code: string;
  name: string;
  siteId: string;
  itemId: string;
  quantity: string;
  unitCost: string | null;
  amount: Prisma.Decimal | null;
};

/** What a new product's opening stock posts, or null when it has no value. */
export function openingOf(created: ProductCreated): OpeningPosting | null {
  if (!created.opening) return null;
  return { productId: created.productId, code: created.code, name: created.name, siteId: created.site.id, itemId: created.itemId, ...created.opening };
}

/**
 * The journal for opening stock (Dr Stock / Cr Opening balances, the value
 * at cost to the cent), posted after the commit; null with no value.
 */
export function openingJournal(opening: OpeningPosting | null, actor: RetailAuditActor) {
  if (!opening?.amount) return null;
  const value = toNumberOrZero(opening.amount);
  return {
    companyId: actor.companyId,
    sourceType: "RETAIL_OPENING_STOCK" as const,
    sourceId: opening.productId,
    siteId: opening.siteId,
    entryDate: new Date(),
    description: `Opening stock ${opening.code}`,
    createdById: actor.userId,
    actorRole: actor.userRole ?? null,
    amount: value,
    netAmount: value,
    grossAmount: value,
    taxAmount: 0,
    inventory: {
      lines: [
        {
          inventoryItemId: opening.itemId,
          itemName: opening.name,
          quantity: Number(opening.quantity),
          unitCost: Number(opening.unitCost ?? 0),
          totalCost: value,
        },
      ],
      totalCost: value,
    },
  };
}
