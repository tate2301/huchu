import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { defaultPriceList } from "@/lib/retail/prices/change";
import { wasPrices } from "@/lib/retail/prices/was";
import { dailySlot } from "@/lib/retail/worker/schedule";
import { formatMoney } from "@/lib/workspace/format";

/**
 * What a shelf label says (PRD-06, 20-products §4.12): the product's name,
 * its price on the default list, the price it was when it dropped, and its
 * barcode. A label printed in the evening carries the price the shelf will
 * have when the shop opens: "Prices changing tonight print with tomorrow’s
 * price."
 */

export type LabelSize = "STRIP" | "TAG" | "A4";
export type LabelShow = { price: boolean; was: boolean; barcode: boolean };
export type LabelSymbology = "EAN13" | "CODE128";

export type Label = {
  productId: string;
  name: string;
  /** "US$0.70"; null with Price off, or off the default list. */
  price: string | null;
  /** The price before it dropped, struck through; null when it did not drop in 60 days, or Was is off. */
  was: string | null;
  /** What the bars encode; null with Barcode off. */
  barcode: string | null;
  symbology: LabelSymbology | null;
  copies: number;
};

/**
 * The shop opens at 08:00 on its clock. The shop keeps no opening hours of
 * its own (licence hours are per site and only for alcohol), so "the next
 * opening" is the next 08:00 in Harare (98-decisions, PRD-06).
 */
export const SHOP_OPENS_AT = "08:00";

/** The next 08:00 on the shop's clock after `at`: today's while it is still to come, else tomorrow's. */
export function nextOpening(at: Date): Date {
  const today = dailySlot(at, SHOP_OPENS_AT);
  return today > at ? today : new Date(today.getTime() + 86_400_000);
}

/** A 13-digit barcode whose last digit is its EAN-13 check digit. */
export function isEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

/** EAN-13 of the barcode when it is one, else Code 128 of the product's code. */
export function labelBarcode(product: { code: string; barcode: string | null }): { barcode: string; symbology: LabelSymbology } {
  const barcode = (product.barcode ?? "").replace(/\s+/g, "");
  return isEan13(barcode) ? { barcode, symbology: "EAN13" } : { barcode: product.code, symbology: "CODE128" };
}

/** The products' labels, in name order; products that are not the company's are left out. */
export async function labelData(
  companyId: string,
  input: { productIds: string[]; show: LabelShow; copies: number; at?: Date },
): Promise<{ labels: Label[] }> {
  const at = input.at ?? new Date();
  const products = await prisma.product.findMany({
    where: { companyId, id: { in: input.productIds } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, barcode: true },
  });
  if (products.length === 0) return { labels: [] };
  const ids = products.map((product) => product.id);
  const list = await defaultPriceList(prisma, companyId);

  const [rows, due] = await Promise.all([
    prisma.productPrice.findMany({
      where: { priceListId: list.id, productId: { in: ids }, minQuantity: 1 },
      select: { productId: true, unitPrice: true },
    }),
    // The latest change on the default list that comes due before the shop opens again.
    prisma.productPriceChange.findMany({
      where: {
        companyId,
        priceListId: list.id,
        productId: { in: ids },
        minQuantity: 1,
        appliedAt: null,
        cancelledAt: null,
        toPrice: { not: null },
        effectiveAt: { lte: nextOpening(at) },
      },
      orderBy: [{ productId: "asc" }, { effectiveAt: "desc" }, { createdAt: "desc" }],
      distinct: ["productId"],
      select: { productId: true, fromPrice: true, toPrice: true },
    }),
  ]);

  const price = new Map(rows.map((row) => [row.productId, toNumberOrZero(row.unitPrice)]));
  const was = new Map<string, number>();
  for (const change of due) {
    const to = toNumberOrZero(change.toPrice);
    price.set(change.productId, to);
    // Tomorrow the change due tonight is the last one applied: its from price is the was.
    if (change.fromPrice !== null && toNumberOrZero(change.fromPrice) > to) was.set(change.productId, toNumberOrZero(change.fromPrice));
  }
  const dueIds = new Set(due.map((change) => change.productId));
  const standing = new Map([...price].filter(([id]) => !dueIds.has(id)));
  for (const [id, from] of await wasPrices(companyId, standing, at)) was.set(id, from);

  const money = (value: number | undefined) => (value === undefined ? null : formatMoney(value, list.currency));
  return {
    labels: products.map((product) => {
      const code = input.show.barcode ? labelBarcode(product) : null;
      return {
        productId: product.id,
        name: product.name,
        price: input.show.price ? money(price.get(product.id)) : null,
        was: input.show.was ? money(was.get(product.id)) : null,
        barcode: code?.barcode ?? null,
        symbology: code?.symbology ?? null,
        copies: input.copies,
      };
    }),
  };
}
