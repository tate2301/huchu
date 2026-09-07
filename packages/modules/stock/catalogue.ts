/**
 * The shared product catalogue.
 *
 * One list of "things we sell", owned by Stock & Inventory and consumed by
 * every module that sells anything. Before this each module grew its own —
 * which meant the same pump could carry a different price depending on which
 * screen you opened it from, and nobody could say which was right.
 *
 * The split that makes this work:
 *
 *   Product        what a thing *is*      — company-wide, one row
 *   InventoryItem  how much is at a site  — per site, optional
 *   PriceList      what it costs to whom  — per list, optional
 *
 * A service has a Product and neither of the others. A stocked good has a
 * Product, an InventoryItem per site, and as many price-list entries as the
 * business bothers to set. Nothing forces a module to care about parts it
 * doesn't use — which is the whole point of keeping them apart.
 *
 * Everything here is pure. Database access lives in `catalogue-service.ts`.
 */
import type { PriceListKind, ProductKind, UnitOfMeasure } from "@corelithzw/db";
import { z } from "zod";

export const PRODUCT_KINDS = ["GOODS", "SERVICE", "LABOUR", "MATERIAL", "BUNDLE"] as const;

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  GOODS: "Product",
  SERVICE: "Service",
  LABOUR: "Labour",
  MATERIAL: "Material",
  BUNDLE: "Bundle",
};

export const UNITS = [
  "EACH",
  "METRE",
  "SQUARE_METRE",
  "HOUR",
  "DAY",
  "PACKAGE",
  "INSTALLATION",
  "LITRE",
  "KILOGRAM",
  "OTHER",
] as const;

export const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  EACH: "each",
  METRE: "metre",
  SQUARE_METRE: "m²",
  HOUR: "hour",
  DAY: "day",
  PACKAGE: "package",
  INSTALLATION: "installation",
  LITRE: "litre",
  KILOGRAM: "kg",
  OTHER: "unit",
};

export const PRICE_LIST_KINDS = [
  "STANDARD",
  "WHOLESALE",
  "TRADE",
  "VIP",
  "REGIONAL",
  // S-1 — the shelf price a customer at the counter is charged. The kind exists
  // so a till can ask for its list by name; resolving a price through it is S-3.
  "RETAIL",
] as const;

export const PRICE_LIST_KIND_LABELS: Record<PriceListKind, string> = {
  STANDARD: "Standard",
  WHOLESALE: "Wholesale",
  TRADE: "Trade",
  VIP: "VIP",
  REGIONAL: "Region-specific",
  RETAIL: "Retail shelf",
};

/** Only goods can be held in stock. Asking "how many hours are on the shelf" is a category error. */
export function isStockable(kind: ProductKind): boolean {
  return kind === "GOODS" || kind === "MATERIAL";
}

export function unitLabel(product: { unit: UnitOfMeasure; unitLabel?: string | null }): string {
  if (product.unit === "OTHER") return product.unitLabel?.trim() || UNIT_LABELS.OTHER;
  return UNIT_LABELS[product.unit];
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export type PriceEntry = { minQuantity: number; unitPrice: number };

export type PriceResolution = {
  unitPrice: number;
  /** Where the number came from, so a UI can say so and a bug can be traced. */
  source: "PRICE_LIST" | "VOLUME_BREAK" | "STANDARD";
  priceListId?: string | null;
  priceListName?: string | null;
};

/**
 * What one unit costs this buyer at this quantity.
 *
 * The precedence is deliberately short and written down, because "why is this
 * price different from the one on the shelf" is the question this module exists
 * to answer:
 *
 *   1. The chosen price list's entry with the highest `minQuantity` at or below
 *      the quantity ordered.
 *   2. Failing that, the product's own standard price.
 *
 * There is no cascade through other lists, no percentage-off-a-base, no
 * formula. The spec asked for simple, and a pricing engine nobody can predict
 * is worse than a list somebody has to maintain.
 */
export function resolvePrice(params: {
  standardPrice: number;
  quantity?: number;
  entries?: PriceEntry[];
  priceListId?: string | null;
  priceListName?: string | null;
}): PriceResolution {
  const quantity = params.quantity ?? 1;
  const entries = params.entries ?? [];

  const applicable = entries
    .filter((entry) => quantity >= entry.minQuantity)
    .sort((a, b) => b.minQuantity - a.minQuantity)[0];

  if (!applicable) {
    return { unitPrice: params.standardPrice, source: "STANDARD" };
  }

  return {
    unitPrice: applicable.unitPrice,
    // A break above the list's base row is worth distinguishing: it explains a
    // price that changes when somebody edits the quantity.
    source: applicable.minQuantity > 1 ? "VOLUME_BREAK" : "PRICE_LIST",
    priceListId: params.priceListId ?? null,
    priceListName: params.priceListName ?? null,
  };
}

/**
 * Pick the list to price against.
 *
 * An explicit choice wins; otherwise the customer's own list; otherwise the
 * company default; otherwise none, and everything falls back to standard
 * prices. Written as a function so every module resolves it the same way.
 */
export function choosePriceList<T extends { id: string; isDefault: boolean; isActive: boolean }>(
  lists: T[],
  preference?: { priceListId?: string | null; customerPriceListId?: string | null },
): T | null {
  const active = lists.filter((list) => list.isActive);
  const byId = (id?: string | null) => (id ? active.find((list) => list.id === id) : undefined);

  return (
    byId(preference?.priceListId) ??
    byId(preference?.customerPriceListId) ??
    active.find((list) => list.isDefault) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Module adapters
// ---------------------------------------------------------------------------

/**
 * The shape every consuming module turns a product into.
 *
 * Modules differ in what they do with a catalogue item — the CRM puts it on a
 * quote, Retail rings it up, a workshop adds it to a job card — but they all
 * need the same handful of facts. Adapters below convert this one shape into
 * each module's own line type, so adding a module means writing an adapter
 * rather than touching the catalogue.
 */
export type CatalogueLine = {
  productId: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  unit: string;
  costPrice: number | null;
  maxDiscountPercent: number | null;
  priceSource: PriceResolution["source"];
};

export type CatalogueProduct = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  kind: ProductKind;
  unit: UnitOfMeasure;
  unitLabel?: string | null;
  standardPrice: number;
  costPrice?: number | null;
  defaultTaxRate: number;
  maxDiscountPercent?: number | null;
};

/** Turn a catalogue item into a neutral line, priced for this buyer. */
export function toCatalogueLine(
  product: CatalogueProduct,
  options: { quantity?: number; entries?: PriceEntry[]; priceListId?: string | null } = {},
): CatalogueLine {
  const quantity = options.quantity ?? 1;
  const price = resolvePrice({
    standardPrice: product.standardPrice,
    quantity,
    entries: options.entries,
    priceListId: options.priceListId,
  });

  return {
    productId: product.id,
    code: product.code,
    description: product.name,
    quantity,
    unitPrice: price.unitPrice,
    taxRate: product.defaultTaxRate,
    unit: unitLabel(product),
    costPrice: product.costPrice ?? null,
    maxDiscountPercent: product.maxDiscountPercent ?? null,
    priceSource: price.source,
  };
}

/**
 * A document line is a *copy*, not a reference.
 *
 * Spec 17.2: description, quantity and price may all be overridden on a
 * document without touching the catalogue. That is not a convenience — a quote
 * sent in March must still say what it said in March after somebody edits the
 * price in April.
 */
export function applyLineOverrides(
  line: CatalogueLine,
  overrides: { description?: string; quantity?: number; unitPrice?: number; taxRate?: number },
): CatalogueLine {
  return {
    ...line,
    description: overrides.description?.trim() || line.description,
    quantity: overrides.quantity ?? line.quantity,
    unitPrice: overrides.unitPrice ?? line.unitPrice,
    taxRate: overrides.taxRate ?? line.taxRate,
  };
}

/** Was this line changed from what the catalogue says? Worth showing. */
export function isOverridden(line: CatalogueLine, product: CatalogueProduct): boolean {
  return line.description !== product.name || line.taxRate !== product.defaultTaxRate;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const productSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  kind: z.enum(PRODUCT_KINDS).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  unit: z.enum(UNITS).optional(),
  unitLabel: z.string().trim().max(40).nullable().optional(),
  standardPrice: z.number().finite().nonnegative(),
  costPrice: z.number().finite().nonnegative().nullable().optional(),
  defaultTaxRate: z.number().finite().min(0).max(100).optional(),
  currency: z.string().trim().length(3).optional(),
  maxDiscountPercent: z.number().finite().min(0).max(100).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  attributes: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const priceListSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(PRICE_LIST_KINDS).optional(),
  isDefault: z.boolean().optional(),
  region: z.string().trim().max(80).nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  isActive: z.boolean().optional(),
});

export const priceEntrySchema = z.object({
  productId: z.string().uuid(),
  minQuantity: z.number().finite().positive().optional(),
  unitPrice: z.number().finite().nonnegative(),
});

/** A region-specific list without a region is a list nobody can pick correctly. */
export function validatePriceList(input: {
  kind?: PriceListKind;
  region?: string | null;
}): string | null {
  if (input.kind === "REGIONAL" && !input.region?.trim()) {
    return "A region-specific price list needs to say which region";
  }
  return null;
}
