import type { Prisma } from "@prisma/client";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditAmount, type RecordValueKind } from "@/lib/retail/audit";
import { binState, type BinState } from "@/lib/retail/bin";
import { categoryPath, vatLabelOf } from "@/lib/retail/category-words";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { ageCheckFor } from "@/lib/retail/products/age-check";
import { onHandLabel } from "@/lib/retail/products/figures";
import { shopFeatures } from "@/lib/retail/shop-profile-rules";

/**
 * One product as its record and its Edit sheet read it (20-products 4.2,
 * PRD-03): what it is, its price on the default list and the others, what it
 * costs (for roles that may see cost), its supplier, how it is sold and its
 * stock at every site. `GET /products/[id]` answers with this; the `PATCH`
 * beside it answers with it again. PRD-04 adds `figures` and `tabCounts`.
 */

export type ProductEditable =
  | "name"
  | "code"
  | "barcode"
  | "category"
  | "price"
  | "cost"
  | "reorderAt"
  | "reorderQty"
  | "supplier"
  | "ageCheck"
  | "maxDiscount"
  | "deposit";

export type ProductView = {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  imageUrl: string | null;
  /** On sale. False: archived (off every till), or in the bin. */
  isActive: boolean;
  /** When it went in the bin. */
  archivedAt: string | null;
  binnedBy: string | null;
  bin: BinState | null;
  category: { id: string; name: string; path: string; vatLabel: string; ageCheck: boolean } | null;
  /** "15.5% included": the product's own rate, as the default list charges it. */
  vatLabel: string;
  /** The till asks for ID: the product's own answer, else its category's. */
  ageCheck: boolean;
  /** Its own answer, over the category's; null follows the category. */
  ownAgeCheck: boolean | null;
  /** The most any discount may take off it, as a percentage; null: no limit. */
  maxDiscountPercent: number | null;
  price: number;
  listName: string;
  currency: string;
  cost: number | null;
  /** Of the price before VAT, as a percentage; null without cost or `view-cost`. */
  margin: number | null;
  marginPerUnit: number | null;
  otherLists: Array<{ id: string; name: string; price: number; currency: string }>;
  supplier: { id: string; name: string } | null;
  /** "Single; case of 24", "By weight", "Case of 24 Castle Lager 340ml". */
  soldAs: string;
  soldAsKind: "SINGLE" | "BY_WEIGHT";
  packOf: { id: string; name: string } | null;
  packSize: number | null;
  breakAtTill: boolean;
  /** Sold by the case too: an active case holds this single. */
  hasCases: boolean;
  /** The shop's Cases and singles switch (liquor stores). */
  casesAndSingles: boolean;
  returnable: boolean;
  depositAmount: number | null;
  /** The stock line's unit: "bottle". */
  unit: string;
  stock: {
    onHand: number;
    onHandLabel: string;
    reorderAt: number | null;
    reorderQty: number | null;
    /** The line Reorder at and Reorder write: the default site's, else the first; and its site. */
    lineId: string | null;
    siteId: string | null;
    sites: Array<{ id: string; name: string; onHand: number }>;
  };
  low: boolean;
  out: boolean;
  /** Any movement on any of its lines: opening stock and its site are no longer asked. */
  hasMovements: boolean;
  canEdit: Record<ProductEditable, boolean>;
};

const num = (value: Prisma.Decimal | null | undefined) => (value === null || value === undefined ? null : toNumberOrZero(value));

function soldAsWords(product: {
  unit: string;
  packOf: { name: string } | null;
  packSize: number | null;
  packs: Array<{ packSize: number | null }>;
}): string {
  if (product.unit === "KILOGRAM") return "By weight";
  if (product.packOf) return `Case of ${product.packSize ?? "?"} ${product.packOf.name}`;
  if (product.packs.length) return `Single; ${product.packs.map((pack) => `case of ${pack.packSize ?? "?"}`).join(", ")}`;
  return "Single";
}

export async function loadProductView(companyId: string, id: string, role: string | null | undefined): Promise<ProductView | null> {
  const product = await prisma.product.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      code: true,
      name: true,
      barcode: true,
      imageUrl: true,
      isActive: true,
      archivedAt: true,
      ageRestricted: true,
      maxDiscountPercent: true,
      defaultTaxRate: true,
      standardPrice: true,
      costPrice: true,
      returnable: true,
      depositAmount: true,
      unit: true,
      packSize: true,
      breakAtTill: true,
      packOf: { select: { id: true, name: true } },
      packs: { where: { archivedAt: null }, orderBy: { packSize: "asc" }, select: { packSize: true } },
      supplier: { select: { id: true, name: true } },
      retailCategory: {
        select: { id: true, name: true, vatRate: true, vatExempt: true, ageRestricted: true, parent: { select: { name: true } } },
      },
      prices: {
        where: { minQuantity: 1 },
        select: { unitPrice: true, priceList: { select: { id: true, name: true, isDefault: true, currency: true, taxInclusive: true } } },
      },
      inventoryItems: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          siteId: true,
          unit: true,
          currentStock: true,
          minStock: true,
          reorderQty: true,
          site: { select: { id: true, name: true } },
          _count: { select: { movements: true } },
        },
      },
    },
  });
  if (!product) return null;

  const [defaultList, profile, bin] = await Promise.all([
    prisma.priceList.findFirst({
      where: { companyId, isDefault: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, currency: true, taxInclusive: true },
    }),
    prisma.retailShopProfile.findUnique({
      where: { companyId },
      select: { defaultSiteId: true, businessType: true, ageCheck: true, licenceHours: true, emptiesAndDeposits: true, casesAndSingles: true },
    }),
    binState(companyId, "Product", id, product.archivedAt),
  ]);

  const onDefault = product.prices.find((row) => row.priceList.id === defaultList?.id);
  const price = toNumberOrZero(onDefault?.unitPrice ?? product.standardPrice);
  const rate = toNumberOrZero(product.defaultTaxRate);
  const inclusive = defaultList?.taxInclusive ?? true;

  const seeCost = canRetailRoleDo(role, "retail.catalog", "view-cost");
  const cost = seeCost ? num(product.costPrice) : null;
  const net = inclusive ? price / (1 + rate / 100) : price;
  const marginPerUnit = cost === null ? null : Math.round((net - cost) * 100) / 100;
  const margin = cost === null || net <= 0 ? null : Math.round(((net - cost) / net) * 1000) / 10;

  const lines = product.inventoryItems;
  const line = lines.find((row) => row.siteId === profile?.defaultSiteId) ?? lines[0] ?? null;
  const onHand = lines.reduce((sum, row) => sum + toNumberOrZero(row.currentStock), 0);
  const reorderAt = num(line?.minStock);
  const unit = line?.unit ?? "each";
  const update = canRetailRoleDo(role, "retail.catalog", "update");

  const category = product.retailCategory;
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    barcode: product.barcode,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    archivedAt: product.archivedAt?.toISOString() ?? null,
    binnedBy: bin?.by?.name ?? null,
    bin,
    category: category
      ? {
          id: category.id,
          name: category.name,
          path: categoryPath(category),
          vatLabel: vatLabelOf(category),
          ageCheck: category.ageRestricted,
        }
      : null,
    vatLabel: rate > 0 ? `${rate}%${inclusive ? " included" : " added at the till"}` : category?.vatExempt ? "Exempt" : "Zero-rated",
    ageCheck: ageCheckFor(product),
    ownAgeCheck: product.ageRestricted,
    maxDiscountPercent: num(product.maxDiscountPercent),
    price,
    listName: defaultList?.name ?? "Retail",
    currency: defaultList?.currency ?? "USD",
    cost,
    margin,
    marginPerUnit,
    otherLists: product.prices
      .filter((row) => row.priceList.id !== defaultList?.id)
      .map((row) => ({ id: row.priceList.id, name: row.priceList.name, price: toNumberOrZero(row.unitPrice), currency: row.priceList.currency }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    supplier: product.supplier,
    soldAs: soldAsWords(product),
    soldAsKind: product.unit === "KILOGRAM" ? "BY_WEIGHT" : "SINGLE",
    packOf: product.packOf,
    packSize: product.packOf ? product.packSize : null,
    breakAtTill: product.breakAtTill,
    hasCases: product.packs.length > 0,
    casesAndSingles: profile ? shopFeatures(profile).casesAndSingles : false,
    returnable: product.returnable,
    depositAmount: num(product.depositAmount),
    unit,
    stock: {
      onHand,
      onHandLabel: onHandLabel(onHand, unit),
      reorderAt,
      reorderQty: num(line?.reorderQty),
      lineId: line?.id ?? null,
      siteId: line?.siteId ?? null,
      sites: lines.map((row) => ({ id: row.site.id, name: row.site.name, onHand: toNumberOrZero(row.currentStock) })),
    },
    low: onHand > 0 && reorderAt !== null && onHand <= reorderAt,
    out: onHand <= 0,
    hasMovements: lines.some((row) => row._count.movements > 0),
    canEdit: {
      name: update,
      code: update,
      barcode: update,
      category: update,
      price: update && canRetailRoleDo(role, "retail.prices", "update"),
      cost: update && seeCost,
      reorderAt: update,
      reorderQty: update,
      supplier: update,
      ageCheck: update,
      maxDiscount: update,
      deposit: update,
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   What an edit changed (W-62), field by field, for RETAIL_RECORD.EDITED
   ────────────────────────────────────────────────────────────────────────── */

/** A product's editable values, as the diff reads them. */
export type ProductValues = {
  name: string;
  code: string;
  barcode: string | null;
  price: number;
  cost: number | null;
  reorderAt: number | null;
  reorderQty: number | null;
  category: string | null;
  supplier: string | null;
  soldAs: "SINGLE" | "BY_WEIGHT";
  returnable: boolean;
  depositAmount: number | null;
  imageUrl: string | null;
  /** The product's own 18+ answer; null follows its category. */
  ageCheck: boolean | null;
  maxDiscountPercent: number | null;
};

type FieldWords = { label: string; kind: RecordValueKind; value(input: ProductValues): string | null };

const money = (value: number | null) => (value === null ? null : auditAmount(value));
const plain = (value: number | null) => (value === null ? null : String(value));

/** The product's editable fields by the name the `PATCH` body uses: their label and how a value is written down. */
export const PRODUCT_FIELDS: Record<string, FieldWords> = {
  name: { label: "Name", kind: "text", value: (p) => p.name },
  code: { label: "Code", kind: "text", value: (p) => p.code },
  barcode: { label: "Barcode", kind: "text", value: (p) => p.barcode },
  price: { label: "Price", kind: "money", value: (p) => money(p.price) },
  cost: { label: "Cost", kind: "money", value: (p) => money(p.cost) },
  reorderAt: { label: "Reorder at", kind: "count", value: (p) => plain(p.reorderAt) },
  reorderQty: { label: "Reorder", kind: "count", value: (p) => plain(p.reorderQty) },
  categoryId: { label: "Category", kind: "text", value: (p) => p.category },
  supplierId: { label: "Supplier", kind: "text", value: (p) => p.supplier },
  soldAs: { label: "Sold as", kind: "text", value: (p) => (p.soldAs === "BY_WEIGHT" ? "By weight" : "Single") },
  returnable: { label: "Returnable", kind: "text", value: (p) => (p.returnable ? "Yes" : "No") },
  depositAmount: { label: "Deposit", kind: "money", value: (p) => money(p.depositAmount) },
  imageUrl: { label: "Photo", kind: "text", value: (p) => (p.imageUrl ? "A photo" : null) },
  ageCheck: { label: "ID check", kind: "text", value: (p) => (p.ageCheck === null ? "As category" : p.ageCheck ? "Yes" : "No") },
  maxDiscountPercent: { label: "Most off", kind: "percent", value: (p) => plain(p.maxDiscountPercent) },
};

export type FieldChange = { field: string; label: string; kind: RecordValueKind; from: string | null; to: string | null };

/** The fields that were sent and whose value moved, before against after. */
export function productChanges(sent: string[], before: ProductValues, after: ProductValues): FieldChange[] {
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
