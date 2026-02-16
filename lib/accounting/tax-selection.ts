type TaxCodeWindow = {
  id: string;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
};

export function isTaxCodeEffectiveOnDate(taxCode: TaxCodeWindow, asOfDate: Date) {
  const fromValid = !taxCode.effectiveFrom || taxCode.effectiveFrom <= asOfDate;
  const toValid = !taxCode.effectiveTo || taxCode.effectiveTo >= asOfDate;
  return fromValid && toValid;
}

export function findTaxCodesOutsideEffectiveWindow(taxCodes: TaxCodeWindow[], asOfDate: Date) {
  return taxCodes
    .filter((taxCode) => !isTaxCodeEffectiveOnDate(taxCode, asOfDate))
    .map((taxCode) => taxCode.id);
}
