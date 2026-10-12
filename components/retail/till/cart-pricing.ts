/**
 * What the sale on the counter comes to (PRD-05, PRD-08, PRD-09, PRD-10), as
 * `pos/sales` works it out. Pure and browser-safe, so the till prices every
 * change of the cart, online and offline, by the very engine and snapshot the
 * server re-prices with, and the tests run it without a till around it.
 *
 * 1. Each line's shelf price is the engine's (`priceBasket`) for its quantity
 *    at this moment, off the till's price lists: Happy hour on a Friday at
 *    17:30, Wholesale from 6. A line still at the shelf price follows it; a
 *    price the cashier changed stays theirs. The list shows on the line when
 *    it is not the till's own ("Happy hour").
 * 2. `priceSale`: bundles the till rang as one, buy-more deals, the cashier's
 *    discounts, the promotions, then a discount voucher.
 * 3. Deposits and gift vouchers sold sit outside the goods total: not
 *    revenue, not VAT. The customer pays all three.
 */

import { depositsDue } from "@/lib/retail/deposits";
import {
  baseListOf,
  bundleOnSale,
  priceAtQuantity,
  priceBasket,
  type PricingSnapshot,
  type SnapshotBundle,
} from "@/lib/retail/pricing/engine";
import { priceSale, type PricedSale, type SaleVoucher } from "@/lib/retail/pricing/sale";
import type { CartItem } from "./types";

const round = (value: number) => Number(value.toFixed(2));
const cents = (value: number) => Math.round(value * 100);

/** A line's price is the shelf's while it is within a cent of it. */
export const atShelf = (item: Pick<CartItem, "unitPrice" | "shelfPrice">) => Math.abs(item.unitPrice - item.shelfPrice) <= 0.009;

/**
 * Every line at the engine's price for its quantity, now. Without a snapshot
 * (not loaded yet, never cached) a line keeps the shelf's own volume breaks.
 */
export function repriceLines(cart: readonly CartItem[], snapshot: PricingSnapshot | null, at: Date): CartItem[] {
  const basket = cart.filter((item) => !item.openPrice).map((item) => ({ key: item.id, productId: item.catalogItemId, quantity: item.quantity }));
  // The server prices the shelf with no customer (`resolveShelfPrices`): the till does the same.
  const priced = snapshot && basket.length ? priceBasket(snapshot, basket, { at, siteId: snapshot.siteId, customer: null }) : null;
  const byKey = new Map((priced?.lines ?? []).map((line) => [line.key, line]));
  const base = snapshot ? baseListOf(snapshot) : null;
  const listName = (id: string | null) => (id && base && id !== base.id ? (snapshot?.lists.find((list) => list.id === id)?.name ?? null) : null);
  return cart.map((item) => {
    if (item.openPrice) return item;
    const line = byKey.get(item.id);
    const shelf = line?.unitPrice ?? priceAtQuantity(item.priceOfOne, item.priceBreaks, item.quantity);
    return {
      ...item,
      shelfPrice: shelf,
      unitPrice: atShelf(item) ? shelf : item.unitPrice,
      listName: line?.unitPrice != null ? listName(line.priceListId) : null,
    };
  });
}

/** What one of a product sells at now, and the list it comes off when not the till's own: the tile's price. */
export function shelfPriceNow(snapshot: PricingSnapshot | null, productId: string, at: Date): { price: number; list: string | null } | null {
  if (!snapshot) return null;
  const line = priceBasket(snapshot, [{ key: productId, productId, quantity: 1 }], { at, siteId: snapshot.siteId, customer: null }).lines[0];
  if (!line || line.unitPrice === null) return null;
  const base = baseListOf(snapshot);
  const list = line.priceListId && base && line.priceListId !== base.id ? (snapshot.lists.find((entry) => entry.id === line.priceListId)?.name ?? null) : null;
  return { price: line.unitPrice, list };
}

export type CartTotals = {
  sale: PricedSale;
  /** A fixed set the till rang that the engine refuses now ("… is not on sale now. Ring its items on their own."). */
  bundleProblem: string | null;
  /** The goods, after every discount: what the receipt calls the sale. */
  goodsTotal: number;
  /** Deposits on returnable bottles, net of the empties back. */
  depositTotal: number;
  /** Gift vouchers bought in this sale. */
  vouchersSoldTotal: number;
  /** What the customer pays: goods, deposits and vouchers sold. */
  amountDue: number;
  /** Per line: the promotion it sold under and what came off it, and the bundle's saving on it. */
  lineSavings: Map<string, { promotion: { name: string; amount: number } | null; bundle: number }>;
};

/**
 * The sale's totals over the lines that sell (licence hours may stop some):
 * the lines as `repriceLines` left them.
 */
export function priceCart(input: {
  lines: readonly CartItem[];
  snapshot: PricingSnapshot | null;
  at: Date;
  siteId: string | null;
  customer: { loyalty: boolean; staff: boolean };
  orderDiscountAmount: number;
  voucher: SaleVoucher | null;
  vouchersSold: ReadonlyArray<{ value: string }>;
  /** Points spent, worked out by the caller after the promotions (CUS-01). */
  pointsOff?: number;
}): CartTotals {
  const categoryOf = new Map((input.snapshot?.products ?? []).map((product) => [product.id, product.categoryId]));
  const run = (withBundles: boolean) =>
    priceSale({
      lines: input.lines.map((item) => ({
        key: item.id,
        productId: item.catalogItemId,
        categoryId: categoryOf.get(item.catalogItemId) ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxPercent: item.taxPercent,
        taxInclusive: item.taxInclusive,
        lineDiscount: item.lineDiscountAmount,
        bundleId: withBundles ? (item.bundleId ?? null) : null,
        bundleRef: withBundles ? (item.bundleRef ?? null) : null,
      })),
      bundles: input.snapshot?.bundles ?? [],
      promotions: input.snapshot?.promotions ?? [],
      at: input.at,
      siteId: input.siteId,
      orderDiscountAmount: input.orderDiscountAmount,
      voucher: input.voucher,
      customer: input.customer,
    });
  const first = run(true);
  const bundleProblem = "error" in first ? first.error : null;
  const second = "error" in first ? run(false) : first;
  // Without the fixed sets nothing is left to refuse.
  if ("error" in second) throw new Error(second.error);
  const sale = second;

  const promotionName = new Map((input.snapshot?.promotions ?? []).map((promotion) => [promotion.id, promotion.name]));
  const lineSavings: CartTotals["lineSavings"] = new Map();
  for (const piece of sale.pieces) {
    const entry = lineSavings.get(piece.lineKey) ?? { promotion: null, bundle: 0 };
    entry.bundle = round(entry.bundle + piece.bundleDiscount);
    if (piece.promotionId && piece.promotionDiscount > 0) {
      entry.promotion = {
        name: entry.promotion?.name ?? promotionName.get(piece.promotionId) ?? "Promotion",
        amount: round((entry.promotion?.amount ?? 0) + piece.promotionDiscount),
      };
    }
    lineSavings.set(piece.lineKey, entry);
  }

  const goodsTotal = round(sale.checkout.total - (input.pointsOff ?? 0));
  const depositTotal = depositsDue(input.lines);
  const vouchersSoldTotal = input.vouchersSold.reduce((sum, voucher) => sum + cents(Number(voucher.value) || 0), 0) / 100;
  return {
    sale,
    bundleProblem,
    goodsTotal,
    depositTotal,
    vouchersSoldTotal,
    amountDue: round(goodsTotal + depositTotal + vouchersSoldTotal),
    lineSavings,
  };
}

/**
 * What the empties back take off the sale: each line's deposit before them,
 * less after them. The sale's deposit (`depositTotal`) is already net of it.
 */
export function bottlesBackCredit(lines: readonly CartItem[]) {
  return Number((depositsDue(lines.map((item) => ({ ...item, emptiesBack: 0 }))) - depositsDue(lines)).toFixed(2));
}

/* ── Bundles at the till (PRD-08) ─────────────────────────────────────── */

/** A fresh key for one bundle rung as one: its component lines share it. */
export function newBundleRef(): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}${Math.random()}`;
  return `B${random.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;
}

/** The till's id for a bundle's component line: one line per product per bundle rung. */
export const bundleLineId = (bundleRef: string, productId: string) => `${bundleRef}:${productId}`;

/**
 * The fixed sets whose every item is in the sale on loose lines (not already
 * in a bundle) and on sale now: "Make it a bundle: Braai pack for US$11.00".
 * Only those that save the customer something.
 */
export function bundleOffers(cart: readonly CartItem[], bundles: readonly SnapshotBundle[], at: Date, siteId: string | null): SnapshotBundle[] {
  const loose = new Map<string, number>();
  for (const item of cart) {
    if (item.bundleRef || item.openPrice) continue;
    loose.set(item.catalogItemId, (loose.get(item.catalogItemId) ?? 0) + item.quantity);
  }
  return bundles.filter((bundle) => {
    if (bundle.kind !== "FIXED_SET" || !bundle.items.length || !bundleOnSale(bundle, at, siteId)) return false;
    if (!bundle.items.every((item) => (loose.get(item.productId) ?? 0) >= item.quantity)) return false;
    const price = new Map(cart.filter((item) => !item.bundleRef).map((item) => [item.catalogItemId, item.unitPrice]));
    const shelf = bundle.items.reduce((sum, item) => sum + cents(price.get(item.productId) ?? item.each) * item.quantity, 0);
    return shelf > cents(bundle.price);
  });
}

/**
 * The cart with one of `bundle` regrouped out of its loose lines: each item's
 * quantity comes off its loose line (a line at nothing goes) and onto a new
 * component line under `ref`, which keeps the loose line's price and details.
 */
export function makeBundle(cart: readonly CartItem[], bundle: SnapshotBundle, ref: string): CartItem[] {
  const out = cart.map((item) => ({ ...item }));
  const added: CartItem[] = [];
  for (const part of bundle.items) {
    let wanted = part.quantity;
    for (const item of out) {
      if (wanted <= 0) break;
      if (item.bundleRef || item.catalogItemId !== part.productId) continue;
      const take = Math.min(item.quantity, wanted);
      item.quantity -= take;
      item.emptiesBack = Math.min(item.emptiesBack, Math.floor(item.quantity));
      wanted -= take;
      const existing = added.find((line) => line.catalogItemId === part.productId);
      if (existing) existing.quantity += take;
      else
        added.push({
          ...item,
          id: bundleLineId(ref, part.productId),
          quantity: take,
          emptiesBack: 0,
          lineDiscountAmount: 0,
          unitPrice: item.shelfPrice,
          bundleId: bundle.id,
          bundleRef: ref,
          bundleName: bundle.name,
        });
    }
  }
  return [...out.filter((item) => item.quantity > 0), ...added];
}
