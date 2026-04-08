export type IrregularPayoutSource = "GOLD" | "SCRAP" | "COMMISSION" | "OTHER"

export type SupportedIrregularPayoutSource = IrregularPayoutSource

export type IrregularPayoutSourceMeta = {
  label: string
  shortLabel: string
  groupLabel: string
  createLabel: string
  emptyLabel: string
}

const SUPPORTED_IRREGULAR_PAYOUT_SOURCES: ReadonlySet<IrregularPayoutSource> = new Set([
  "GOLD",
  "SCRAP",
  "COMMISSION",
  "OTHER",
])

const IRREGULAR_PAYOUT_SOURCE_META: Record<IrregularPayoutSource, IrregularPayoutSourceMeta> = {
  GOLD: {
    label: "Gold settlements",
    shortLabel: "Gold",
    groupLabel: "Shift",
    createLabel: "New shift",
    emptyLabel: "Unable to load settlements",
  },
  SCRAP: {
    label: "Scrap settlements",
    shortLabel: "Scrap",
    groupLabel: "Batch",
    createLabel: "New batch",
    emptyLabel: "Unable to load settlements",
  },
  COMMISSION: {
    label: "Commission settlements",
    shortLabel: "Commission",
    groupLabel: "Batch",
    createLabel: "New batch",
    emptyLabel: "Unable to load settlements",
  },
  OTHER: {
    label: "Settlements",
    shortLabel: "General",
    groupLabel: "Batch",
    createLabel: "New batch",
    emptyLabel: "Unable to load settlements",
  },
}

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

export function getIrregularPayoutSourceMeta(source: IrregularPayoutSource): IrregularPayoutSourceMeta {
  return IRREGULAR_PAYOUT_SOURCE_META[source]
}

export function resolveDefaultIrregularPayoutSource(enabledFeatures?: string[] | null) {
  const normalized = new Set((enabledFeatures ?? []).map((feature) => feature.trim().toLowerCase()))
  if (normalized.has("gold.payouts") || normalized.has("gold.home")) return "GOLD" as const
  if (normalized.has("scrap-metal.home") || normalized.has("scrap-metal.purchases")) return "SCRAP" as const
  if (normalized.has("autos.core")) return "COMMISSION" as const
  return "OTHER" as const
}
