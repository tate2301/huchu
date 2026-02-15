import type { AccountType, AccountingSourceType, PostingBasis, PostingDirection } from "@prisma/client";

export type DefaultAccount = {
  code: string;
  name: string;
  type: AccountType;
  category?: string;
  description?: string;
  systemManaged?: boolean;
};

export type DefaultTaxCode = {
  code: string;
  name: string;
  rate: number;
  type?: string;
};

export type DefaultPostingRule = {
  name: string;
  sourceType: AccountingSourceType;
  lines: Array<{
    accountCode: string;
    direction: PostingDirection;
    basis: PostingBasis;
    allocationPercent?: number;
  }>;
};

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccount[] = [
  { code: "1000", name: "Cash on Hand", type: "ASSET", category: "Cash", systemManaged: true },
  { code: "1010", name: "Bank", type: "ASSET", category: "Cash", systemManaged: true },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", category: "Receivables", systemManaged: true },
  { code: "1200", name: "Inventory", type: "ASSET", category: "Inventory", systemManaged: true },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY", category: "Payables", systemManaged: true },
  { code: "2100", name: "Payroll Liabilities", type: "LIABILITY", category: "Payroll", systemManaged: true },
  { code: "2110", name: "Payroll Deductions", type: "LIABILITY", category: "Payroll", systemManaged: true },
  { code: "2200", name: "VAT Output", type: "LIABILITY", category: "Tax", systemManaged: true },
  { code: "2210", name: "VAT Input", type: "ASSET", category: "Tax", systemManaged: true },
  { code: "2300", name: "Stock Clearing", type: "LIABILITY", category: "Inventory", systemManaged: true },
  { code: "3000", name: "Owner's Equity", type: "EQUITY", category: "Equity", systemManaged: true },
  { code: "4000", name: "Sales Revenue", type: "INCOME", category: "Revenue", systemManaged: true },
  { code: "4100", name: "Gold Sales Revenue", type: "INCOME", category: "Revenue", systemManaged: true },
  { code: "4200", name: "Other Income", type: "INCOME", category: "Other Income", systemManaged: true },
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE", category: "COGS", systemManaged: true },
  { code: "5100", name: "Consumables Expense", type: "EXPENSE", category: "Operations", systemManaged: true },
  { code: "5200", name: "Wages Expense", type: "EXPENSE", category: "Payroll", systemManaged: true },
  { code: "5300", name: "Maintenance Expense", type: "EXPENSE", category: "Maintenance", systemManaged: true },
  { code: "5400", name: "Inventory Adjustments", type: "EXPENSE", category: "Inventory", systemManaged: true },
  { code: "5600", name: "Bad Debt Expense", type: "EXPENSE", category: "Receivables", systemManaged: true },
];

export const DEFAULT_TAX_CODES: DefaultTaxCode[] = [
  { code: "VAT15", name: "VAT Standard Rate", rate: 15, type: "VAT" },
  { code: "VAT0", name: "VAT Zero Rated", rate: 0, type: "VAT" },
  { code: "EXEMPT", name: "VAT Exempt", rate: 0, type: "VAT" },
];

export const DEFAULT_POSTING_RULES: DefaultPostingRule[] = [
  {
    name: "Stock Receipt",
    sourceType: "STOCK_RECEIPT",
    lines: [
      { accountCode: "1200", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
      { accountCode: "2300", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Stock Issue",
    sourceType: "STOCK_ISSUE",
    lines: [
      { accountCode: "5100", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
      { accountCode: "1200", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Stock Adjustment",
    sourceType: "STOCK_ADJUSTMENT",
    lines: [
      { accountCode: "5400", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
      { accountCode: "1200", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Payroll Run",
    sourceType: "PAYROLL_RUN",
    lines: [
      { accountCode: "5200", direction: "DEBIT", basis: "GROSS", allocationPercent: 100 },
      { accountCode: "2100", direction: "CREDIT", basis: "NET", allocationPercent: 100 },
      { accountCode: "2110", direction: "CREDIT", basis: "DEDUCTIONS", allocationPercent: 100 },
    ],
  },
  {
    name: "Payroll Disbursement",
    sourceType: "PAYROLL_DISBURSEMENT",
    lines: [
      { accountCode: "2100", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
      { accountCode: "1000", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Gold Receipt",
    sourceType: "GOLD_RECEIPT",
    lines: [
      { accountCode: "1010", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
      { accountCode: "4100", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Sales Invoice",
    sourceType: "SALES_INVOICE",
    lines: [
      { accountCode: "1100", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
      { accountCode: "4000", direction: "CREDIT", basis: "NET", allocationPercent: 100 },
      { accountCode: "2200", direction: "CREDIT", basis: "TAX", allocationPercent: 100 },
    ],
  },
  {
    name: "Sales Receipt",
    sourceType: "SALES_RECEIPT",
    lines: [
      { accountCode: "1010", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
      { accountCode: "1100", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Sales Credit Note",
    sourceType: "SALES_CREDIT_NOTE",
    lines: [
      { accountCode: "4000", direction: "DEBIT", basis: "NET", allocationPercent: 100 },
      { accountCode: "2200", direction: "DEBIT", basis: "TAX", allocationPercent: 100 },
      { accountCode: "1100", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Sales Write-off",
    sourceType: "SALES_WRITE_OFF",
    lines: [
      { accountCode: "5600", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
      { accountCode: "1100", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Purchase Bill",
    sourceType: "PURCHASE_BILL",
    lines: [
      { accountCode: "5000", direction: "DEBIT", basis: "NET", allocationPercent: 100 },
      { accountCode: "2210", direction: "DEBIT", basis: "TAX", allocationPercent: 100 },
      { accountCode: "2000", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Purchase Payment",
    sourceType: "PURCHASE_PAYMENT",
    lines: [
      { accountCode: "2000", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
      { accountCode: "1010", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Purchase Debit Note",
    sourceType: "PURCHASE_DEBIT_NOTE",
    lines: [
      { accountCode: "5000", direction: "CREDIT", basis: "NET", allocationPercent: 100 },
      { accountCode: "2210", direction: "CREDIT", basis: "TAX", allocationPercent: 100 },
      { accountCode: "2000", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Purchase Write-off",
    sourceType: "PURCHASE_WRITE_OFF",
    lines: [
      { accountCode: "2000", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
      { accountCode: "4200", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
  {
    name: "Maintenance Completion",
    sourceType: "MAINTENANCE_COMPLETION",
    lines: [
      { accountCode: "5300", direction: "DEBIT", basis: "AMOUNT", allocationPercent: 100 },
      { accountCode: "1200", direction: "CREDIT", basis: "AMOUNT", allocationPercent: 100 },
    ],
  },
];
