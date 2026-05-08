import type {
  AccountType,
  AccountingSourceType,
  PostingBasis,
  PostingDirection,
  PostingRuleConditionField,
  PostingRuleLineAccountSource,
  PostingRuleLineRepeatMode,
  PostingRuleMode,
  PostingRuleOperator,
  PostingRuleScopeType,
} from "@prisma/client";
import { resolveVerticalDefaults } from "@/lib/platform/vertical-defaults";

export const ZIMBABWE_RETAIL_FOUNDATION_PACK_CODE = "ZW_RETAIL_FOUNDATION";

export type DefaultAccount = {
  code: string;
  name: string;
  type: AccountType;
  category?: string;
  description?: string;
  systemManaged?: boolean;
};

export type DefaultCurrencyDefinition = {
  code: string;
  name: string;
  symbol?: string;
  decimalPlaces?: number;
  isBase?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export type DefaultTaxCode = {
  code: string;
  name: string;
  rate: number;
  type?: string;
  appliesTo?: string;
  vat7OutputBox?: string;
  vat7InputBox?: string;
  scheduleType?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
};

export type DefaultTaxCategory = {
  code: string;
  name: string;
  scope?: "CUSTOMER" | "VENDOR" | "BOTH";
  isActive?: boolean;
};

export type DefaultTaxTemplate = {
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
  lines: Array<{
    taxCodeCode: string;
    sortOrder?: number;
    appliesTo?: "SALES" | "PURCHASE" | "BOTH";
    isDefault?: boolean;
  }>;
};

export type DefaultTaxRule = {
  name: string;
  appliesTo?: "SALES" | "PURCHASE" | "BOTH";
  priority?: number;
  taxCategoryCode?: string;
  templateCode: string;
  currency?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
};

export type DefaultPostingRuleCondition = {
  field: PostingRuleConditionField;
  operator?: PostingRuleOperator;
  valueString?: string;
  valueList?: string[];
};

export type DefaultPostingRuleLine = {
  accountCode?: string;
  direction: PostingDirection;
  basis?: PostingBasis;
  allocationType?: "PERCENT" | "FIXED";
  allocationValue?: number;
  taxCodeCode?: string;
  repeatMode?: PostingRuleLineRepeatMode;
  accountSource?: PostingRuleLineAccountSource;
  valuePath?: string;
  memoTemplate?: string;
  costCenterCode?: string;
  sortOrder?: number;
};

export type DefaultPostingRule = {
  name: string;
  sourceType: AccountingSourceType;
  description?: string;
  priority?: number;
  scopeType?: PostingRuleScopeType;
  siteCode?: string;
  ruleMode?: PostingRuleMode;
  isFallback?: boolean;
  isActive?: boolean;
  conditions?: DefaultPostingRuleCondition[];
  lines: DefaultPostingRuleLine[];
};

export type DefaultTenderAccountMapping = {
  tenderType: string;
  currency?: string;
  registerCode?: string;
  siteCode?: string;
  priority?: number;
  clearingAccountCode: string;
  offsetAccountCode?: string;
  isActive?: boolean;
};

export type AccountingFoundationPack = {
  code: string;
  name: string;
  accounts: DefaultAccount[];
  currencies: DefaultCurrencyDefinition[];
  taxCodes: DefaultTaxCode[];
  taxCategories: DefaultTaxCategory[];
  taxTemplates: DefaultTaxTemplate[];
  taxRules: DefaultTaxRule[];
  tenderMappings: DefaultTenderAccountMapping[];
  postingRules: DefaultPostingRule[];
  defaultBankAccount: {
    name: string;
    bankName?: string;
    currency: string;
  };
};

const BASE_CHART_OF_ACCOUNTS: DefaultAccount[] = [
  { code: "1000", name: "Till Cash", type: "ASSET", category: "Cash", systemManaged: true },
  { code: "1005", name: "Cash Vault", type: "ASSET", category: "Cash", systemManaged: true },
  { code: "1010", name: "Operating Bank", type: "ASSET", category: "Cash", systemManaged: true },
  { code: "1015", name: "Card Clearing", type: "ASSET", category: "Cash", systemManaged: true },
  { code: "1016", name: "Mobile Money Clearing", type: "ASSET", category: "Cash", systemManaged: true },
  { code: "1017", name: "Transfer Clearing", type: "ASSET", category: "Cash", systemManaged: true },
  { code: "1018", name: "Voucher Clearing", type: "ASSET", category: "Cash", systemManaged: true },
  { code: "1020", name: "Bank Clearing", type: "ASSET", category: "Cash", systemManaged: true },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", category: "Receivables", systemManaged: true },
  { code: "1200", name: "Inventory", type: "ASSET", category: "Inventory", systemManaged: true },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY", category: "Payables", systemManaged: true },
  { code: "2200", name: "VAT Output", type: "LIABILITY", category: "Tax", systemManaged: true },
  { code: "2210", name: "VAT Input", type: "ASSET", category: "Tax", systemManaged: true },
  { code: "2300", name: "Goods Received Not Invoiced", type: "LIABILITY", category: "Inventory", systemManaged: true },
  { code: "3000", name: "Retained Earnings", type: "EQUITY", category: "Equity", systemManaged: true },
  { code: "4000", name: "Retail Sales Revenue", type: "INCOME", category: "Revenue", systemManaged: true },
  { code: "4010", name: "Sales Discounts", type: "INCOME", category: "Revenue", systemManaged: true },
  { code: "4020", name: "Sales Returns", type: "INCOME", category: "Revenue", systemManaged: true },
  { code: "4200", name: "Other Income", type: "INCOME", category: "Other Income", systemManaged: true },
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE", category: "COGS", systemManaged: true },
  { code: "5100", name: "Consumables Expense", type: "EXPENSE", category: "Operations", systemManaged: true },
  { code: "5200", name: "Wages Expense", type: "EXPENSE", category: "Payroll", systemManaged: true },
  { code: "5300", name: "Maintenance Expense", type: "EXPENSE", category: "Maintenance", systemManaged: true },
  { code: "5400", name: "Inventory Adjustments", type: "EXPENSE", category: "Inventory", systemManaged: true },
  { code: "5410", name: "Inventory Shrinkage", type: "EXPENSE", category: "Inventory", systemManaged: true },
  { code: "5420", name: "Cash Over Short", type: "EXPENSE", category: "Cash", systemManaged: true },
  { code: "5600", name: "Bad Debt Expense", type: "EXPENSE", category: "Receivables", systemManaged: true },
];

const GOLD_CHART_OF_ACCOUNTS: DefaultAccount[] = [
  { code: "1250", name: "Gold Inventory", type: "ASSET", category: "Inventory", systemManaged: true },
  { code: "1300", name: "Gold In Transit", type: "ASSET", category: "Inventory", systemManaged: true },
  { code: "2230", name: "Gold Wages Payable", type: "LIABILITY", category: "Payables", systemManaged: true },
  { code: "4100", name: "Gold Sales Revenue", type: "INCOME", category: "Revenue", systemManaged: true },
  { code: "4110", name: "Gold Production Income", type: "INCOME", category: "Revenue", systemManaged: true },
  { code: "5310", name: "Gold Mining Expenses", type: "EXPENSE", category: "Mining", systemManaged: true },
  { code: "5320", name: "Gold Inventory Adjustments", type: "EXPENSE", category: "Mining", systemManaged: true },
];

export const DEFAULT_CHART_OF_ACCOUNTS = BASE_CHART_OF_ACCOUNTS;

export const DEFAULT_CURRENCY_DEFINITIONS: DefaultCurrencyDefinition[] = [
  { code: "USD", name: "United States Dollar", symbol: "$", decimalPlaces: 2, isBase: true, sortOrder: 1 },
  { code: "ZWG", name: "Zimbabwe Gold", symbol: "ZiG", decimalPlaces: 2, sortOrder: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimalPlaces: 2, sortOrder: 3 },
];

export const DEFAULT_TAX_CODES: DefaultTaxCode[] = [
  {
    code: "VAT15",
    name: "VAT Standard Rate (Legacy)",
    rate: 15,
    type: "VAT",
    appliesTo: "BOTH",
    vat7OutputBox: "1",
    vat7InputBox: "14",
    effectiveTo: "2025-12-31T23:59:59.999Z",
  },
  {
    code: "VAT15_5",
    name: "VAT Standard Rate",
    rate: 15.5,
    type: "VAT",
    appliesTo: "BOTH",
    vat7OutputBox: "1",
    vat7InputBox: "14",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
  },
  {
    code: "VAT0",
    name: "VAT Zero Rated",
    rate: 0,
    type: "VAT",
    appliesTo: "BOTH",
    vat7OutputBox: "3",
    vat7InputBox: "15",
  },
  {
    code: "EXEMPT",
    name: "VAT Exempt",
    rate: 0,
    type: "VAT",
    appliesTo: "BOTH",
    vat7OutputBox: "4",
    vat7InputBox: "16",
  },
];

export const DEFAULT_TAX_CATEGORIES: DefaultTaxCategory[] = [
  { code: "CUST_STD", name: "Customer Standard", scope: "CUSTOMER" },
  { code: "VEND_STD", name: "Vendor Standard", scope: "VENDOR" },
  { code: "ZERO_RATED", name: "Zero Rated", scope: "BOTH" },
];

export const DEFAULT_TAX_TEMPLATES: DefaultTaxTemplate[] = [
  {
    code: "RET_SALES_STD",
    name: "Retail Sales VAT",
    description: "Default retail output VAT template.",
    lines: [{ taxCodeCode: "VAT15_5", sortOrder: 0, appliesTo: "SALES", isDefault: true }],
  },
  {
    code: "RET_PURCHASE_STD",
    name: "Retail Purchase VAT",
    description: "Default retail input VAT template.",
    lines: [{ taxCodeCode: "VAT15_5", sortOrder: 0, appliesTo: "PURCHASE", isDefault: true }],
  },
  {
    code: "ZERO_RATED",
    name: "Zero Rated",
    description: "Zero-rated fallback tax template.",
    lines: [{ taxCodeCode: "VAT0", sortOrder: 0, appliesTo: "BOTH", isDefault: true }],
  },
];

export const DEFAULT_TAX_RULES: DefaultTaxRule[] = [
  {
    name: "Retail sales default VAT",
    appliesTo: "SALES",
    priority: 10,
    templateCode: "RET_SALES_STD",
    currency: "USD",
  },
  {
    name: "Retail purchases default VAT",
    appliesTo: "PURCHASE",
    priority: 10,
    templateCode: "RET_PURCHASE_STD",
    currency: "USD",
  },
];

const BASE_POSTING_RULES: DefaultPostingRule[] = [
  {
    name: "Stock Receipt",
    sourceType: "STOCK_RECEIPT",
    lines: [
      { accountCode: "1200", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "2300", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Stock Issue",
    sourceType: "STOCK_ISSUE",
    lines: [
      { accountCode: "5100", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1200", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Stock Adjustment",
    sourceType: "STOCK_ADJUSTMENT",
    lines: [
      { accountCode: "5400", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1200", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Stock Transfer",
    sourceType: "STOCK_TRANSFER",
    lines: [
      { accountCode: "1200", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1200", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Payroll Run",
    sourceType: "PAYROLL_RUN",
    lines: [
      { accountCode: "5200", direction: "DEBIT", basis: "GROSS", allocationValue: 100 },
      { accountCode: "2000", direction: "CREDIT", basis: "NET", allocationValue: 100 },
      { accountCode: "2300", direction: "CREDIT", basis: "DEDUCTIONS", allocationValue: 100 },
    ],
  },
  {
    name: "Payroll Disbursement",
    sourceType: "PAYROLL_DISBURSEMENT",
    lines: [
      { accountCode: "2000", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1000", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Sales Invoice",
    sourceType: "SALES_INVOICE",
    lines: [
      { accountCode: "1100", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "4000", direction: "CREDIT", basis: "NET", allocationValue: 100 },
      { accountCode: "2200", direction: "CREDIT", basis: "TAX", allocationValue: 100 },
    ],
  },
  {
    name: "Sales Receipt",
    sourceType: "SALES_RECEIPT",
    lines: [
      { accountCode: "1010", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1100", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Sales Credit Note",
    sourceType: "SALES_CREDIT_NOTE",
    lines: [
      { accountCode: "4000", direction: "DEBIT", basis: "NET", allocationValue: 100 },
      { accountCode: "2200", direction: "DEBIT", basis: "TAX", allocationValue: 100 },
      { accountCode: "1100", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Sales Write-off",
    sourceType: "SALES_WRITE_OFF",
    lines: [
      { accountCode: "5600", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1100", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Purchase Bill",
    sourceType: "PURCHASE_BILL",
    lines: [
      { accountCode: "5000", direction: "DEBIT", basis: "NET", allocationValue: 100 },
      { accountCode: "2210", direction: "DEBIT", basis: "TAX", allocationValue: 100 },
      { accountCode: "2000", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Purchase Payment",
    sourceType: "PURCHASE_PAYMENT",
    lines: [
      { accountCode: "2000", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1010", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Purchase Debit Note",
    sourceType: "PURCHASE_DEBIT_NOTE",
    lines: [
      { accountCode: "5000", direction: "CREDIT", basis: "NET", allocationValue: 100 },
      { accountCode: "2210", direction: "CREDIT", basis: "TAX", allocationValue: 100 },
      { accountCode: "2000", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Purchase Write-off",
    sourceType: "PURCHASE_WRITE_OFF",
    lines: [
      { accountCode: "2000", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "4200", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Maintenance Completion",
    sourceType: "MAINTENANCE_COMPLETION",
    lines: [
      { accountCode: "5300", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1200", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Bank Transaction",
    sourceType: "BANK_TRANSACTION",
    lines: [
      { accountCode: "1020", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1010", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
];

const GOLD_POSTING_RULES: DefaultPostingRule[] = [
  {
    name: "Gold Purchase",
    sourceType: "GOLD_PURCHASE",
    lines: [
      { accountCode: "1200", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1000", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Gold Receipt",
    sourceType: "GOLD_RECEIPT",
    lines: [
      { accountCode: "1010", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "4100", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Gold Dispatch",
    sourceType: "GOLD_DISPATCH",
    lines: [
      { accountCode: "1300", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1200", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Gold Shift — Company Share (Mdara)",
    sourceType: "GOLD_SHIFT_ALLOCATION_COMPANY",
    description: "Owner/company portion of shift output. DR Gold Inventory, CR Production Income.",
    lines: [
      { accountCode: "1250", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "4110", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Gold Shift — Worker Share (Boys)",
    sourceType: "GOLD_SHIFT_ALLOCATION_WORKER",
    description: "Worker/crew portion of shift output. Held in inventory until paid out — DR Gold Inventory, CR Gold Wages Payable.",
    lines: [
      { accountCode: "1250", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "2230", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Gold Shift Expense",
    sourceType: "GOLD_SHIFT_EXPENSE",
    description: "Diesel/Shoots/LCD-style mining inputs. DR Mining Direct Costs, CR Gold Inventory.",
    lines: [
      { accountCode: "5310", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1250", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Gold Worker Payout",
    sourceType: "GOLD_PAYOUT",
    description: "Settlement of worker share. DR Gold Wages Payable, CR Cash.",
    lines: [
      { accountCode: "2230", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1010", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
  {
    name: "Gold Inventory Adjustment",
    sourceType: "GOLD_INVENTORY_ADJUSTMENT",
    description: "Manual on-hand corrections (loss, write-off, theft).",
    lines: [
      { accountCode: "5320", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
      { accountCode: "1250", direction: "CREDIT", basis: "AMOUNT", allocationValue: 100 },
    ],
  },
];

export const RETAIL_POSTING_RULES: DefaultPostingRule[] = [
  {
    name: "Retail sale - perpetual inventory",
    sourceType: "RETAIL_SALE",
    description: "Tender clearing, revenue, VAT, COGS, and inventory for posted retail sales.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      {
        direction: "DEBIT",
        repeatMode: "TENDER",
        accountSource: "TENDER_MAPPING",
        valuePath: "amount",
        memoTemplate: "{description} / {tenderType}",
        sortOrder: 10,
      },
      {
        accountCode: "4000",
        direction: "CREDIT",
        basis: "NET",
        memoTemplate: "{description} / revenue",
        sortOrder: 20,
      },
      {
        accountCode: "2200",
        direction: "CREDIT",
        basis: "TAX",
        memoTemplate: "{description} / output VAT",
        sortOrder: 30,
      },
      {
        accountCode: "5000",
        direction: "DEBIT",
        valuePath: "inventory.totalCost",
        memoTemplate: "{description} / COGS",
        sortOrder: 40,
      },
      {
        accountCode: "1200",
        direction: "CREDIT",
        valuePath: "inventory.totalCost",
        memoTemplate: "{description} / inventory",
        sortOrder: 50,
      },
    ],
  },
  {
    name: "Retail refund - perpetual inventory",
    sourceType: "RETAIL_REFUND",
    description: "Reverse the original retail sale with inventory restored.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      {
        direction: "DEBIT",
        repeatMode: "TENDER",
        accountSource: "TENDER_MAPPING",
        valuePath: "amount",
        memoTemplate: "{description} / {tenderType}",
        sortOrder: 10,
      },
      {
        accountCode: "4000",
        direction: "CREDIT",
        basis: "NET",
        memoTemplate: "{description} / revenue",
        sortOrder: 20,
      },
      {
        accountCode: "2200",
        direction: "CREDIT",
        basis: "TAX",
        memoTemplate: "{description} / output VAT",
        sortOrder: 30,
      },
      {
        accountCode: "5000",
        direction: "DEBIT",
        valuePath: "inventory.totalCost",
        memoTemplate: "{description} / COGS",
        sortOrder: 40,
      },
      {
        accountCode: "1200",
        direction: "CREDIT",
        valuePath: "inventory.totalCost",
        memoTemplate: "{description} / inventory",
        sortOrder: 50,
      },
    ],
  },
  {
    name: "Retail void - perpetual inventory",
    sourceType: "RETAIL_VOID",
    description: "Reverse a same-period sale void with inventory restored.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      {
        direction: "DEBIT",
        repeatMode: "TENDER",
        accountSource: "TENDER_MAPPING",
        valuePath: "amount",
        memoTemplate: "{description} / {tenderType}",
        sortOrder: 10,
      },
      {
        accountCode: "4000",
        direction: "CREDIT",
        basis: "NET",
        memoTemplate: "{description} / revenue",
        sortOrder: 20,
      },
      {
        accountCode: "2200",
        direction: "CREDIT",
        basis: "TAX",
        memoTemplate: "{description} / output VAT",
        sortOrder: 30,
      },
      {
        accountCode: "5000",
        direction: "DEBIT",
        valuePath: "inventory.totalCost",
        memoTemplate: "{description} / COGS",
        sortOrder: 40,
      },
      {
        accountCode: "1200",
        direction: "CREDIT",
        valuePath: "inventory.totalCost",
        memoTemplate: "{description} / inventory",
        sortOrder: 50,
      },
    ],
  },
  {
    name: "Retail goods receipt",
    sourceType: "RETAIL_GOODS_RECEIPT",
    description: "Post received inventory into stock and offset GRNI.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      { accountCode: "1200", direction: "DEBIT", basis: "AMOUNT", memoTemplate: "{description} / inventory", sortOrder: 10 },
      { accountCode: "2300", direction: "CREDIT", basis: "AMOUNT", memoTemplate: "{description} / GRNI", sortOrder: 20 },
    ],
  },
  {
    name: "Retail stock adjustment",
    sourceType: "RETAIL_STOCK_ADJUSTMENT",
    description: "Inventory variance against shrinkage/adjustment expense.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      { accountCode: "1200", direction: "DEBIT", basis: "AMOUNT", memoTemplate: "{description} / inventory", sortOrder: 10 },
      { accountCode: "5410", direction: "CREDIT", basis: "AMOUNT", memoTemplate: "{description} / shrinkage", sortOrder: 20 },
    ],
  },
  {
    name: "Retail shift open",
    sourceType: "RETAIL_SHIFT_OPEN",
    description: "Move opening float from cash vault to till cash.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      { accountCode: "1000", direction: "DEBIT", basis: "AMOUNT", memoTemplate: "{description} / till cash", sortOrder: 10 },
      { accountCode: "1005", direction: "CREDIT", basis: "AMOUNT", memoTemplate: "{description} / cash vault", sortOrder: 20 },
    ],
  },
  {
    name: "Retail shift variance",
    sourceType: "RETAIL_SHIFT_VARIANCE",
    description: "Post cash over/short against till cash.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      { accountCode: "1000", direction: "DEBIT", basis: "AMOUNT", memoTemplate: "{description} / till cash", sortOrder: 10 },
      { accountCode: "5420", direction: "CREDIT", basis: "AMOUNT", memoTemplate: "{description} / cash over short", sortOrder: 20 },
    ],
  },
];

export const DEFAULT_POSTING_RULES = BASE_POSTING_RULES;

export const RETAIL_TENDER_ACCOUNT_MAPPINGS: DefaultTenderAccountMapping[] = [
  { tenderType: "CASH", clearingAccountCode: "1000", priority: 10 },
  { tenderType: "CARD", clearingAccountCode: "1015", priority: 20 },
  { tenderType: "MOBILE_MONEY", clearingAccountCode: "1016", priority: 30 },
  { tenderType: "TRANSFER", clearingAccountCode: "1017", priority: 40 },
  { tenderType: "VOUCHER", clearingAccountCode: "1018", priority: 50 },
];

type AccountingDefaultArgs = {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
};

function includeGoldFlows(args: AccountingDefaultArgs): boolean {
  return resolveVerticalDefaults(args).accounting.includeGoldFlows;
}

function includeRetailFlows(args: AccountingDefaultArgs): boolean {
  return (args.workspaceProfile ?? "").toUpperCase() === "RETAIL";
}

export function getDefaultChartOfAccounts(args: AccountingDefaultArgs): DefaultAccount[] {
  const defaults = [...BASE_CHART_OF_ACCOUNTS];
  if (includeGoldFlows(args)) {
    defaults.push(...GOLD_CHART_OF_ACCOUNTS);
  }
  return defaults;
}

export function getDefaultPostingRules(args: AccountingDefaultArgs): DefaultPostingRule[] {
  const defaults = [...BASE_POSTING_RULES];
  if (includeGoldFlows(args)) {
    defaults.push(...GOLD_POSTING_RULES);
  }
  if (includeRetailFlows(args)) {
    defaults.push(...RETAIL_POSTING_RULES);
  }
  return defaults;
}

export function getZimbabweRetailFoundationPack(args: AccountingDefaultArgs): AccountingFoundationPack {
  return {
    code: ZIMBABWE_RETAIL_FOUNDATION_PACK_CODE,
    name: "Zimbabwe Retail Foundation",
    accounts: getDefaultChartOfAccounts({ ...args, workspaceProfile: "RETAIL" }),
    currencies: DEFAULT_CURRENCY_DEFINITIONS,
    taxCodes: DEFAULT_TAX_CODES,
    taxCategories: DEFAULT_TAX_CATEGORIES,
    taxTemplates: DEFAULT_TAX_TEMPLATES,
    taxRules: DEFAULT_TAX_RULES,
    tenderMappings: RETAIL_TENDER_ACCOUNT_MAPPINGS,
    postingRules: getDefaultPostingRules({ ...args, workspaceProfile: "RETAIL" }),
    defaultBankAccount: {
      name: "Operating Bank",
      bankName: "Seeded Foundation Bank",
      currency: "USD",
    },
  };
}
