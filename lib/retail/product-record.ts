import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditAmount, type RecordValueKind } from "@/lib/retail/audit";
import { binState, type BinState } from "@/lib/retail/bin";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { loadShelfListing, type ShelfListing } from "@/lib/retail/shelf-listing";
import { SHELF_PRICE_LIST_NAME } from "@/lib/retail/shelf-pricing";

/**
 * One product as its record page reads it (00-foundations 5.6.10): the shelf
 * listing, what the shop pays for it (for roles that may see cost), the other
 * price lists it is on, how it is sold, and the bin banner's facts when it is
 * in the bin. `GET /api/v2/retail/catalog/[id]` answers with this, and the
 * `PATCH` beside it answers with it again after an edit.
 */
export type ProductRecord = ShelfListing & {
  /** Null for roles that may not see cost, and when none is on file. */
  costPrice: number | null;
  /** Price lists other than the shelf's: "Wholesale US$16.90". */
  priceLists: Array<{ name: string; unitPrice: number; currency: string }>;
  /** A case's single, or the cases this single comes in. */
  soldAs: { single: { id: string; name: string } | null; cases: Array<{ id: string; name: string; packSize: number | null }> };
  bin: BinState | null;
};

export async function loadProductRecord(
  companyId: string,
  productId: string,
  role: string | null | undefined,
): Promise<ProductRecord | null> {
  const listing = await loadShelfListing(companyId, productId, { includeBinned: true });
  if (!listing) return null;
  const seeCost = canRetailRoleDo(role, "retail.catalog", "view-cost");
  const [product, prices, cases, bin] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, companyId }, select: { costPrice: true } }),
    prisma.productPrice.findMany({
      where: { companyId, productId, priceList: { name: { not: SHELF_PRICE_LIST_NAME } } },
      orderBy: { priceList: { name: "asc" } },
      select: { unitPrice: true, priceList: { select: { name: true, currency: true } } },
    }),
    prisma.product.findMany({
      where: { companyId, packOfId: productId, archivedAt: null },
      orderBy: { packSize: "asc" },
      select: { id: true, name: true, packSize: true },
    }),
    binState(companyId, "Product", productId, listing.binnedAt),
  ]);
  return {
    ...listing,
    costPrice: seeCost && product?.costPrice !== null && product?.costPrice !== undefined ? toNumberOrZero(product.costPrice) : null,
    priceLists: prices.map((price) => ({
      name: price.priceList.name,
      unitPrice: toNumberOrZero(price.unitPrice),
      currency: price.priceList.currency,
    })),
    soldAs: { single: listing.packOf, cases },
    bin,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   What an edit changed (W-62), field by field, for RETAIL_RECORD.EDITED
   ────────────────────────────────────────────────────────────────────────── */

type Before = {
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  taxPercent: number;
  costPrice: number | null;
  reorderLevel: number | null;
  reorderQty: number | null;
  category: string | null;
  categoryId: string | null;
  returnable: boolean;
  depositAmount: number | null;
  /** The product's own ID check; null follows its category. */
  ownAgeRestricted: boolean | null;
  maxDiscountPercent: number | null;
  status: string;
  imageUrl: string | null;
};

type FieldWords = { label: string; kind: RecordValueKind; value(input: Before): string | null };

const money = (value: number | null) => (value === null ? null : auditAmount(value));
const plain = (value: number | null) => (value === null ? null : String(value));

/** The product's editable fields: their label in the rail and how a value is written down. */
export const PRODUCT_FIELDS: Record<string, FieldWords> = {
  name: { label: "Name", kind: "text", value: (p) => p.name },
  sku: { label: "Code", kind: "text", value: (p) => p.sku },
  barcode: { label: "Barcode", kind: "text", value: (p) => p.barcode },
  description: { label: "Description", kind: "text", value: (p) => p.description },
  unitPrice: { label: "Price", kind: "money", value: (p) => money(p.unitPrice) },
  compareAtPrice: { label: "Was", kind: "money", value: (p) => money(p.compareAtPrice) },
  taxPercent: { label: "VAT", kind: "percent", value: (p) => plain(p.taxPercent) },
  costPrice: { label: "Cost", kind: "money", value: (p) => money(p.costPrice) },
  reorderLevel: { label: "Reorder at", kind: "count", value: (p) => plain(p.reorderLevel) },
  reorderQty: { label: "Reorder", kind: "count", value: (p) => plain(p.reorderQty) },
  categoryId: { label: "Category", kind: "text", value: (p) => p.category },
  returnable: { label: "Returnable", kind: "text", value: (p) => (p.returnable ? "Yes" : "No") },
  depositAmount: { label: "Deposit", kind: "money", value: (p) => money(p.depositAmount) },
  ageRestricted: {
    label: "ID check",
    kind: "text",
    value: (p) => (p.ownAgeRestricted === null ? "As category" : p.ownAgeRestricted ? "Yes" : "No"),
  },
  maxDiscountPercent: { label: "Most off", kind: "percent", value: (p) => plain(p.maxDiscountPercent) },
  status: { label: "On sale", kind: "text", value: (p) => (p.status === "ACTIVE" ? "Yes" : "No") },
  imageUrl: { label: "Photo", kind: "text", value: (p) => (p.imageUrl ? "A photo" : null) },
};

export type FieldChange = { field: string; label: string; kind: RecordValueKind; from: string | null; to: string | null };

/** The fields that were sent and whose value moved, before against after. */
export function productChanges(sent: string[], before: Before, after: Before): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of sent) {
    const words = PRODUCT_FIELDS[field];
    if (!words) continue;
    const from = words.value(before);
    const to = words.value(after);
    if (from !== to) changes.push({ field, label: words.label, kind: words.kind, from, to });
  }
  return changes;
}

/** A record or a listing as the edit diff reads it. */
export function productBefore(record: ProductRecord): Before {
  return {
    name: record.name,
    sku: record.sku,
    barcode: record.barcode,
    description: record.description,
    unitPrice: record.unitPrice,
    compareAtPrice: record.compareAtPrice,
    taxPercent: record.taxPercent,
    costPrice: record.costPrice,
    reorderLevel: record.inventoryItem?.reorderLevel ?? null,
    reorderQty: record.inventoryItem?.reorderQty ?? null,
    category: record.category,
    categoryId: record.categoryId,
    returnable: record.returnable,
    depositAmount: record.depositAmount,
    ownAgeRestricted: record.ownAgeRestricted,
    maxDiscountPercent: record.maxDiscountPercent,
    status: record.status,
    imageUrl: record.imageUrl,
  };
}
