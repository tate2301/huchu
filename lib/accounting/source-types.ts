import type { AccountingSourceType } from "@prisma/client";

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
