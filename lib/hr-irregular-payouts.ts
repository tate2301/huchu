export type IrregularPayoutSource = "GOLD" | "COMMISSION" | "OTHER"

export type SupportedIrregularPayoutSource = "GOLD"

const SUPPORTED_IRREGULAR_PAYOUT_SOURCES: ReadonlySet<IrregularPayoutSource> = new Set([
  "GOLD",
])

export function parseIrregularPayoutSource(
  value: string | null | undefined,
): IrregularPayoutSource {
  if (value === "COMMISSION" || value === "OTHER" || value === "GOLD") {
    return value
  }
  return "GOLD"
}

export function isSupportedIrregularPayoutSource(
  source: IrregularPayoutSource,
): source is SupportedIrregularPayoutSource {
  return SUPPORTED_IRREGULAR_PAYOUT_SOURCES.has(source)
}

export function sourceToEmployeePaymentType(source: SupportedIrregularPayoutSource) {
  if (source === "GOLD") return "GOLD" as const
  return "GOLD" as const
}

export function isIrregularEmployeePaymentType(type: string | null | undefined) {
  return type === "GOLD"
}
