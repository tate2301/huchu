/** The fiscal register's words for client components: no database behind them. */

export type FiscalTab = "documents" | "days" | "failed";

export const FISCAL_KINDS: Array<{ value: string; label: string }> = [
  { value: "invoice", label: "Tax invoices" },
  { value: "credit-note", label: "Credit notes" },
  { value: "till-sale", label: "Till sales" },
  { value: "school-receipt", label: "Fee receipts" },
];
