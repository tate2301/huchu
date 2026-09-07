import type { AccountingSourceType } from "@corelithzw/db";

export const ACCOUNTING_SOURCE_TYPE_OPTIONS: Array<{ value: AccountingSourceType; label: string }> = [
  { value: "STOCK_RECEIPT", label: "Stock Receipt" },
  { value: "STOCK_ISSUE", label: "Stock Issue" },
  { value: "STOCK_ADJUSTMENT", label: "Stock Adjustment" },
  { value: "STOCK_TRANSFER", label: "Stock Transfer" },
  { value: "PAYROLL_RUN", label: "Payroll Run" },
  { value: "PAYROLL_DISBURSEMENT", label: "Payroll Disbursement" },
  { value: "GOLD_PURCHASE", label: "Gold Purchase" },
  { value: "GOLD_RECEIPT", label: "Gold Receipt" },
  { value: "GOLD_DISPATCH", label: "Gold Dispatch" },
  { value: "SALES_INVOICE", label: "Sales Invoice" },
  { value: "SALES_RECEIPT", label: "Sales Receipt" },
  { value: "SALES_CREDIT_NOTE", label: "Sales Credit Note" },
  { value: "SALES_WRITE_OFF", label: "Sales Write-off" },
  { value: "PURCHASE_BILL", label: "Purchase Bill" },
  { value: "PURCHASE_PAYMENT", label: "Purchase Payment" },
  { value: "PURCHASE_DEBIT_NOTE", label: "Purchase Debit Note" },
  { value: "PURCHASE_WRITE_OFF", label: "Purchase Write-off" },
  { value: "BANK_TRANSACTION", label: "Bank Transaction" },
  { value: "MAINTENANCE_COMPLETION", label: "Maintenance Completion" },
  { value: "RETAIL_SHIFT_OPEN", label: "Retail Shift Open" },
  { value: "RETAIL_SALE", label: "Retail Sale" },
  { value: "RETAIL_REFUND", label: "Retail Refund" },
  { value: "RETAIL_VOID", label: "Retail Void" },
  { value: "RETAIL_GOODS_RECEIPT", label: "Retail Goods Receipt" },
  { value: "RETAIL_STOCK_ADJUSTMENT", label: "Retail Stock Adjustment" },
  { value: "RETAIL_STOCK_TRANSFER", label: "Retail Stock Transfer" },
  { value: "RETAIL_SHIFT_VARIANCE", label: "Retail Shift Variance" },
  { value: "GOLD_SHIFT_ALLOCATION_COMPANY", label: "Gold Shift — Company Share (Mdara)" },
  { value: "GOLD_SHIFT_ALLOCATION_WORKER", label: "Gold Shift — Worker Share (Boys)" },
  { value: "GOLD_SHIFT_EXPENSE", label: "Gold Shift Expense" },
  { value: "GOLD_PAYOUT", label: "Gold Worker Payout" },
  { value: "GOLD_INVENTORY_ADJUSTMENT", label: "Gold Inventory Adjustment" },
  { value: "SCHOOL_FEE_INVOICE", label: "School Fee Invoice" },
  { value: "SCHOOL_FEE_RECEIPT", label: "School Fee Receipt" },
  { value: "SCHOOL_FEE_RECEIPT_VOID", label: "School Fee Receipt Void" },
  { value: "SCHOOL_FEE_CREDIT_APPLIED", label: "School Fee Credit Applied" },
  { value: "SCHOOL_FEE_WAIVER", label: "School Fee Waiver" },
  { value: "SCHOOL_FEE_WRITE_OFF", label: "School Fee Write-off" },
  { value: "SCHOOL_FEE_REFUND", label: "School Fee Refund" },
];

export const RETAIL_REQUIRED_SOURCE_TYPES: AccountingSourceType[] = [
  "RETAIL_SHIFT_OPEN",
  "RETAIL_SALE",
  "RETAIL_REFUND",
  "RETAIL_VOID",
  "RETAIL_GOODS_RECEIPT",
  "RETAIL_STOCK_ADJUSTMENT",
  "RETAIL_SHIFT_VARIANCE",
];

/**
 * S-2.3 — the school's readiness contract, the same shape as retail's above.
 *
 * A school tenant cannot post fee money automatically until each of these has
 * at least one active `PostingRule`. `getAccountingSetupReadiness` reports the
 * coverage, and `getZimbabweRetailFoundationPack` seeds a rule for every one of
 * them, so a freshly provisioned school starts ready rather than failing its
 * first receipt with POSTING_RULE_MISSING.
 *
 * Ordered as the money moves: bill, take, undo, spend the surplus, forgive,
 * give up, hand back.
 */
export const SCHOOLS_REQUIRED_SOURCE_TYPES: AccountingSourceType[] = [
  "SCHOOL_FEE_INVOICE",
  "SCHOOL_FEE_RECEIPT",
  "SCHOOL_FEE_RECEIPT_VOID",
  "SCHOOL_FEE_CREDIT_APPLIED",
  "SCHOOL_FEE_WAIVER",
  "SCHOOL_FEE_WRITE_OFF",
  "SCHOOL_FEE_REFUND",
];

export const RETAIL_TENDER_TYPES = ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"] as const;

export function formatAccountingSourceType(sourceType: string) {
  const match = ACCOUNTING_SOURCE_TYPE_OPTIONS.find((item) => item.value === sourceType);
  if (match) return match.label;
  return sourceType
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
