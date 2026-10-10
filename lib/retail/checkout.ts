export type RetailPromotionType = "PERCENT" | "AMOUNT" | "BUY_X_GET_Y" | "BUNDLE";

export type RetailCheckoutLineInput = {
  id: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  lineDiscountAmount?: number;
  /**
   * S-3 — how `unitPrice` is meant, taken from `PriceList.taxInclusive`.
   *
   * A Zimbabwean shelf price is what the customer pays: the 15% is already
   * inside the $1.20 on the tag. Adding 15% on top prints $1.38, which is not
   * the number anybody at the counter agreed to. When this is set the ex-VAT
   * line and the VAT are *carved out of* the shelf price instead.
   *
   * Defaults to false, so a list that says nothing keeps meaning what it meant.
   */
  taxInclusive?: boolean;
  /**
   * PRD-08. False for a unit sold in a bundle or a buy-more deal: it already
   * has its saving, so a sale promotion is worked out on, and shared over,
   * the other lines only. Defaults to true.
   */
  promotionEligible?: boolean;
};

export type RetailCheckoutPromotion = {
  id: string;
  type: RetailPromotionType;
  value: number;
} | null;

export type RetailCalculatedCheckoutLine = RetailCheckoutLineInput & {
  baseAmount: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
};

export type RetailCalculatedCheckout = {
  /**
   * Revenue before tax and before discount.
   *
   * On a tax-inclusive list this is the ex-VAT value of the shelf prices, not
   * the shelf prices themselves — see `calculateRetailCheckout`. That keeps
   * `subtotal − discountAmount + taxAmount === total` true on both kinds of
   * list, which is the identity `_services.ts` posts to the ledger as
   * net / tax / gross.
   */
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  /** What the customer pays. */
  total: number;
  /**
   * The promotion's own contribution, in the basis the shelf price is quoted
   * in — a 10% promotion takes 10% off the price on the tag, which is what the
   * customer was promised, rather than 10% off an ex-VAT figure they never saw.
   */
  promotionDiscountAmount: number;
  lines: RetailCalculatedCheckoutLine[];
};

function round(value: number) {
  return Number(value.toFixed(2));
}

/**
 * The ex-VAT amount inside a VAT-inclusive figure.
 *
 *   net = gross ÷ (1 + rate/100), to the cent
 *   vat = gross − net
 *
 * Derived, never added, and the VAT is the *remainder* rather than a second
 * rounded multiplication — so the two halves always add back to the number on
 * the shelf. $1.20 at 15% inclusive is $1.04 + $0.16.
 */
function netOfInclusiveTax(gross: number, taxPercent: number) {
  if (taxPercent <= 0) return round(gross);
  return round(gross / (1 + taxPercent / 100));
}

export function calculateRetailPromotionDiscount(
  promotion: RetailCheckoutPromotion,
  subtotal: number,
) {
  if (!promotion) {
    return 0;
  }

  if (promotion.type === "PERCENT") {
    return round((subtotal * promotion.value) / 100);
  }

  if (promotion.type === "AMOUNT") {
    return round(Math.min(promotion.value, subtotal));
  }

  return 0;
}

export function calculateRetailCheckout(input: {
  lines: RetailCheckoutLineInput[];
  orderDiscountAmount?: number;
  promotion?: RetailCheckoutPromotion;
}) {
  const normalizedLines = input.lines.map((line) => {
    const baseAmount = round(line.unitPrice * line.quantity);
    const lineDiscountAmount = round(line.lineDiscountAmount ?? 0);
    const taxableBeforeHeader = round(Math.max(baseAmount - lineDiscountAmount, 0));

    return {
      ...line,
      baseAmount,
      lineDiscountAmount,
      taxableBeforeHeader,
    };
  });

  // The cart in the basis its prices are quoted in — shelf money on a
  // tax-inclusive list, ex-VAT money on an exclusive one. Discounts and
  // promotions are worked out against this, because a percentage off is a
  // percentage off the price the customer was shown. A promotion counts only
  // the lines it may touch: none in a bundle or a buy-more deal (PRD-08).
  const eligible = normalizedLines.map((line) => line.promotionEligible !== false);
  const promotionSubtotal = round(
    normalizedLines.reduce((total, line, index) => total + (eligible[index] ? line.baseAmount : 0), 0),
  );
  const manualOrderDiscount = round(input.orderDiscountAmount ?? 0);
  const promotionDiscountAmount = calculateRetailPromotionDiscount(
    input.promotion ?? null,
    promotionSubtotal,
  );

  // The order discount over every line, the promotion over the lines it may
  // touch: each pro rata to what the line comes to, the last taking the cents.
  const allocate = (pool: number, weights: number[]) => {
    const total = round(weights.reduce((sum, weight) => sum + weight, 0));
    const last = weights.reduce((at, weight, index) => (weight > 0 ? index : at), -1);
    if (pool <= 0 || total <= 0) return weights.map(() => 0);
    let given = 0;
    return weights.map((weight, index) => {
      if (index === last) return round(pool - given);
      const share = weight > 0 ? round((weight / total) * pool) : 0;
      given = round(given + share);
      return share;
    });
  };
  const orderShares = allocate(
    manualOrderDiscount,
    normalizedLines.map((line) => line.taxableBeforeHeader),
  );
  const promotionShares = allocate(
    promotionDiscountAmount,
    normalizedLines.map((line, index) => (eligible[index] ? line.taxableBeforeHeader : 0)),
  );
  const allocatedExtraDiscounts = normalizedLines.map((_, index) =>
    round(orderShares[index]! + promotionShares[index]!),
  );

  const lines = normalizedLines.map((line, index) => {
    // Discounts are taken in the basis the price is quoted in: a cashier who
    // knocks 20c off a $1.20 bottle means 20c off what the customer hands over.
    const discountAmount = round(
      line.lineDiscountAmount + allocatedExtraDiscounts[index],
    );
    const chargeable = round(Math.max(line.baseAmount - discountAmount, 0));

    if (line.taxInclusive) {
      // The shelf price already contains the VAT, so `chargeable` *is* what the
      // customer pays and the split is carved out of it. Everything reported
      // except `lineTotal` is therefore ex-VAT — including the discount, which
      // reduces net revenue and output VAT in the same proportion. That is what
      // keeps `baseAmount − discountAmount + taxAmount === lineTotal` exact.
      const netBase = netOfInclusiveTax(line.baseAmount, line.taxPercent);
      const netChargeable = netOfInclusiveTax(chargeable, line.taxPercent);

      return {
        id: line.id,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxPercent: line.taxPercent,
        taxInclusive: true,
        lineDiscountAmount: line.lineDiscountAmount,
        baseAmount: netBase,
        discountAmount: round(netBase - netChargeable),
        taxAmount: round(chargeable - netChargeable),
        lineTotal: chargeable,
      };
    }

    const taxAmount = round((chargeable * line.taxPercent) / 100);

    return {
      id: line.id,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxPercent: line.taxPercent,
      taxInclusive: false,
      lineDiscountAmount: line.lineDiscountAmount,
      baseAmount: line.baseAmount,
      discountAmount,
      taxAmount,
      lineTotal: round(chargeable + taxAmount),
    };
  });

  return {
    // Summed from the shaped lines rather than from the inputs, because on a
    // tax-inclusive list the reported base is the ex-VAT one. On an exclusive
    // list these are the same numbers `subtotal` above was built from.
    subtotal: round(lines.reduce((total, line) => total + line.baseAmount, 0)),
    discountAmount: round(
      lines.reduce((total, line) => total + line.discountAmount, 0),
    ),
    taxAmount: round(lines.reduce((total, line) => total + line.taxAmount, 0)),
    total: round(lines.reduce((total, line) => total + line.lineTotal, 0)),
    promotionDiscountAmount,
    lines,
  } satisfies RetailCalculatedCheckout;
}
