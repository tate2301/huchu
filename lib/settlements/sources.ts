import type { SettlementSource } from "@prisma/client"

/**
 * The four things a settlement can be for, and what to call each on screen.
 *
 * This replaces `lib/hr-irregular-payouts.ts`, whose vocabulary was "irregular
 * payout" — a name that described payroll's opinion of these payments (not
 * monthly, therefore irregular) rather than what they are. A gold worker settled
 * every fortnight is not being paid irregularly; they are being paid for grams.
 *
 * `GOLD` reads its quantities from `GoldShiftAllocation`, which the gold module
 * already approves. The other three have no upstream record, so an operator
 * enters a `SettlementIntake`. That asymmetry is why `groupLabel` differs.
 */

export type SettlementSourceMeta = {
  label: string
  shortLabel: string
  /** What one unit of upstream work is called: a shift, or a batch. */
  groupLabel: string
  createLabel: string
  emptyLabel: string
  /** The unit its quantities are measured in. */
  defaultUnit: string
}

const SETTLEMENT_SOURCES: readonly SettlementSource[] = [
  "GOLD",
  "SCRAP",
  "COMMISSION",
  "OTHER",
]

const SETTLEMENT_SOURCE_META: Record<SettlementSource, SettlementSourceMeta> = {
  GOLD: {
    label: "Gold settlements",
    shortLabel: "Gold",
    groupLabel: "Shift",
    createLabel: "New shift",
    emptyLabel: "No gold settlements yet",
    defaultUnit: "g",
  },
  SCRAP: {
    label: "Scrap settlements",
    shortLabel: "Scrap",
    groupLabel: "Batch",
    createLabel: "New batch",
    emptyLabel: "No scrap settlements yet",
    defaultUnit: "kg",
  },
  COMMISSION: {
    label: "Commission settlements",
    shortLabel: "Commission",
    groupLabel: "Batch",
    createLabel: "New batch",
    emptyLabel: "No commission settlements yet",
    defaultUnit: "unit",
  },
  OTHER: {
    label: "Settlements",
    shortLabel: "General",
    groupLabel: "Batch",
    createLabel: "New batch",
    emptyLabel: "No settlements yet",
    defaultUnit: "unit",
  },
}

export function getSettlementSources(): readonly SettlementSource[] {
  return SETTLEMENT_SOURCES
}

export function getSettlementSourceMeta(source: SettlementSource): SettlementSourceMeta {
  return SETTLEMENT_SOURCE_META[source]
}

/**
 * A source from a query string, or null.
 *
 * Returns null on anything unrecognised rather than defaulting to `GOLD`, which
 * is what the function this replaces did. A typo in `?source=` silently showing
 * gold settlements to a scrap yard is worse than showing nothing.
 */
export function parseSettlementSource(
  value: string | null | undefined,
): SettlementSource | null {
  const normalized = value?.trim().toUpperCase()
  return SETTLEMENT_SOURCES.includes(normalized as SettlementSource)
    ? (normalized as SettlementSource)
    : null
}

/**
 * Which source a workspace settles, given what it has enabled.
 *
 * Reads feature keys rather than the workspace profile: a company can run gold
 * and scrap side by side, and the profile only names one of them.
 */
export function resolveDefaultSettlementSource(
  enabledFeatures?: string[] | null,
): SettlementSource {
  const enabled = new Set(
    (enabledFeatures ?? []).map((feature) => feature.trim().toLowerCase()),
  )
  if (enabled.has("gold.payouts") || enabled.has("gold.home")) return "GOLD"
  if (enabled.has("scrap-metal.home") || enabled.has("scrap-metal.purchases")) {
    return "SCRAP"
  }
  if (enabled.has("autos.core")) return "COMMISSION"
  return "OTHER"
}

/** The feature key that gates a source's screens. */
export function settlementSourceFeatureKey(source: SettlementSource): string {
  switch (source) {
    case "GOLD":
      return "settlements.gold"
    case "SCRAP":
      return "settlements.scrap"
    default:
      return "settlements.core"
  }
}
