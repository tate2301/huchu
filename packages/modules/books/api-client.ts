/**
 * The books screens' client: what the browser asks of `/api/accounting`.
 */
import { buildQuery, fetchJson, type Pagination, type PaginationMeta } from "@corelithzw/platform/api-client";
import type { Site } from "@corelithzw/platform/client/sites";

// ============================================
// Accounting API Functions
// ============================================

export type AccountingSummary = {
  accounts: number;
  openPeriods: number;
  postedJournals: number;
  draftJournals: number;
  openInvoices: number;
  openBills: number;
  pendingIntegrationEvents?: number;
  failedIntegrationEvents?: number;
  pendingVatReturns?: number;
  pendingFiscalReceipts?: number;
  freezeBeforeDate?: string | null;
  retainedEarningsAccountId?: string | null;
};

export type ChartOfAccountRecord = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  nodeType?: "GROUP" | "LEDGER";
  parentAccountId?: string | null;
  hierarchyPath?: string | null;
  level?: number;
  category?: string | null;
  description?: string | null;
  isActive: boolean;
  systemManaged?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AccountingPeriodRecord = {
  id: string;
  companyId: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
  closedAt?: string | null;
  reopenedAt?: string | null;
  reopenedById?: string | null;
  reopenReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JournalLineRecord = {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
  memo?: string | null;
  costCenterId?: string | null;
  account?: { code: string; name: string } | null;
};

export type JournalEntryRecord = {
  id: string;
  companyId: string;
  entryNumber: number;
  entryDate: string;
  description: string;
  status: "DRAFT" | "POSTED";
  totalDebit?: number;
  totalCredit?: number;
  amount?: number;
  periodId?: string | null;
  period?: { id: string; startDate: string; endDate: string } | null;
  lines?: JournalLineRecord[];
  createdAt: string;
  updatedAt: string;
};

export type PostingRuleLineRecord = {
  id: string;
  accountId?: string | null;
  direction: "DEBIT" | "CREDIT";
  basis: "AMOUNT" | "NET" | "TAX" | "GROSS" | "DEDUCTIONS" | "ALLOWANCES";
  taxCodeId?: string | null;
  allocationType?: "PERCENT" | "FIXED" | null;
  allocationValue?: number | null;
  repeatMode?: "NONE" | "TENDER";
  accountSource?: "FIXED_ACCOUNT" | "TENDER_MAPPING";
  valuePath?: string | null;
  memoTemplate?: string | null;
  costCenterId?: string | null;
  sortOrder?: number;
  account?: { code: string; name: string } | null;
};

export type PostingRuleConditionRecord = {
  id: string;
  ruleId: string;
  field:
    | "SITE_ID"
    | "REGISTER_CODE"
    | "TENDER_TYPE"
    | "CURRENCY"
    | "CUSTOMER_TAX_CATEGORY_ID"
    | "VENDOR_TAX_CATEGORY_ID"
    | "SALE_TYPE"
    | "MOVEMENT_TYPE";
  operator: "EQ" | "NEQ" | "IN" | "NOT_IN" | "EXISTS" | "NOT_EXISTS";
  valueString?: string | null;
  valueListJson?: string | null;
};

export type PostingRuleRecord = {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
  sourceType: string;
  priority: number;
  scopeType: "COMPANY" | "SITE";
  siteId?: string | null;
  ruleMode: "GUIDED" | "ADVANCED";
  isFallback: boolean;
  isActive: boolean;
  lines: PostingRuleLineRecord[];
  conditions?: PostingRuleConditionRecord[];
};

export type PostingSimulationLine = {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string;
};

export type PostingSimulationResult = {
  selectedRule?: {
    id: string;
    name: string;
    sourceType: string;
    priority: number;
    scopeType: "COMPANY" | "SITE";
    isFallback: boolean;
  };
  lines: PostingSimulationLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  warnings: string[];
  error?: string;
  code?: string;
};

export type AccountingReadinessCheck = {
  id: string;
  label: string;
  ready: boolean;
  note?: string;
};

export type AccountingSetupReadiness = {
  companyId: string;
  packCode: string;
  summary: {
    completed: number;
    total: number;
    percent: number;
  };
  checks: AccountingReadinessCheck[];
  accountCounts: Record<string, number>;
  openPeriods: number;
  requiredRules: Array<{ sourceType: string; configured: boolean }>;
  /**
   * S-2.3. Coverage over `SCHOOLS_REQUIRED_SOURCE_TYPES`, and empty on a tenant
   * that is not a school — so a screen that renders it should render nothing
   * rather than an empty table.
   */
  schoolRules: Array<{ sourceType: string; configured: boolean }>;
  tenderMappings: Array<{ tenderType: string; configured: boolean }>;
  currencies: Array<{ code: string; configured: boolean; hasRecentRate: boolean }>;
  defaults: {
    retainedEarningsAccountId: string | null;
    defaultTaxCodeId: string | null;
    defaultBankAccountId: string | null;
  };
  failedEvents: number;
  pendingEvents: number;
  recentExecutions: Array<{
    id: string;
    mode: "DRY_RUN" | "APPLY";
    status: "PENDING" | "COMPLETED" | "FAILED";
    createdAt: string;
    completedAt: string | null;
  }>;
};

export type AccountingSeedPackResult = {
  companyId: string;
  packCode: string;
  mode: "DRY_RUN" | "APPLY";
  executionId?: string | null;
  createdAccounts: number;
  createdTaxCodes: number;
  createdTaxCategories: number;
  createdTaxTemplates: number;
  createdTaxRules: number;
  createdTenderMappings: number;
  createdPostingRules: number;
  createdCurrencyDefinitions: number;
  createdCurrencyRates: number;
  createdPeriods: number;
  createdBankAccounts: number;
  preview: {
    missingAccounts: string[];
    missingTaxCodes: string[];
    missingTaxCategories: string[];
    missingTaxTemplates: string[];
    missingTaxRules: string[];
    missingPostingRules: string[];
    missingTenderMappings: string[];
    missingCurrencies: string[];
    missingFxQuotes: string[];
  };
  readiness: AccountingSetupReadiness;
};

export type AccountingSeedExecutionRecord = {
  id: string;
  companyId: string;
  mode: "DRY_RUN" | "APPLY";
  status: "PENDING" | "COMPLETED" | "FAILED";
  actorId?: string | null;
  actorEmail?: string | null;
  summaryJson?: string | null;
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

export type TenderAccountMappingRecord = {
  id: string;
  companyId: string;
  siteId?: string | null;
  registerCode?: string | null;
  tenderType: string;
  currency?: string | null;
  priority: number;
  clearingAccountId: string;
  offsetAccountId?: string | null;
  isActive: boolean;
  clearingAccount?: { code: string; name: string } | null;
  offsetAccount?: { code: string; name: string } | null;
};

export type CurrencyDefinitionRecord = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isBase: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type AccountingIntegrationEventRecord = {
  id: string;
  companyId: string;
  sourceDomain?: string | null;
  sourceAction?: string | null;
  sourceType: string;
  sourceId?: string | null;
  eventKey: string;
  entryDate: string;
  description: string;
  amount: number;
  status: "PENDING" | "POSTED" | "FAILED" | "IGNORED";
  attemptCount: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  journalEntryId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountingIntegrationEventListResponse = {
  data: AccountingIntegrationEventRecord[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export type TaxCodeRecord = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  rate: number;
  type: string;
  appliesTo?: string;
  vat7OutputBox?: string | null;
  vat7InputBox?: string | null;
  scheduleType?: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type TaxCategoryRecord = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  scope: "CUSTOMER" | "VENDOR" | "BOTH";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TaxTemplateLineRecord = {
  id: string;
  templateId: string;
  taxCodeId: string;
  sortOrder: number;
  appliesTo: "SALES" | "PURCHASE" | "BOTH";
  isDefault: boolean;
  taxCode?: TaxCodeRecord;
};

export type TaxTemplateRecord = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lines?: TaxTemplateLineRecord[];
};

export type TaxRuleRecord = {
  id: string;
  companyId: string;
  name: string;
  appliesTo: "SALES" | "PURCHASE" | "BOTH";
  priority: number;
  taxCategoryId?: string | null;
  templateId: string;
  currency?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  taxCategory?: { id: string; code: string; name: string } | null;
  template?: { id: string; code: string; name: string } | null;
};

export type SalesInvoiceLineRecord = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string | null;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
};

export type SalesInvoiceRecord = {
  id: string;
  companyId: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  status: "DRAFT" | "ISSUED" | "PAID" | "VOIDED";
  currency: string;
  subTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  creditTotal: number;
  writeOffTotal: number;
  balance?: number;
  fiscalStatus?: string | null;
  notes?: string | null;
  customer: { id: string; name: string };
  lines: SalesInvoiceLineRecord[];
  fiscalReceipt?: { id: string; status: string; fiscalNumber?: string | null } | null;
  /** Set when this invoice was raised from a quotation, usually a CRM one. */
  quotationId?: string | null;
  fromQuotation?: { id: string; quotationNumber: string } | null;
};

export type SalesReceiptRecord = {
  id: string;
  companyId: string;
  invoiceId?: string | null;
  receiptNumber: string;
  receivedAt: string;
  amount: number;
  method: string;
  reference?: string | null;
  bankAccountId?: string | null;
  invoice?: {
    invoiceNumber: string;
    customer?: { name: string } | null;
  } | null;
};

export type CreditNoteLineRecord = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string | null;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
};

export type CreditNoteRecord = {
  id: string;
  companyId: string;
  invoiceId: string;
  noteNumber: string;
  noteDate: string;
  status: "DRAFT" | "ISSUED" | "VOIDED";
  currency: string;
  subTotal: number;
  taxTotal: number;
  total: number;
  reason?: string | null;
  invoice?: { invoiceNumber?: string | null; customer?: { name?: string | null } | null } | null;
  lines?: CreditNoteLineRecord[];
};

export type SalesWriteOffRecord = {
  id: string;
  companyId: string;
  invoiceId: string;
  amount: number;
  reason?: string | null;
  status: "POSTED" | "VOIDED";
  createdAt: string;
  invoice?: { invoiceNumber?: string | null; customer?: { name?: string | null } | null } | null;
};

export type PurchaseBillLineRecord = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string | null;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
};

export type PurchaseBillRecord = {
  id: string;
  companyId: string;
  vendorId: string;
  billNumber: string;
  billDate: string;
  dueDate?: string | null;
  status: "DRAFT" | "RECEIVED" | "PAID" | "VOIDED";
  currency: string;
  subTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  debitNoteTotal: number;
  writeOffTotal: number;
  balance?: number;
  notes?: string | null;
  vendor: { id: string; name: string };
  lines: PurchaseBillLineRecord[];
};

export type PurchasePaymentRecord = {
  id: string;
  companyId: string;
  billId?: string | null;
  paymentNumber: string;
  paidAt: string;
  amount: number;
  method: string;
  reference?: string | null;
  bankAccountId?: string | null;
  bill?: {
    billNumber: string;
    vendor?: { name: string } | null;
  } | null;
};

export type PurchaseWriteOffRecord = {
  id: string;
  companyId: string;
  billId: string;
  amount: number;
  reason?: string | null;
  status: "POSTED" | "VOIDED";
  createdAt: string;
  bill?: { billNumber?: string | null; vendor?: { name?: string | null } | null } | null;
};

export type BankAccountRecord = {
  id: string;
  companyId: string;
  name: string;
  bankName?: string | null;
  accountNumber?: string | null;
  currency: string;
  openingBalance: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type BankTransactionRecord = {
  id: string;
  companyId: string;
  bankAccountId: string;
  txnDate: string;
  description: string;
  reference?: string | null;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  sourceType: string;
  sourceId?: string | null;
  reconciliationId?: string | null;
  reconciledAt?: string | null;
  bankAccount?: { name: string; currency: string } | null;
};

export type BankReconciliationRecord = {
  id: string;
  companyId: string;
  bankAccountId: string;
  startDate: string;
  endDate: string;
  statementBalance: number;
  status: "OPEN" | "CLOSED" | "VOIDED";
  createdAt: string;
  bankAccount?: { id: string; name: string; currency: string } | null;
};

export type CostCenterRecord = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  isActive: boolean;
};

export type CurrencyRateRecord = {
  id: string;
  companyId: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  effectiveDate: string;
};

export type FiscalReceiptRecord = {
  id: string;
  companyId: string;
  invoiceId?: string | null;
  receiptNumber?: string | null;
  fiscalNumber?: string | null;
  status: "PENDING" | "SUCCESS" | "FAILED" | "VOIDED";
  issuedAt?: string | null;
  qrCodeData?: string | null;
  signature?: string | null;
  providerKey?: string | null;
  providerReference?: string | null;
  requestIdempotencyKey?: string | null;
  rawResponseJson?: string | null;
  attemptCount?: number;
  nextRetryAt?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  invoice?: { invoiceNumber?: string | null } | null;
};

export type AccountingSettingsRecord = {
  companyId: string;
  legalName?: string | null;
  tradingName?: string | null;
  vatNumber?: string | null;
  taxNumber?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  freezeBeforeDate?: string | null;
  retainedEarningsAccountId?: string | null;
};

export type FiscalisationProviderRecord = {
  id: string;
  companyId: string;
  providerKey: string;
  apiBaseUrl?: string | null;
  username?: string | null;
  password?: string | null;
  apiToken?: string | null;
  authType?: string | null;
  deviceId?: string | null;
  timeoutMs?: number | null;
  retryPolicyJson?: string | null;
  certificateRef?: string | null;
  webhookSecretRef?: string | null;
  metadataJson?: string | null;
  isActive: boolean;
};

export type FiscalisationConfigResponse = {
  provider: FiscalisationProviderRecord | null;
  settings: AccountingSettingsRecord | null;
};

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  nodeType?: "GROUP" | "LEDGER";
  parentAccountId?: string | null;
  level?: number;
  category?: string | null;
  openingDebit: number;
  openingCredit: number;
  debit: number;
  credit: number;
  balance: number;
  closingDebit: number;
  closingCredit: number;
  total: number;
};

export type GeneralLedgerRow = {
  id: string;
  debit: number;
  credit: number;
  memo?: string | null;
  createdAt: string;
  account: {
    id: string;
    code: string;
    name: string;
    type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  };
  entry: {
    id: string;
    entryNumber: number;
    entryDate: string;
    description: string;
    sourceType: string;
    sourceId?: string | null;
  };
};

export type TrialBalanceReport = {
  rows: TrialBalanceRow[];
  totals: {
    openingDebit: number;
    openingCredit: number;
    debit: number;
    credit: number;
    closingDebit: number;
    closingCredit: number;
    total: number;
  };
};

export type FinancialStatementsReport = {
  trialBalance: TrialBalanceReport;
  profitAndLoss: {
    income: TrialBalanceRow[];
    expenses: TrialBalanceRow[];
    totals: { income: number; expenses: number; netIncome: number };
  };
  balanceSheet: {
    assets: TrialBalanceRow[];
    liabilities: TrialBalanceRow[];
    equity: TrialBalanceRow[];
    totals: { assets: number; liabilities: number; equity: number };
  };
};

export type VatSummaryRow = {
  taxCodeId: string;
  code: string;
  name: string;
  rate: number;
  outputTax: number;
  inputTax: number;
  netTax: number;
};

export type VatSummaryReport = {
  startDate: string | null;
  endDate: string | null;
  rows: VatSummaryRow[];
  totals: { outputTax: number; inputTax: number; netTax: number };
  vat7Boxes?: Record<string, number> | null;
  schedules?: Record<string, unknown> | null;
};

export type VatReturnLineRecord = {
  id: string;
  vatReturnId: string;
  taxCodeId?: string | null;
  code: string;
  name: string;
  rate: number;
  taxableAmount: number;
  outputTax: number;
  inputTax: number;
  adjustments: number;
  netTax: number;
};

export type VatReturnRecord = {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  status: "DRAFT" | "REVIEWED" | "FINALIZED" | "FILED" | "VOIDED";
  filingCategory?: string | null;
  returnDueDate?: string | null;
  paymentDueDate?: string | null;
  outputTax: number;
  inputTax: number;
  adjustmentsTax: number;
  netTax: number;
  vat7BoxesJson?: string | null;
  schedulesJson?: string | null;
  vat7Boxes?: Record<string, number> | null;
  schedules?: Record<string, unknown> | null;
  referenceNumber?: string | null;
  notes?: string | null;
  preparedById?: string | null;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  finalizedById?: string | null;
  finalizedAt?: string | null;
  filedById?: string | null;
  filedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: VatReturnLineRecord[];
};

export type PaymentLedgerRecord = {
  id: string;
  companyId: string;
  sourceType: string;
  sourceId: string;
  entryDate: string;
  accountType: "RECEIVABLE" | "PAYABLE";
  partyType: "CUSTOMER" | "VENDOR";
  partyId?: string | null;
  invoiceId?: string | null;
  billId?: string | null;
  amount: number;
  debit: number;
  credit: number;
  currency: string;
  description?: string | null;
  journalEntryId?: string | null;
  status: "POSTED" | "VOIDED";
  createdAt: string;
  updatedAt: string;
};

export type AccountingHubMeta = {
  startDate: string | null;
  endDate: string | null;
  branchId: string | null;
  branchMode: "company-wide";
};

export type ReceivablesHubSummary = {
  kpis: {
    openBalance: number;
    overdueBalance: number;
    issuedInvoiceCount: number;
    issuedInvoiceValue: number;
    collectedAmount: number;
    creditNoteAmount: number;
  };
  charts: {
    aging: Array<{ bucket: string; amount: number }>;
    statusBreakdown: Array<{ status: string; count: number }>;
    collectionsTrend: Array<{ date: string; invoiced: number; collected: number }>;
  };
  meta: AccountingHubMeta;
};

export type PayablesHubSummary = {
  kpis: {
    openBalance: number;
    overdueBalance: number;
    receivedBillCount: number;
    receivedBillValue: number;
    paidAmount: number;
    debitNoteAmount: number;
  };
  charts: {
    aging: Array<{ bucket: string; amount: number }>;
    statusBreakdown: Array<{ status: string; count: number }>;
    paymentsTrend: Array<{ date: string; billed: number; paid: number }>;
  };
  meta: AccountingHubMeta;
};

export type FinancialReportsHubSummary = {
  kpis: {
    income: number;
    expenses: number;
    netIncome: number;
    assets: number;
    liabilities: number;
    equity: number;
    netCash: number;
    totalDebit: number;
    totalCredit: number;
  };
  charts: {
    pnlBreakdown: Array<{ label: string; amount: number }>;
    balanceComposition: Array<{ label: string; amount: number }>;
    cashFlowComposition: Array<{ label: string; amount: number }>;
    accountTypeBreakdown: Array<{ type: string; amount: number }>;
  };
  meta: AccountingHubMeta;
};

export async function fetchAccountingSummary() {
  return fetchJson<AccountingSummary>("/api/accounting/summary");
}

export async function fetchChartOfAccounts(
  params: {
    search?: string;
    type?: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
    nodeType?: "GROUP" | "LEDGER";
    parentAccountId?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<ChartOfAccountRecord>>(`/api/accounting/coa${query}`);
}

export async function fetchJournalEntries(
  params: {
    status?: "DRAFT" | "POSTED";
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<JournalEntryRecord>>(`/api/accounting/journals${query}`);
}

export async function fetchAccountingPeriods(
  params: { status?: "OPEN" | "CLOSED"; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<AccountingPeriodRecord>>(`/api/accounting/periods${query}`);
}

export async function fetchPostingRules() {
  return fetchJson<PostingRuleRecord[]>("/api/accounting/posting-rules");
}

export async function fetchAccountingReadiness(): Promise<AccountingSetupReadiness> {
  return fetchJson<AccountingSetupReadiness>("/api/accounting/setup/readiness");
}

export async function previewPostingRule(context: {
  sourceType: string;
  sourceId?: string | null;
  sourceSubtype?: string | null;
  siteId?: string | null;
  registerCode?: string | null;
  description?: string;
  amount: number;
  netAmount?: number | null;
  taxAmount?: number | null;
  grossAmount?: number | null;
  deductionsAmount?: number | null;
  allowancesAmount?: number | null;
  currency?: string | null;
  invertDirection?: boolean;
  payload?: Record<string, unknown>;
  payments?: Array<{
    tenderType: string;
    amount: number;
    reference?: string | null;
    currency?: string | null;
  }>;
  inventory?: {
    lines: Array<{
      inventoryItemId?: string;
      itemName?: string;
      quantity: number;
      unitCost: number;
      totalCost?: number;
    }>;
    totalCost?: number;
  };
}): Promise<PostingSimulationResult> {
  return fetchJson<PostingSimulationResult>("/api/accounting/posting-rules/preview", {
    method: "POST",
    body: JSON.stringify(context),
  });
}

export async function fetchCurrencyDefinitions(): Promise<
  CurrencyDefinitionRecord[]
> {
  return fetchJson("/api/accounting/currency-definitions");
}

export async function fetchTaxCodes() {
  return fetchJson<TaxCodeRecord[]>("/api/accounting/tax");
}

export async function fetchTaxTemplates() {
  return fetchJson<TaxTemplateRecord[]>("/api/accounting/tax/templates");
}

export async function fetchTaxRules() {
  return fetchJson<TaxRuleRecord[]>("/api/accounting/tax/rules");
}

export async function fetchSalesInvoices(
  params: { status?: string; customerId?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<SalesInvoiceRecord>>(`/api/accounting/sales/invoices${query}`);
}

export async function fetchSalesReceipts(
  params: { invoiceId?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<SalesReceiptRecord>>(`/api/accounting/sales/receipts${query}`);
}

export async function fetchCreditNotes(
  params: { invoiceId?: string; status?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<CreditNoteRecord>>(`/api/accounting/sales/credit-notes${query}`);
}

export async function fetchSalesWriteOffs(
  params: { invoiceId?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<SalesWriteOffRecord>>(`/api/accounting/sales/write-offs${query}`);
}

export async function fetchPurchaseBills(
  params: { status?: string; vendorId?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<PurchaseBillRecord>>(`/api/accounting/purchases/bills${query}`);
}

export async function fetchPurchasePayments(
  params: { billId?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<PurchasePaymentRecord>>(`/api/accounting/purchases/payments${query}`);
}

export async function fetchPurchaseWriteOffs(
  params: { billId?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<PurchaseWriteOffRecord>>(`/api/accounting/purchases/write-offs${query}`);
}

export async function fetchBankAccounts(
  params: { active?: boolean; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<BankAccountRecord>>(`/api/accounting/banking/accounts${query}`);
}

export async function fetchBankTransactions(
  params: { bankAccountId?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<BankTransactionRecord>>(
    `/api/accounting/banking/transactions${query}`,
  );
}

export async function fetchBankReconciliations(
  params: { bankAccountId?: string; status?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<BankReconciliationRecord>>(
    `/api/accounting/banking/reconciliations${query}`,
  );
}

export async function fetchCostCenters(
  params: { active?: boolean; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<CostCenterRecord>>(`/api/accounting/cost-centers${query}`);
}

export async function fetchCurrencyRates(
  params: { baseCurrency?: string; quoteCurrency?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<CurrencyRateRecord>>(`/api/accounting/currency${query}`);
}

export async function fetchFiscalReceipts(
  params: { status?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<FiscalReceiptRecord>>(
    `/api/accounting/fiscalisation/receipts${query}`,
  );
}

export async function fetchFiscalisationConfig() {
  return fetchJson<FiscalisationConfigResponse>(
    "/api/accounting/fiscalisation/config",
  );
}

export async function fetchTrialBalance(params: {
  periodId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const query = buildQuery(params);
  return fetchJson<TrialBalanceReport>(`/api/accounting/reports/trial-balance${query}`);
}

export async function fetchFinancialStatements(params: {
  periodId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const query = buildQuery(params);
  return fetchJson<FinancialStatementsReport>(`/api/accounting/reports/financials${query}`);
}

export async function fetchGeneralLedger(params: {
  periodId?: string;
  startDate?: string;
  endDate?: string;
  accountId?: string;
  page?: number;
  limit?: number;
}) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GeneralLedgerRow>>(`/api/accounting/reports/general-ledger${query}`);
}

export async function fetchReceivablesHubSummary(params: {
  startDate?: string;
  endDate?: string;
  branchId?: string;
} = {}) {
  const query = buildQuery(params);
  return fetchJson<ReceivablesHubSummary>(`/api/accounting/hubs/receivables-summary${query}`);
}

export async function fetchPayablesHubSummary(params: {
  startDate?: string;
  endDate?: string;
  branchId?: string;
} = {}) {
  const query = buildQuery(params);
  return fetchJson<PayablesHubSummary>(`/api/accounting/hubs/payables-summary${query}`);
}

export async function fetchFinancialReportsHubSummary(params: {
  startDate?: string;
  endDate?: string;
  branchId?: string;
} = {}) {
  const query = buildQuery(params);
  return fetchJson<FinancialReportsHubSummary>(`/api/accounting/hubs/financial-reports-summary${query}`);
}

export async function fetchArAging(params: { asOf?: string } = {}) {
  const query = buildQuery(params);
  return fetchJson<{ asOf: string; rows: AgingRow[] }>(`/api/accounting/reports/ar-aging${query}`);
}

export async function fetchApAging(params: { asOf?: string } = {}) {
  const query = buildQuery(params);
  return fetchJson<{ asOf: string; rows: AgingRow[] }>(`/api/accounting/reports/ap-aging${query}`);
}

export async function fetchVatSummary(params: {
  periodId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const query = buildQuery(params);
  return fetchJson<VatSummaryReport>(`/api/accounting/reports/vat-summary${query}`);
}

export async function fetchVatReturns(
  params: {
    status?: "DRAFT" | "REVIEWED" | "FINALIZED" | "FILED" | "VOIDED";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<VatReturnRecord>>(`/api/accounting/vat-returns${query}`);
}

export async function createVatReturnDraft(input: {
  periodId?: string;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
  adjustmentsTax?: number;
  filingCategory?: string;
}) {
  return fetchJson<VatReturnRecord>("/api/accounting/vat-returns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function reviewVatReturn(vatReturnId: string) {
  return fetchJson<VatReturnRecord>(`/api/accounting/vat-returns/${vatReturnId}/review`, {
    method: "POST",
  });
}

export async function finalizeVatReturn(vatReturnId: string) {
  return fetchJson<VatReturnRecord>(`/api/accounting/vat-returns/${vatReturnId}/finalize`, {
    method: "POST",
  });
}

export async function fileVatReturn(vatReturnId: string, input?: { referenceNumber?: string; notes?: string }) {
  return fetchJson<VatReturnRecord>(`/api/accounting/vat-returns/${vatReturnId}/file`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function refreshVatReturn(
  vatReturnId: string,
  input?: { notes?: string; adjustmentsTax?: number },
) {
  return fetchJson<VatReturnRecord>(`/api/accounting/vat-returns/${vatReturnId}`, {
    method: "PATCH",
    body: JSON.stringify(input ?? {}),
  });
}

export async function fetchPaymentLedger(
  params: {
    accountType?: "RECEIVABLE" | "PAYABLE";
    partyType?: "CUSTOMER" | "VENDOR";
    partyId?: string;
    status?: "POSTED" | "VOIDED";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<PaymentLedgerRecord>>(`/api/accounting/payment-ledger${query}`);
}

export async function setAccountingFreezeDate(freezeBeforeDate: string | null) {
  return fetchJson("/api/accounting/closing/freeze", {
    method: "POST",
    body: JSON.stringify({ freezeBeforeDate }),
  });
}

export async function closeAccountingPeriod(input: {
  periodId: string;
  retainedEarningsAccountId?: string;
  closingDate?: string;
  notes?: string;
}) {
  return fetchJson("/api/accounting/closing/period-close", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function reopenAccountingPeriod(input: {
  periodId: string;
  reason: string;
  reopenedAt?: string;
}) {
  return fetchJson("/api/accounting/closing/period-reopen", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type AgingRow = {
  id: string;
  name: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days90Plus: number;
  total: number;
};

export async function fetchTaxCategories() {
  return fetchJson<TaxCategoryRecord[]>("/api/accounting/tax/categories");
}

export type RetailAccountingBackfillResult =
  | {
      mode: "DRY_RUN";
      discovered: number;
      candidates: Array<{
        key: string;
        label: string;
        entryDate: string;
      }>;
    }
  | {
      mode: "APPLY";
      discovered: number;
      posted: number;
      skipped: number;
      failed: number;
      failures: Array<{
        key: string;
        error: string;
      }>;
    };

export type CustomerRecord = {
  id: string;
  companyId: string;
  taxCategoryId?: string | null;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  vatNumber?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type VendorRecord = {
  id: string;
  companyId: string;
  taxCategoryId?: string | null;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  vatNumber?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type DebitNoteLineRecord = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxCodeId?: string | null;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
};

export type DebitNoteRecord = {
  id: string;
  companyId: string;
  billId: string;
  noteNumber: string;
  noteDate: string;
  status: "DRAFT" | "ISSUED" | "VOIDED";
  currency: string;
  subTotal: number;
  taxTotal: number;
  total: number;
  reason?: string | null;
  bill?: { billNumber?: string | null; vendor?: { name?: string | null } | null } | null;
  lines?: DebitNoteLineRecord[];
};

export type CashFlowReport = {
  operating: TrialBalanceRow[];
  investing: TrialBalanceRow[];
  financing: TrialBalanceRow[];
  totals: {
    operating: number;
    investing: number;
    financing: number;
    netCash: number;
  };
};

export type StatementLineRecord = {
  date: string;
  type: string;
  reference: string;
  description?: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export type StatementReport = {
  openingBalance: number;
  closingBalance: number;
  lines: StatementLineRecord[];
};

export async function runSeedPack(params: {
  mode: "DRY_RUN" | "APPLY";
  fxRates?: Record<string, number | string>;
}): Promise<AccountingSeedPackResult> {
  return fetchJson<AccountingSeedPackResult>("/api/accounting/setup/seed-pack", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function fetchIntegrationEvents(params?: {
  status?: string;
  limit?: number;
  page?: number;
}): Promise<AccountingIntegrationEventListResponse> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.page) qs.set("page", String(params.page));
  const query = qs.toString();
  return fetchJson<AccountingIntegrationEventListResponse>(
    `/api/accounting/integration/events${query ? `?${query}` : ""}`,
  );
}

export async function replayIntegrationEvents(params?: {
  limit?: number;
  periodOverrideReason?: string;
}): Promise<{
  processed: number;
  posted: number;
  skipped: number;
  failed: number;
}> {
  return fetchJson("/api/accounting/integration/replay", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
}

export async function backfillRetailAccounting(params: {
  dryRun?: boolean;
  limit?: number;
  periodOverrideReason?: string;
}): Promise<RetailAccountingBackfillResult> {
  return fetchJson<RetailAccountingBackfillResult>("/api/accounting/integration/backfill-retail", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function fetchTenderMappings(): Promise<
  TenderAccountMappingRecord[]
> {
  return fetchJson<TenderAccountMappingRecord[]>("/api/accounting/tender-mappings");
}

export async function fetchCustomers(
  params: { search?: string; active?: boolean; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<CustomerRecord>>(`/api/accounting/sales/customers${query}`);
}

export async function fetchVendors(
  params: { search?: string; active?: boolean; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<VendorRecord>>(`/api/accounting/purchases/vendors${query}`);
}

export async function fetchDebitNotes(
  params: { billId?: string; status?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<DebitNoteRecord>>(`/api/accounting/purchases/debit-notes${query}`);
}

export async function fetchCashFlowReport(params: {
  periodId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const query = buildQuery(params);
  return fetchJson<CashFlowReport>(`/api/accounting/reports/cash-flow${query}`);
}

export async function fetchCustomerStatement(params: {
  customerId: string;
  startDate?: string;
  endDate?: string;
}) {
  const query = buildQuery(params);
  return fetchJson<StatementReport>(`/api/accounting/reports/customer-statement${query}`);
}

export async function fetchVendorStatement(params: {
  vendorId: string;
  startDate?: string;
  endDate?: string;
}) {
  const query = buildQuery(params);
  return fetchJson<StatementReport>(`/api/accounting/reports/vendor-statement${query}`);
}

export async function importOpeningBalances(input: {
  effectiveDate: string;
  sourceReference?: string;
  notes?: string;
  lines: Array<{
    accountId: string;
    debit?: number;
    credit?: number;
    memo?: string;
    costCenterId?: string;
  }>;
}) {
  return fetchJson("/api/accounting/closing/opening-balances", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
