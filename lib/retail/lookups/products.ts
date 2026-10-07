import {
  CategoryRefusal,
  categoryInput,
  createCategory,
  liveCategories,
  vatOf,
  type CategoryVat,
} from "@/lib/retail/categories";

import { Prisma } from "@prisma/client";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { defaultSiteFor } from "@/lib/retail/floor/default-site";
import { PRINT_HERE, printerName } from "@/lib/retail/labels/words";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { createProduct, ProductRefusal } from "@/lib/retail/products/create";
import { productFieldErrors, productInput } from "@/lib/retail/products/input";
import { formatCount } from "@/lib/workspace/format";

import { LookupFieldErrors, type LookupNoun, type LookupOption } from "./types";

/** Products' nouns: `category`, with its inline add; `product`, with its quick add; `pack`. */

/** "VAT 15%, age check", "VAT 0%", "VAT exempt". */
export function categorySub(row: { vatRate: unknown; vatExempt?: boolean; ageRestricted: boolean }): string {
  const vat = vatOf({ vatRate: Number(row.vatRate), vatExempt: row.vatExempt ?? false });
  const rate = vat === "EXEMPT" ? "VAT exempt" : `VAT ${Number(row.vatRate).toString()}%`;
  return `${rate}${row.ageRestricted ? ", age check" : ""}`;
}

/** "15%", "15", "Zero-rated", "0%", "Exempt" → the VAT it means; anything else → null. */
export function parseVat(typed: string): CategoryVat | null {
  const text = typed.trim().toLowerCase();
  if (text === "exempt") return "EXEMPT";
  if (text === "zero-rated" || text === "zero rated") return "ZERO_RATED";
  const match = /^(\d+(?:\.\d+)?)\s*%?$/.exec(text);
  if (!match) return null;
  const rate = Number(match[1]);
  if (rate === 0) return "ZERO_RATED";
  return rate === 15 ? "STANDARD" : null;
}

/** "Yes" / "No" (and y, n, true, false) → a boolean; anything else → null. */
export function parseYesNo(typed: string): boolean | null {
  const text = typed.trim().toLowerCase();
  if (["yes", "y", "true"].includes(text)) return true;
  if (["no", "n", "false"].includes(text)) return false;
  return null;
}

/**
 * Categories (FND, changed by PRD-02): read with the range, so anyone who
 * files a product can pick one; children read "Spirits · Liqueur".
 * `context.topLevel` offers only top-level ones ("Inside"); `context.exclude`
 * leaves out a category and those inside it (where its products may move).
 */
const category: LookupNoun = {
  noun: "category",
  read: [["retail.catalog", "view"]],
  create: ["retail.categories", "create"],
  quick: [
    { key: "name", label: "Name", placeholder: "" },
    { key: "vat", label: "VAT", placeholder: "15%", value: "15%" },
    { key: "age", label: "18+ check", placeholder: "Yes", value: "Yes" },
  ],
  async search(ctx, q, context) {
    const needle = q.toLowerCase();
    const exclude = typeof context.exclude === "string" ? context.exclude : null;
    const rows = await liveCategories(ctx.companyId);
    return rows
      .filter((row) => !(context.topLevel && row.parentId))
      .filter((row) => !exclude || (row.id !== exclude && row.parentId !== exclude))
      .filter((row) => !needle || row.path.toLowerCase().includes(needle))
      .map((row): LookupOption => ({ id: row.id, label: row.path, sub: categorySub(row) }));
  },
  async add(ctx, fields) {
    const errors: Record<string, string> = {};
    const name = (fields.name ?? "").trim();
    if (!name) errors.name = "Name is needed.";
    else if (name.length > 80) errors.name = "Keep the name to 80 characters.";
    const vat = parseVat(fields.vat ?? "15%");
    if (vat === null) errors.vat = "Give VAT as 15%, Zero-rated or Exempt.";
    const ageCheck = parseYesNo(fields.age ?? "Yes");
    if (ageCheck === null) errors.age = "Say Yes or No.";
    if (Object.keys(errors).length > 0) throw new LookupFieldErrors(errors);

    try {
      const created = await createCategory(
        { companyId: ctx.companyId, userId: ctx.userId, userName: ctx.userName, userRole: ctx.session.user?.role ?? null },
        categoryInput.parse({ name, vat, ageCheck }),
      );
      return {
        id: created.id,
        label: created.path,
        sub: categorySub({ vatRate: created.vat === "STANDARD" ? 15 : 0, vatExempt: created.vat === "EXEMPT", ageRestricted: created.ageCheck }),
      };
    } catch (error) {
      if (error instanceof CategoryRefusal && error.field) throw new LookupFieldErrors({ [error.field === "name" ? "name" : "vat"]: error.message });
      throw error;
    }
  },
};

/** "Beer · 6001108": the category and the first seven digits of the barcode; the category alone without one. */
export function productSub(row: { category: string | null; barcode: string | null }): string | null {
  const parts = [row.category, row.barcode ? row.barcode.slice(0, 7) : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const productSelect = {
  id: true,
  name: true,
  barcode: true,
  costPrice: true,
  retailCategory: { select: { name: true } },
} satisfies Prisma.ProductSelect;

/**
 * Products (PRD-03): live products on sale, by name, code or barcode, an
 * exact barcode first. `context.singles` leaves out cases; `context.listId`
 * leaves out those already on that list, `context.onList` offers only those on
 * it (Change many prices' add row); `context.ids` offers only those products
 * (a sheet opened on ticked rows names them). A role that may see cost gets each
 * one's cost. The quick add makes a product on sale with a name and a price
 * at the default site, in no category.
 */
const product: LookupNoun = {
  noun: "product",
  read: [["retail.catalog", "view"]],
  create: ["retail.catalog", "create"],
  quick: [
    { key: "name", label: "Name", placeholder: "" },
    { key: "price", label: "Price", placeholder: "" },
  ],
  ranked: true,
  async search(ctx, q, context) {
    const needle = q.trim();
    const listId = typeof context.listId === "string" ? context.listId : null;
    const onList = typeof context.onList === "string" ? context.onList : null;
    const ids = Array.isArray(context.ids) ? context.ids.filter((id): id is string => typeof id === "string").slice(0, 500) : null;
    const where: Prisma.ProductWhereInput = {
      companyId: ctx.companyId,
      archivedAt: null,
      isActive: true,
      ...(context.singles ? { packOfId: null } : {}),
      ...(ids ? { id: { in: ids } } : {}),
      ...(listId && onList ? { AND: [{ prices: { none: { priceListId: listId } } }, { prices: { some: { priceListId: onList } } }] } : {}),
      ...(listId && !onList ? { prices: { none: { priceListId: listId } } } : {}),
      ...(onList && !listId ? { prices: { some: { priceListId: onList } } } : {}),
      ...(needle
        ? {
            OR: [
              { name: { contains: needle, mode: "insensitive" } },
              { code: { contains: needle, mode: "insensitive" } },
              { barcode: { contains: needle.replace(/ /g, "") } },
            ],
          }
        : {}),
    };
    const rows = await prisma.product.findMany({ where, orderBy: { name: "asc" }, take: ids ? 500 : 200, select: productSelect });
    const lower = needle.toLowerCase();
    const digits = needle.replace(/ /g, "");
    const rank = (row: (typeof rows)[number]) => {
      if (digits && row.barcode === digits) return 0;
      const name = row.name.toLowerCase();
      if (lower && name.startsWith(lower)) return 1;
      if (lower && name.includes(lower)) return 2;
      return 3;
    };
    const seeCost = canRetailSessionDo(ctx.session, "retail.catalog", "view-cost");
    return [...rows]
      .sort((a, b) => rank(a) - rank(b))
      .map((row): LookupOption => ({
        id: row.id,
        label: row.name,
        sub: productSub({ category: row.retailCategory?.name ?? null, barcode: row.barcode }),
        ...(seeCost ? { cost: row.costPrice === null ? null : row.costPrice.toFixed(2) } : {}),
      }));
  },
  async add(ctx, fields) {
    const parsed = productInput.safeParse({ name: fields.name ?? "", price: fields.price ?? "" });
    if (!parsed.success) throw new LookupFieldErrors(productFieldErrors(parsed.error).fieldErrors);
    try {
      const created = await prisma.$transaction((tx) =>
        createProduct(tx, {
          actor: { companyId: ctx.companyId, userId: ctx.userId, userName: ctx.userName, userRole: ctx.session.user?.role ?? null },
          input: parsed.data,
          source: "ADDED",
        }),
      );
      return {
        id: created.productId,
        label: created.name,
        sub: null,
        notice: `${created.name} is on sale at US$${created.price} on every till.`,
      };
    } catch (error) {
      if (error instanceof ProductRefusal && error.field) {
        throw new LookupFieldErrors({ [error.field === "price" ? "price" : "name"]: error.message });
      }
      throw error;
    }
  },
};

/** Cases (`packOfId` set): "4 cases" on hand at `context.siteId`. PRD-08 adds the quick add. */
const pack: LookupNoun = {
  noun: "pack",
  read: [["retail.catalog", "view"]],
  quick: [],
  async search(ctx, q, context) {
    const siteId = typeof context.siteId === "string" ? context.siteId : null;
    const rows = await prisma.product.findMany({
      where: {
        companyId: ctx.companyId,
        archivedAt: null,
        packOfId: { not: null },
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        inventoryItems: { where: siteId ? { siteId } : { id: "" }, select: { currentStock: true } },
      },
    });
    return rows.map((row): LookupOption => {
      if (!siteId) return { id: row.id, label: row.name, sub: null };
      const onHand = row.inventoryItems.reduce((sum, line) => sum + toNumberOrZero(line.currentStock), 0);
      return { id: row.id, label: row.name, sub: `${formatCount(onHand)} ${onHand === 1 ? "case" : "cases"}`, onHand };
    });
  },
};

/**
 * Printers for shelf labels (PRD-06): every live till with a printer, "<till>
 * printer" over its site, the paired ones first (those at the person's own
 * site before the rest), then "Print here". `context.pick: "default"` answers
 * the one the sheet starts on: the first paired till printer at the person's
 * site, else Print here. Nobody adds a printer here.
 */
const printer: LookupNoun = {
  noun: "printer",
  read: [
    ["retail.catalog", "update"],
    ["retail.adjustments", "create"],
  ],
  quick: [],
  ranked: true,
  async search(ctx, q, context) {
    const [registers, siteId] = await Promise.all([
      prisma.retailRegister.findMany({
        where: { companyId: ctx.companyId, isActive: true, hasPrinter: true, site: { isActive: true } },
        orderBy: { code: "asc" },
        select: {
          id: true,
          name: true,
          siteId: true,
          site: { select: { name: true } },
          devices: { where: { unpairedAt: null }, take: 1, select: { id: true } },
        },
      }),
      defaultSiteFor(ctx.companyId, ctx.userId),
    ]);
    const rank = (row: (typeof registers)[number]) => (row.devices.length === 0 ? 2 : row.siteId === siteId ? 0 : 1);
    const sorted = [...registers].sort((a, b) => rank(a) - rank(b));
    if (context.pick === "default") {
      const first = sorted[0];
      return [first && rank(first) === 0 ? { id: first.id, label: printerName(first.name), sub: first.site.name } : PRINT_HERE];
    }
    const needle = q.trim().toLowerCase();
    return [
      ...sorted.map((row) => ({
        id: row.id,
        label: printerName(row.name),
        sub: row.devices.length ? row.site.name : `${row.site.name} · not paired`,
      })),
      PRINT_HERE,
    ].filter((option) => !needle || option.label.toLowerCase().includes(needle));
  },
};

export const PRODUCT_LOOKUPS: LookupNoun[] = [category, product, pack, printer];
