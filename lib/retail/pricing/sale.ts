/**
 * What a sale comes to (PRD-08, PRD-09): the one sum the till shows and
 * `pos/sales` stores. Pure, so the till (online and offline) and the server
 * run the very same steps over the same snapshot and never disagree on a total.
 *
 * 1. Bundles (`applyBundles`): a fixed set rung as one sells at its price, and
 *    live buy-more deals apply on their own. A line part in a deal and part
 *    not comes back as pieces.
 * 2. A unit in a buy-more deal takes the better of the deal and the
 *    promotions: a group whose units the promotions would save more on
 *    leaves the deal, and its pieces go back to their line.
 * 3. The cashier's own line discount is shared over the line's pieces pro
 *    rata to quantity, in whole cents with what is left on the last piece, so
 *    a left-over single never carries the whole line's discount.
 * 4. Promotions (`applyPromotions`) on every piece not in a bundle or a kept
 *    deal, after the cashier's discount, never below zero; each piece keeps
 *    the promotion it is attributed to and what the promotions took off it.
 * 5. `calculateRetailCheckout`: the bundle's saving, the cashier's discount
 *    and the promotion come off each piece; the sale's own discount after.
 */

import { calculateRetailCheckout, type RetailCalculatedCheckout } from "@/lib/retail/checkout";
import {
  applyBundles,
  applyPromotions,
  type BundledPiece,
  type PricingCustomer,
  type SnapshotBundle,
  type SnapshotPromotion,
} from "@/lib/retail/pricing/engine";

export type SaleLineInput = {
  key: string;
  productId: string;
  /** What a category promotion asks of it. */
  categoryId?: string | null;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  taxInclusive: boolean;
  /** The cashier's own money off the line. */
  lineDiscount: number;
  /** A fixed set the till rang as one. */
  bundleId?: string | null;
  bundleRef?: string | null;
};

/** A line, or the part of one, as sold. */
export type SalePiece = {
  /** The checkout line's id: the line's key, or `<key>:<n>` when the line was split. */
  key: string;
  lineKey: string;
  quantity: number;
  /** This piece's share of the cashier's line discount. */
  lineDiscount: number;
  /** The bundle's or deal's saving on this piece. */
  bundleDiscount: number;
  bundleId: string | null;
  /** Numbers each bundle and buy-more group in the sale from 1. */
  group: number | null;
  /** The promotion this piece sold under, and what the promotions took off it (shelf money). */
  promotionId: string | null;
  promotionDiscount: number;
};

export type PricedSale = {
  pieces: SalePiece[];
  checkout: RetailCalculatedCheckout;
  /** What the bundles and buy-more deals took off, in shelf money. */
  bundleSaving: number;
  /** What the promotions took off, in shelf money. */
  promotionSaving: number;
};

const toCents = (value: number) => Math.round(value * 100);
const fromCents = (value: number) => value / 100;

/** Whole cents shared pro rata to `weights`, the remainder on the last share. */
function shareByWeight(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (!weights.length) return [];
  if (sum <= 0) return weights.map((_, index) => (index === weights.length - 1 ? total : 0));
  const shares = weights.map((weight) => Math.floor((total * weight) / sum));
  shares[shares.length - 1]! += total - shares.reduce((acc, share) => acc + share, 0);
  return shares;
}

export function priceSale(input: {
  lines: SaleLineInput[];
  bundles: SnapshotBundle[];
  promotions: SnapshotPromotion[];
  at: Date | string;
  siteId: string | null;
  customer?: PricingCustomer | null;
  orderDiscountAmount?: number;
}): PricedSale | { error: string } {
  // The basket minimum reads the whole basket on the shelf, before any bundle, deal or promotion.
  const basketShelf = fromCents(input.lines.reduce((sum, line) => sum + Math.round(toCents(line.unitPrice) * line.quantity), 0));
  const context = { at: input.at, siteId: input.siteId, customer: input.customer ?? null, basketShelf };
  const bundled = applyBundles(
    input.bundles,
    input.lines.map((line) => ({
      key: line.key,
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      bundleId: line.bundleId ?? null,
      bundleRef: line.bundleRef ?? null,
    })),
    { at: input.at, siteId: input.siteId },
  );
  if ("error" in bundled) return bundled;

  const lineOf = new Map(input.lines.map((line) => [line.key, line]));
  const fixedSets = new Set(input.bundles.filter((bundle) => bundle.kind === "FIXED_SET").map((bundle) => bundle.id));
  const inFixedSet = (piece: BundledPiece) => piece.bundleId !== null && fixedSets.has(piece.bundleId);
  const asPromotionLine = (piece: BundledPiece, id: string, alreadyOff: number) => {
    const line = lineOf.get(piece.key)!;
    return { key: id, productId: line.productId, categoryId: line.categoryId ?? null, quantity: piece.quantity, unitPrice: line.unitPrice, alreadyOff };
  };

  // 2. A buy-more group the promotions would save more on leaves its deal.
  let pieces = bundled.pieces;
  const open = pieces.map((piece, index) => ({ piece, id: String(index) })).filter(({ piece }) => !inFixedSet(piece));
  const asIf = new Map(
    applyPromotions(input.promotions, open.map(({ piece, id }) => asPromotionLine(piece, id, 0)), context).map((entry) => [entry.key, entry.discount]),
  );
  const groups = new Map<number, { deal: number; promotion: number }>();
  open.forEach(({ piece, id }) => {
    if (piece.group === null || piece.bundleId === null) return;
    const entry = groups.get(piece.group) ?? { deal: 0, promotion: 0 };
    entry.deal += toCents(piece.discount);
    entry.promotion += toCents(asIf.get(id) ?? 0);
    groups.set(piece.group, entry);
  });
  const leaving = new Set([...groups.entries()].filter(([, entry]) => entry.promotion > entry.deal).map(([group]) => group));
  if (leaving.size > 0) {
    const kept: BundledPiece[] = [];
    const loose = new Map<string, number>();
    for (const piece of pieces) {
      if (piece.bundleId === null || (piece.group !== null && leaving.has(piece.group))) {
        loose.set(piece.key, (loose.get(piece.key) ?? 0) + piece.quantity);
      } else {
        kept.push(piece);
      }
    }
    pieces = [
      ...[...loose.entries()].map(([key, quantity]) => ({ key, quantity, discount: 0, bundleId: null, group: null })),
      ...kept,
    ];
  }

  // 3. The cashier's discount over each line's pieces; 4. the promotions on the loose pieces.
  const sold: SalePiece[] = [];
  for (const line of input.lines) {
    const ofLine = pieces.filter((piece) => piece.key === line.key);
    const discounts = shareByWeight(toCents(line.lineDiscount), ofLine.map((piece) => piece.quantity));
    ofLine.forEach((piece, at) => {
      sold.push({
        key: ofLine.length > 1 ? `${line.key}:${at}` : line.key,
        lineKey: line.key,
        quantity: piece.quantity,
        lineDiscount: fromCents(discounts[at]!),
        bundleDiscount: piece.discount,
        bundleId: piece.bundleId,
        group: piece.group,
        promotionId: null,
        promotionDiscount: 0,
      });
    });
  }
  const promoted = applyPromotions(
    input.promotions,
    sold
      .filter((piece) => piece.bundleId === null)
      .map((piece) => {
        const line = lineOf.get(piece.lineKey)!;
        return {
          key: piece.key,
          productId: line.productId,
          categoryId: line.categoryId ?? null,
          quantity: piece.quantity,
          unitPrice: line.unitPrice,
          alreadyOff: piece.lineDiscount,
        };
      }),
    context,
  );
  const promotionOf = new Map(promoted.map((entry) => [entry.key, entry]));
  let promotionCents = 0;
  for (const piece of sold) {
    const entry = promotionOf.get(piece.key);
    if (!entry || entry.promotionId === null) continue;
    piece.promotionId = entry.promotionId;
    piece.promotionDiscount = entry.discount;
    promotionCents += toCents(entry.discount);
  }

  // 5. What it comes to.
  const checkoutLines = sold.map((piece) => {
    const line = lineOf.get(piece.lineKey)!;
    return {
      id: piece.key,
      quantity: piece.quantity,
      unitPrice: line.unitPrice,
      taxPercent: line.taxPercent,
      taxInclusive: line.taxInclusive,
      lineDiscountAmount: fromCents(toCents(piece.lineDiscount) + toCents(piece.bundleDiscount) + toCents(piece.promotionDiscount)),
    };
  });
  const bundleCents = sold.reduce((sum, piece) => sum + toCents(piece.bundleDiscount), 0);

  return {
    pieces: sold,
    checkout: calculateRetailCheckout({ lines: checkoutLines, orderDiscountAmount: input.orderDiscountAmount ?? 0 }),
    bundleSaving: fromCents(bundleCents),
    promotionSaving: fromCents(promotionCents),
  };
}
