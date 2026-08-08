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

/**
 * Payroll accounts.
 *
 * These exist because payroll had none of its own. Deductions were credited to
 * **2300 Goods Received Not Invoiced** — an inventory account it shared with
 * `STOCK_RECEIPT`, so PAYE withheld from a wage and stock received but not
 * invoiced accumulated in the same balance. Net pay went to generic
 * **2000 Accounts Payable** alongside every supplier invoice.
 *
 * Nothing about that was recoverable at filing time: there was no balance an
 * accountant could point at and say "this is what we owe ZIMRA", so the P2 could
 * not be reconciled to the ledger at all.
 *
 * One account per authority, because each is remitted separately, on its own
 * date, and reconciled on its own return.
 */
const PAYROLL_CHART_OF_ACCOUNTS: DefaultAccount[] = [
  { code: "2100", name: "Net Pay Payable", type: "LIABILITY", category: "Payroll", systemManaged: true },
  { code: "2110", name: "PAYE Payable", type: "LIABILITY", category: "Payroll", systemManaged: true },
  { code: "2120", name: "NSSA Payable", type: "LIABILITY", category: "Payroll", systemManaged: true },
  { code: "2130", name: "AIDS Levy Payable", type: "LIABILITY", category: "Payroll", systemManaged: true },
  { code: "2140", name: "ZIMDEF Payable", type: "LIABILITY", category: "Payroll", systemManaged: true },
  { code: "2150", name: "NEC Dues Payable", type: "LIABILITY", category: "Payroll", systemManaged: true },
  { code: "2160", name: "Standards Development Levy Payable", type: "LIABILITY", category: "Payroll", systemManaged: true },
  { code: "2170", name: "Payroll Deductions Payable", type: "LIABILITY", category: "Payroll", systemManaged: true },
  // The employer's own contributions are an expense of employing people, and a
  // separate one from the wage itself — a business that wants to know its true
  // cost of labour needs the two apart.
  { code: "5210", name: "Employer Statutory Contributions", type: "EXPENSE", category: "Payroll", systemManaged: true },
];

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
  ...PAYROLL_CHART_OF_ACCOUNTS,
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

/**
 * S-2.3 — the accounts a school's fee money actually belongs in.
 *
 * Named in `docs/expansion-plan/schools-production-readiness.md` and defined
 * nowhere until now, which is why tuition was being credited to "Retail Sales
 * Revenue" and a bursary charged to "Bad Debt Expense".
 *
 * Codes are chosen to sit beside their retail siblings without colliding:
 * receivables next to 1100, deferred income in the 2xxx liabilities, fee
 * revenue above the 42xx other income, and the bursary expense immediately
 * after 5600 Bad Debt — adjacent because they are constantly confused, and
 * separate because a scholarship the school chose to give is not a debt it
 * failed to collect.
 */
const SCHOOL_CHART_OF_ACCOUNTS: DefaultAccount[] = [
  {
    code: "1110",
    name: "School Fees Receivable",
    type: "ASSET",
    category: "Receivables",
    description: "Fees billed to families and not yet settled.",
    systemManaged: true,
  },
  {
    code: "2400",
    name: "Fees Received In Advance",
    type: "LIABILITY",
    category: "Deferred Income",
    description:
      "Money taken from a family that no invoice has claimed yet. It is owed back until a bill exists to spend it on.",
    systemManaged: true,
  },
  {
    code: "4300",
    name: "Tuition Fee Revenue",
    type: "INCOME",
    category: "Revenue",
    description: "Fee income recognised when an invoice is issued.",
    systemManaged: true,
  },
  {
    code: "4310",
    name: "Boarding Fee Revenue",
    type: "INCOME",
    category: "Revenue",
    description:
      "Boarding income. Seeded for manual and reporting use — no seeded posting rule reaches it, because the rule engine cannot yet split one invoice's revenue by fee line.",
    systemManaged: true,
  },
  {
    code: "5610",
    name: "Bursary & Scholarship Expense",
    type: "EXPENSE",
    category: "Bursaries",
    description:
      "Fees the school chose to forgo. Distinct from 5600 Bad Debt Expense, which is fees it failed to collect.",
    systemManaged: true,
  },
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
    // Was three lines: wages debited at gross, net credited to generic Accounts
    // Payable, and every deduction credited to 2300 Goods Received Not Invoiced —
    // an inventory account shared with stock receipts. There was no balance an
    // accountant could reconcile a P2 against.
    //
    // Now one credit per authority, each summed from the `PayrollLineComponent`
    // rows carrying that `statutoryKey`, so the payable balance and the return
    // filed against it come from the same rows. The employer's own contributions
    // are their own debit and their own credit — a cost of employing people that
    // never passed through anybody's wage.
    name: "Payroll Run",
    sourceType: "PAYROLL_RUN",
    lines: [
      { accountCode: "5200", direction: "DEBIT", basis: "GROSS", allocationValue: 100 },
      { accountCode: "5210", direction: "DEBIT", basis: "EMPLOYER_CONTRIBUTIONS", allocationValue: 100 },
      { accountCode: "2100", direction: "CREDIT", basis: "NET", allocationValue: 100 },
      { accountCode: "2110", direction: "CREDIT", basis: "PAYE", allocationValue: 100 },
      { accountCode: "2130", direction: "CREDIT", basis: "AIDS_LEVY", allocationValue: 100 },
      { accountCode: "2120", direction: "CREDIT", basis: "NSSA_EMPLOYEE", allocationValue: 100 },
      { accountCode: "2120", direction: "CREDIT", basis: "NSSA_EMPLOYER", allocationValue: 100 },
      { accountCode: "2140", direction: "CREDIT", basis: "ZIMDEF", allocationValue: 100 },
      { accountCode: "2160", direction: "CREDIT", basis: "STANDARDS_DEVELOPMENT_LEVY", allocationValue: 100 },
      { accountCode: "2150", direction: "CREDIT", basis: "NEC_EMPLOYEE", allocationValue: 100 },
      { accountCode: "2150", direction: "CREDIT", basis: "NEC_EMPLOYER", allocationValue: 100 },
      { accountCode: "2170", direction: "CREDIT", basis: "OTHER_DEDUCTIONS", allocationValue: 100 },
    ],
  },
  {
    // Settling net pay clears 2100, not generic Accounts Payable — the account
    // the run credited.
    name: "Payroll Disbursement",
    sourceType: "PAYROLL_DISBURSEMENT",
    lines: [
      { accountCode: "2100", direction: "DEBIT", basis: "AMOUNT", allocationValue: 100 },
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

/**
 * S-2.3 — one rule per school fee document, and every one of them balances.
 *
 * Three of these split a single amount across two credit (or debit) lines using
 * `valuePath` into the posting payload. Two properties make that safe:
 *
 *   * `emitSchoolFeeAccountingEvent` derives the two parts from one figure —
 *     the second is always `amount − first` — so they sum to the amount by
 *     construction and cannot drift a cent apart through two separate currency
 *     conversions;
 *   * the `basis` on those lines is `TAX`, not `AMOUNT`. A `valuePath` that
 *     resolves to nothing falls back to the basis, and every school caller
 *     passes `taxAmount: 0` on these events, so a missing key yields a zero
 *     line — which `simulatePosting` drops — rather than silently doubling the
 *     entry.
 *
 * `isFallback` matches the retail rules: these are the defaults a school
 * overrides with its own rule, not rules that beat one it wrote.
 */
export const SCHOOLS_POSTING_RULES: DefaultPostingRule[] = [
  {
    name: "School fee invoice",
    sourceType: "SCHOOL_FEE_INVOICE",
    description:
      "Bill a family. DR School Fees Receivable, CR Tuition Fee Revenue for the net and output VAT for the tax.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      { accountCode: "1110", direction: "DEBIT", basis: "AMOUNT", memoTemplate: "{description} / fees receivable", sortOrder: 10 },
      { accountCode: "4300", direction: "CREDIT", basis: "NET", memoTemplate: "{description} / fee revenue", sortOrder: 20 },
      { accountCode: "2200", direction: "CREDIT", basis: "TAX", memoTemplate: "{description} / output VAT", sortOrder: 30 },
    ],
  },
  {
    name: "School fee receipt",
    sourceType: "SCHOOL_FEE_RECEIPT",
    description:
      "Take money from a family. DR bank; CR School Fees Receivable for the part that settles a bill, CR Fees Received In Advance for the surplus that does not.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      { accountCode: "1010", direction: "DEBIT", basis: "AMOUNT", memoTemplate: "{description} / bank", sortOrder: 10 },
      { accountCode: "1110", direction: "CREDIT", basis: "TAX", valuePath: "allocatedBaseAmount", memoTemplate: "{description} / fees receivable", sortOrder: 20 },
      { accountCode: "2400", direction: "CREDIT", basis: "TAX", valuePath: "unallocatedBaseAmount", memoTemplate: "{description} / credit on account", sortOrder: 30 },
    ],
  },
  {
    name: "School fee receipt void",
    sourceType: "SCHOOL_FEE_RECEIPT_VOID",
    description:
      "Reverse a fee receipt. Same lines as the receipt; the void call inverts every direction, which is how retail reverses a sale too.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      { accountCode: "1010", direction: "DEBIT", basis: "AMOUNT", memoTemplate: "{description} / bank", sortOrder: 10 },
      { accountCode: "1110", direction: "CREDIT", basis: "TAX", valuePath: "allocatedBaseAmount", memoTemplate: "{description} / fees receivable", sortOrder: 20 },
      { accountCode: "2400", direction: "CREDIT", basis: "TAX", valuePath: "unallocatedBaseAmount", memoTemplate: "{description} / credit on account", sortOrder: 30 },
    ],
  },
  {
    name: "School fee credit applied",
    sourceType: "SCHOOL_FEE_CREDIT_APPLIED",
    description:
      "Spend a family's credit on a later bill. DR Fees Received In Advance, CR School Fees Receivable — no cash moves, the obligation simply changes shape.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      { accountCode: "2400", direction: "DEBIT", basis: "AMOUNT", memoTemplate: "{description} / credit on account", sortOrder: 10 },
      { accountCode: "1110", direction: "CREDIT", basis: "AMOUNT", memoTemplate: "{description} / fees receivable", sortOrder: 20 },
    ],
  },
  {
    name: "School fee waiver",
    sourceType: "SCHOOL_FEE_WAIVER",
    description:
      "A bursary, scholarship or discount. DR Bursary & Scholarship Expense, CR School Fees Receivable. Deliberately not Bad Debt — the school chose this.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      { accountCode: "5610", direction: "DEBIT", basis: "AMOUNT", memoTemplate: "{description} / bursary", sortOrder: 10 },
      { accountCode: "1110", direction: "CREDIT", basis: "AMOUNT", memoTemplate: "{description} / fees receivable", sortOrder: 20 },
    ],
  },
  {
    name: "School fee write-off",
    sourceType: "SCHOOL_FEE_WRITE_OFF",
    description:
      "A fee given up as uncollectable. DR Bad Debt Expense, CR School Fees Receivable.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      { accountCode: "5600", direction: "DEBIT", basis: "AMOUNT", memoTemplate: "{description} / bad debt", sortOrder: 10 },
      { accountCode: "1110", direction: "CREDIT", basis: "AMOUNT", memoTemplate: "{description} / fees receivable", sortOrder: 20 },
    ],
  },
  {
    name: "School fee refund",
    sourceType: "SCHOOL_FEE_REFUND",
    description:
      "Hand credit back. CR bank; DR whichever account was holding the credit — Fees Received In Advance for a receipt surplus, School Fees Receivable for an over-settled invoice.",
    priority: 10,
    scopeType: "COMPANY",
    ruleMode: "GUIDED",
    isFallback: true,
    lines: [
      { accountCode: "2400", direction: "DEBIT", basis: "TAX", valuePath: "refundFromAdvanceBaseAmount", memoTemplate: "{description} / credit on account", sortOrder: 10 },
      { accountCode: "1110", direction: "DEBIT", basis: "TAX", valuePath: "refundFromReceivableBaseAmount", memoTemplate: "{description} / fees receivable", sortOrder: 20 },
      { accountCode: "1010", direction: "CREDIT", basis: "AMOUNT", memoTemplate: "{description} / bank", sortOrder: 30 },
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

/**
 * S-2.3 — does this tenant get the school chart and the `SCHOOL_FEE_*` rules?
 *
 * Two ways in, because a tenant can be a school by profile or by purchase. The
 * vertical answers for a `SCHOOLS` workspace (and for a `GENERAL` one whose
 * enabled features infer it); the feature-prefix check catches the mixed tenant
 * — a school that also runs a tuck shop — where `RETAIL` wins the inference and
 * would otherwise leave the bursar with no posting rules at all.
 */
export function includeSchoolFlows(args: AccountingDefaultArgs): boolean {
  if (resolveVerticalDefaults(args).accounting.includeSchoolFlows) return true;
  return (args.enabledFeatures ?? []).some((feature) =>
    feature.trim().toLowerCase().startsWith("schools."),
  );
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
  // The retail baseline is seeded for every tenant — that is long-standing
  // behaviour and this override is what produces it. School flows are decided
  // from the tenant's *real* profile and features, which the override would
  // otherwise hide.
  const retailArgs: AccountingDefaultArgs = { ...args, workspaceProfile: "RETAIL" };
  const schools = includeSchoolFlows(args);

  return {
    code: ZIMBABWE_RETAIL_FOUNDATION_PACK_CODE,
    name: "Zimbabwe Retail Foundation",
    accounts: [
      ...getDefaultChartOfAccounts(retailArgs),
      ...(schools ? SCHOOL_CHART_OF_ACCOUNTS : []),
    ],
    currencies: DEFAULT_CURRENCY_DEFINITIONS,
    taxCodes: DEFAULT_TAX_CODES,
    taxCategories: DEFAULT_TAX_CATEGORIES,
    taxTemplates: DEFAULT_TAX_TEMPLATES,
    taxRules: DEFAULT_TAX_RULES,
    tenderMappings: RETAIL_TENDER_ACCOUNT_MAPPINGS,
    postingRules: [
      ...getDefaultPostingRules(retailArgs),
      ...(schools ? SCHOOLS_POSTING_RULES : []),
    ],
    defaultBankAccount: {
      name: "Operating Bank",
      bankName: "Seeded Foundation Bank",
      currency: "USD",
    },
  };
}
