/**
 * What a sale comes to (PRD-08): the one sum the till shows and `pos/sales`
 * stores. Pure, so the till (online and offline) and the server run the very
 * same steps over the same snapshot and never disagree on a total.
 *
 * 1. Bundles (`applyBundles`): a fixed set rung as one sells at its price, and
 *    live buy-more deals apply on their own. A line part in a deal and part
 *    not comes back as pieces.
 * 2. The cashier's own line discount is shared over the line's pieces pro
 *    rata to quantity, in whole cents with what is left on the last piece, so
 *    a left-over single never carries the whole line's discount.
 * 3. `calculateRetailCheckout`: the bundle's saving and the cashier's
 *    discount come off each piece; a sale promotion takes its share off the
 *    units sold at their own price only. A unit in a bundle or a buy-more deal
 *    already has its saving and takes no promotion on top.
 */

import {
  calculateRetailCheckout,
  type RetailCalculatedCheckout,
  type RetailCheckoutPromotion,
} from "@/lib/retail/checkout";
import { applyBundles, type SnapshotBundle } from "@/lib/retail/pricing/engine";

export type SaleLineInput = {
  key: string;
  productId: string;
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
};

export type PricedSale = {
  pieces: SalePiece[];
  checkout: RetailCalculatedCheckout;
  /** What the bundles and buy-more deals took off, in shelf money. */
  bundleSaving: number;
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
  at: Date | string;
  siteId: string | null;
  orderDiscountAmount?: number;
  promotion?: RetailCheckoutPromotion;
}): PricedSale | { error: string } {
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

  const pieces: SalePiece[] = [];
  const checkoutLines = input.lines.flatMap((line) => {
    const ofLine = bundled.pieces.filter((piece) => piece.key === line.key);
    const discounts = shareByWeight(
      toCents(line.lineDiscount),
      ofLine.map((piece) => piece.quantity),
    );
    return ofLine.map((piece, at) => {
      const sold: SalePiece = {
        key: ofLine.length > 1 ? `${line.key}:${at}` : line.key,
        lineKey: line.key,
        quantity: piece.quantity,
        lineDiscount: fromCents(discounts[at]!),
        bundleDiscount: piece.discount,
        bundleId: piece.bundleId,
        group: piece.group,
      };
      pieces.push(sold);
      return {
        id: sold.key,
        quantity: sold.quantity,
        unitPrice: line.unitPrice,
        taxPercent: line.taxPercent,
        taxInclusive: line.taxInclusive,
        lineDiscountAmount: fromCents(discounts[at]! + toCents(piece.discount)),
        promotionEligible: piece.bundleId === null,
      };
    });
  });

  return {
    pieces,
    checkout: calculateRetailCheckout({
      lines: checkoutLines,
      orderDiscountAmount: input.orderDiscountAmount ?? 0,
      promotion: input.promotion ?? null,
    }),
    bundleSaving: bundled.saving,
  };
}
