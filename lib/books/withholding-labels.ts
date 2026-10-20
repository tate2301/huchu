/** Withholding's words for client components: no database behind them. */

export type WithholdingTab = "income" | "vat" | "rent" | "certificates" | "returns";

export const WITHHOLDING_TABS: Array<{ value: WithholdingTab; label: string }> = [
  { value: "income", label: "Withheld, 30%" },
  { value: "vat", label: "VAT withheld" },
  { value: "rent", label: "Rent and non-resident" },
  { value: "certificates", label: "Certificates" },
  { value: "returns", label: "Returns" },
];
