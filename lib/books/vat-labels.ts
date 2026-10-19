/** VAT returns' words for client components: no database behind them. */

export type VatTab = "draft" | "reviewed" | "finalised" | "filed";
export type VatCurrencyView = "all" | "USD" | "ZWG";

export const VAT_STATE_LABEL: Record<VatTab, string> = { draft: "Draft", reviewed: "Reviewed", finalised: "Finalised", filed: "Filed" };
