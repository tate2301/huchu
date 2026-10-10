import type { Prisma } from "@prisma/client";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditAmount, type RecordValueKind } from "@/lib/retail/audit";
import { binState, type BinState } from "@/lib/retail/bin";
import { categoryPath, vatLabelOf } from "@/lib/retail/category-words";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { startOfDayIn } from "@/lib/reports/list-query";
import { ageCheckFor } from "@/lib/retail/products/age-check";
import { coverDays, marginOn, onHandLabel, saleFigures, type SaleFigures } from "@/lib/retail/products/figures";
import { loadSoldLines } from "@/lib/retail/products/sold-lines";
import { shopFeatures } from "@/lib/retail/shop-profile-rules";
import { stockLevel } from "@/lib/retail/stock/levels";
import { DEFAULT_TIME_ZONE, todayIn } from "@/lib/workspace/format";

/**
 * One product as its record and its Edit sheet read it (20-products 4.2,
 * PRD-03): what it is, its price on the default list and the others, what it
 * costs (for roles that may see cost), its supplier, how it is sold and its
 * stock at every site. `GET /products/[id]` answers with this; the `PATCH`
 * beside it answers with it again. PRD-04 adds its `figures`: sold and taken
 * over 30 days against the 30 before, today's sales and the cover; the
 * record's tabs count their own rows.
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
  /** The default list, for its worksheet link. */
  listId: string | null;
  currency: string;
  cost: number | null;
  /** The viewer's role may see what the shop pays. */
  seesCost: boolean;
  /** Of the price the customer pays, VAT included, as a percentage; null without cost or `view-cost`. */
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
  /** The shop charges deposits on returnable bottles (liquor stores). */
  depositsOn: boolean;
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
    sites: Array<{ id: string; name: string; onHand: number; reorderAt: number | null; reorderQty: number | null }>;
    /**
     * Reorder at and Reorder are changed on the record while at most one site
     * keeps levels for it, and that one is the line the record writes; with
     * two or more, each is changed on its line in On hand.
     */
    levelsEditable: boolean;
  };
  /** STK-01's rule over every site's stock, against every site's reorder level. */
  low: boolean;
  out: boolean;
  figures: SaleFigures & { coverDays: number | null };
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

export async function loadProductView(
  companyId: string,
  id: string,
  role: string | null | undefined,
  now = new Date(),
): Promise<ProductView | null> {
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
        // A list's own rows: the default's single price, another list's from its minimum (Wholesale from 6).
        where: { OR: [{ minQuantity: 1 }, { priceList: { isDefault: false } }], priceList: { archivedAt: null } },
        orderBy: { minQuantity: "asc" },
        select: { unitPrice: true, minQuantity: true, priceList: { select: { id: true, name: true, isDefault: true, currency: true, taxInclusive: true } } },
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

  const [defaultList, profile, bin, soldLines] = await Promise.all([
    prisma.priceList.findFirst({
      where: { companyId, isDefault: true, archivedAt: null },
      select: { id: true, name: true, currency: true, taxInclusive: true },
    }),
    prisma.retailShopProfile.findUnique({
      where: { companyId },
      select: { defaultSiteId: true, businessType: true, ageCheck: true, licenceHours: true, emptiesAndDeposits: true, casesAndSingles: true },
    }),
    binState(companyId, "Product", id, product.archivedAt),
    // This 30 days and the 30 before them.
    loadSoldLines(companyId, id, new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)),
  ]);

  const onDefault = product.prices.find((row) => row.priceList.id === defaultList?.id);
  const price = toNumberOrZero(onDefault?.unitPrice ?? product.standardPrice);
  const rate = toNumberOrZero(product.defaultTaxRate);
  const inclusive = defaultList?.taxInclusive ?? true;

  const seeCost = canRetailRoleDo(role, "retail.catalog", "view-cost");
  const cost = seeCost ? num(product.costPrice) : null;
  const margin = marginOn(price, cost);

  const lines = product.inventoryItems;
  const line = lines.find((row) => row.siteId === profile?.defaultSiteId) ?? lines[0] ?? null;
  const onHand = lines.reduce((sum, row) => sum + toNumberOrZero(row.currentStock), 0);
  const reorderAt = num(line?.minStock);
  const unit = line?.unit ?? "each";
  const sites = lines.map((row) => ({
    id: row.site.id,
    name: row.site.name,
    onHand: toNumberOrZero(row.currentStock),
    reorderAt: num(row.minStock),
    reorderQty: num(row.reorderQty),
  }));
  const keeping = lines.filter((row) => row.minStock !== null || row.reorderQty !== null);
  const levels = sites.map((site) => site.reorderAt).filter((value): value is number => value !== null);
  const figures = saleFigures(soldLines, now, startOfDayIn(todayIn(DEFAULT_TIME_ZONE, now), DEFAULT_TIME_ZONE));
  const level = stockLevel({
    onHand,
    reorderAt: levels.length ? levels.reduce((total, value) => total + value, 0) : null,
    soldLast30: figures.sold30,
    archived: !product.isActive,
  });
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
    listId: defaultList?.id ?? null,
    currency: defaultList?.currency ?? "USD",
    cost,
    seesCost: seeCost,
    margin: margin?.percent ?? null,
    marginPerUnit: margin?.perUnit ?? null,
    otherLists: product.prices
      .filter((row, index, rows) => row.priceList.id !== defaultList?.id && rows.findIndex((other) => other.priceList.id === row.priceList.id) === index)
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
    depositsOn: profile ? shopFeatures(profile).emptiesAndDeposits : false,
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
      sites,
      levelsEditable: keeping.length === 0 || (keeping.length === 1 && keeping[0]!.id === line?.id),
    },
    low: level === "LOW",
    out: level === "OUT",
    figures: { ...figures, coverDays: coverDays(onHand, figures.sold30) },
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
