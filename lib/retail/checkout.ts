export type RetailPromotionType = "PERCENT" | "AMOUNT" | "BUY_X_GET_Y" | "BUNDLE";

export type RetailCheckoutLineInput = {
  id: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  lineDiscountAmount?: number;
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
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  promotionDiscountAmount: number;
  lines: RetailCalculatedCheckoutLine[];
};

function round(value: number) {
  return Number(value.toFixed(2));
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

  const subtotal = round(
    normalizedLines.reduce((total, line) => total + line.baseAmount, 0),
  );
  const manualOrderDiscount = round(input.orderDiscountAmount ?? 0);
  const promotionDiscountAmount = calculateRetailPromotionDiscount(
    input.promotion ?? null,
    subtotal,
  );
  const extraDiscountPool = round(manualOrderDiscount + promotionDiscountAmount);
  const totalTaxableBeforeHeader = round(
    normalizedLines.reduce((total, line) => total + line.taxableBeforeHeader, 0),
  );

  const allocatedExtraDiscounts = normalizedLines.map((line, index) => {
    if (extraDiscountPool <= 0 || totalTaxableBeforeHeader <= 0) {
      return 0;
    }

    if (index === normalizedLines.length - 1) {
      const priorAllocated = normalizedLines
        .slice(0, index)
        .reduce((total, entry) => {
          const share = round(
            (entry.taxableBeforeHeader / totalTaxableBeforeHeader) * extraDiscountPool,
          );
          return total + share;
        }, 0);
      return round(extraDiscountPool - priorAllocated);
    }

    return round(
      (line.taxableBeforeHeader / totalTaxableBeforeHeader) * extraDiscountPool,
    );
  });

  const lines = normalizedLines.map((line, index) => {
    const discountAmount = round(
      line.lineDiscountAmount + allocatedExtraDiscounts[index],
    );
    const taxableAmount = round(Math.max(line.baseAmount - discountAmount, 0));
    const taxAmount = round((taxableAmount * line.taxPercent) / 100);
    const lineTotal = round(taxableAmount + taxAmount);

    return {
      id: line.id,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxPercent: line.taxPercent,
      lineDiscountAmount: line.lineDiscountAmount,
      baseAmount: line.baseAmount,
      discountAmount,
      taxAmount,
      lineTotal,
    };
  });

  return {
    subtotal,
    discountAmount: round(
      lines.reduce((total, line) => total + line.discountAmount, 0),
    ),
    taxAmount: round(lines.reduce((total, line) => total + line.taxAmount, 0)),
    total: round(lines.reduce((total, line) => total + line.lineTotal, 0)),
    promotionDiscountAmount,
    lines,
  } satisfies RetailCalculatedCheckout;
}
