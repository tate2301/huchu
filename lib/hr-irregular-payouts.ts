export type IrregularPayoutSource = "GOLD" | "SCRAP" | "COMMISSION" | "OTHER"

export type SupportedIrregularPayoutSource = IrregularPayoutSource

const SUPPORTED_IRREGULAR_PAYOUT_SOURCES: ReadonlySet<IrregularPayoutSource> = new Set([
  "GOLD",
  "SCRAP",
  "COMMISSION",
  "OTHER",
])

export function parseIrregularPayoutSource(
  value: string | null | undefined,
): IrregularPayoutSource {
  if (value === "COMMISSION" || value === "OTHER" || value === "GOLD" || value === "SCRAP") {
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
  void source
  return "IRREGULAR" as const
}

export function isLegacyGoldPaymentType(type: string | null | undefined) {
  return type === "GOLD"
}

export function isIrregularEmployeePaymentType(type: string | null | undefined) {
  return type === "IRREGULAR" || type === "GOLD"
}

export function normalizeIrregularPayoutSource(input?: string | null) {
  if (input === "SCRAP" || input === "COMMISSION" || input === "OTHER") return input
  return "GOLD" as const
}
