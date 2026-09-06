import { buildQuery, fetchJson, type Pagination, type PaginationMeta } from "@corelithzw/platform/api-client";

export type { Pagination, PaginationMeta } from "@corelithzw/platform/api-client";
export {
  fetchTaxCategories,
  type AgingRow,
} from "@corelithzw/module-books/api-client";
export {
  closeAccountingPeriod,
  createVatReturnDraft,
  fetchAccountingPeriods,
  fetchAccountingReadiness,
  fetchAccountingSummary,
  fetchApAging,
  fetchArAging,
  fetchBankAccounts,
  fetchBankReconciliations,
  fetchBankTransactions,
  fetchChartOfAccounts,
  fetchCostCenters,
  fetchCreditNotes,
  fetchCurrencyDefinitions,
  fetchCurrencyRates,
  fetchFinancialReportsHubSummary,
  fetchFinancialStatements,
  fetchFiscalReceipts,
  fetchFiscalisationConfig,
  fetchGeneralLedger,
  fetchJournalEntries,
  fetchPayablesHubSummary,
  fetchPaymentLedger,
  fetchPostingRules,
  fetchPurchaseBills,
  fetchPurchasePayments,
  fetchPurchaseWriteOffs,
  fetchReceivablesHubSummary,
  fetchSalesInvoices,
  fetchSalesReceipts,
  fetchSalesWriteOffs,
  fetchTaxCodes,
  fetchTaxRules,
  fetchTaxTemplates,
  fetchTrialBalance,
  fetchVatReturns,
  fetchVatSummary,
  fileVatReturn,
  finalizeVatReturn,
  previewPostingRule,
  refreshVatReturn,
  reopenAccountingPeriod,
  reviewVatReturn,
  setAccountingFreezeDate,
  type AccountingHubMeta,
  type AccountingIntegrationEventListResponse,
  type AccountingIntegrationEventRecord,
  type AccountingPeriodRecord,
  type AccountingReadinessCheck,
  type AccountingSeedExecutionRecord,
  type AccountingSeedPackResult,
  type AccountingSettingsRecord,
  type AccountingSetupReadiness,
  type AccountingSummary,
  type BankAccountRecord,
  type BankReconciliationRecord,
  type BankTransactionRecord,
  type ChartOfAccountRecord,
  type CostCenterRecord,
  type CreditNoteLineRecord,
  type CreditNoteRecord,
  type CurrencyDefinitionRecord,
  type CurrencyRateRecord,
  type FinancialReportsHubSummary,
  type FinancialStatementsReport,
  type FiscalReceiptRecord,
  type FiscalisationConfigResponse,
  type FiscalisationProviderRecord,
  type GeneralLedgerRow,
  type JournalEntryRecord,
  type JournalLineRecord,
  type PayablesHubSummary,
  type PaymentLedgerRecord,
  type PostingRuleConditionRecord,
  type PostingRuleLineRecord,
  type PostingRuleRecord,
  type PostingSimulationLine,
  type PostingSimulationResult,
  type PurchaseBillLineRecord,
  type PurchaseBillRecord,
  type PurchasePaymentRecord,
  type PurchaseWriteOffRecord,
  type ReceivablesHubSummary,
  type SalesInvoiceLineRecord,
  type SalesInvoiceRecord,
  type SalesReceiptRecord,
  type SalesWriteOffRecord,
  type TaxCategoryRecord,
  type TaxCodeRecord,
  type TaxRuleRecord,
  type TaxTemplateLineRecord,
  type TaxTemplateRecord,
  type TenderAccountMappingRecord,
  type TrialBalanceReport,
  type TrialBalanceRow,
  type VatReturnLineRecord,
  type VatReturnRecord,
  type VatSummaryReport,
  type VatSummaryRow,
} from "@corelithzw/module-books/api-client";
import { type AccountingIntegrationEventListResponse, type AccountingSeedPackResult, type TaxCategoryRecord, type TenderAccountMappingRecord, type TrialBalanceRow } from "@corelithzw/module-books/api-client";
export {
  reserveEntityId,
  type ReserveIdEntity,
} from "@corelithzw/platform/client/ids";
export {
  fetchSites,
  type Site,
} from "@corelithzw/platform/client/sites";
import { type Site } from "@corelithzw/platform/client/sites";
export {
  archiveNotifications,
  fetchNotificationPreferences,
  fetchNotifications,
  markNotificationsRead,
  updateNotificationPreferences,
  type NotificationAction,
  type NotificationEntityType,
  type NotificationListItem,
  type NotificationListResponse,
  type NotificationSeverity,
  type NotificationType,
  type UserNotificationPreferences,
} from "@corelithzw/module-notifications/api-client";
import type { EmployeePositionValue } from "@corelithzw/platform/vertical-defaults";
import type { UserRole } from "@corelithzw/platform/roles";

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ManagedUserRole = UserRole;

export type CreateManagedUserInput = {
  name: string;
  email: string;
  password: string;
  role: ManagedUserRole;
};

export type SetManagedUserStatusInput = {
  userId: string;
  isActive: boolean;
};

export type ResetManagedUserPasswordInput = {
  userId: string;
  newPassword: string;
};

export type ChangeManagedUserRoleInput = {
  userId: string;
  role: ManagedUserRole;
};

/**
 * Which business an employee is assigned to.
 *
 * Mirrors `EmployeeModule` in the Prisma schema, minus the aliases the API
 * normalises away on the way in (`THRIFT` is stored as `RETAIL`). A school's
 * non-teaching staff — the bursar, the nurse, the groundsman — are employees
 * carrying the `SCHOOLS` assignment, which is how one payroll serves a tenant
 * running a mine and a school at once.
 */
export type EmployeeModuleValue =
  | "HR"
  | "GOLD"
  | "SCRAP_METAL"
  | "CAR_SALES"
  | "RETAIL"
  | "SCHOOLS";

export type EmployeeSummary = {
  id: string;
  employeeId: string;
  userId?: string | null;
  name: string;
  phone: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  passportPhotoUrl: string;
  nationalIdNumber?: string | null;
  nationalIdDocumentUrl?: string | null;
  villageOfOrigin: string;
  jobTitle?: string | null;
  position: EmployeePositionValue;
  departmentId?: string | null;
  gradeId?: string | null;
  supervisorId?: string | null;
  employmentType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "CASUAL";
  hireDate?: string | null;
  terminationDate?: string | null;
  defaultCurrency?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
  } | null;
  moduleAssignments?: Array<{
    id: string;
    module: EmployeeModuleValue;
    accessRole?: string | null;
    requiresUserAccess: boolean;
    isPrimary: boolean;
    isActive: boolean;
  }>;
  department?: { id: string; code: string; name: string } | null;
  grade?: { id: string; code: string; name: string; rank: number } | null;
  supervisor?: { id: string; employeeId: string; name: string } | null;
  isActive: boolean;
  salaryOwed: number;
};

export type ShiftGroupRecord = {
  id: string;
  companyId: string;
  /// Null for a company-wide crew.
  siteId: string | null;
  name: string;
  code?: string | null;
  leaderEmployeeId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  site?: { id: string; name: string; code: string } | null;
  leader?: { id: string; name: string; employeeId: string } | null;
  _count?: { members: number; schedules: number };
};

export type ShiftGroupMemberRecord = {
  id: string;
  shiftGroupId: string;
  employeeId: string;
  isActive: boolean;
  joinedAt: string;
  leftAt?: string | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    name: string;
    employeeId: string;
    phone?: string;
    isActive?: boolean;
  };
};

export type ShiftGroupScheduleRecord = {
  id: string;
  companyId: string;
  siteId: string;
  date: string;
  shift: string;
  shiftGroupId: string;
  notes?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  site?: { id: string; name: string; code: string } | null;
  shiftGroup?: {
    id: string;
    name: string;
    code?: string | null;
    leader?: { id: string; name: string; employeeId: string } | null;
  } | null;
  createdBy?: { id: string; name: string } | null;
};

export type DepartmentRecord = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { employees: number };
};

export type JobGradeRecord = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  rank: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { employees: number };
};

export type CompensationProfileRecord = {
  id: string;
  employeeId: string;
  baseAmount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: "ACTIVE" | "INACTIVE";
  workflowStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  notes?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    employeeId: string;
    name: string;
    department?: { code: string; name: string } | null;
    grade?: { code: string; name: string } | null;
  };
  createdBy?: { id: string; name: string } | null;
  submittedBy?: { id: string; name: string } | null;
  approvedBy?: { id: string; name: string } | null;
};

export type CompensationRuleRecord = {
  id: string;
  companyId: string;
  name: string;
  type: "ALLOWANCE" | "DEDUCTION";
  calcMethod: "FIXED" | "PERCENT";
  value: number;
  cap?: number | null;
  taxable: boolean;
  currency: string;
  isActive: boolean;
  workflowStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  employeeId?: string | null;
  departmentId?: string | null;
  gradeId?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: { id: string; employeeId: string; name: string } | null;
  department?: { id: string; code: string; name: string } | null;
  grade?: { id: string; code: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  submittedBy?: { id: string; name: string } | null;
  approvedBy?: { id: string; name: string } | null;
};

export type CompensationTemplateRecord = {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
  employmentType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "CASUAL" | null;
  position?:
    | EmployeePositionValue
    | null;
  baseAmount: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string } | null;
  rules: Array<{
    id: string;
    templateId: string;
    compensationRuleId: string;
    sortOrder: number;
    compensationRule: {
      id: string;
      name: string;
      type: "ALLOWANCE" | "DEDUCTION";
      calcMethod: "FIXED" | "PERCENT";
      value: number;
      cap?: number | null;
      taxable: boolean;
      currency: string;
      isActive: boolean;
      workflowStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
    };
  }>;
  _count?: { rules: number };
};

export type PeriodPurpose = "STANDARD" | "CONTRACTOR" | "EDGE_CASE";

export type PayrollConfigRecord = {
  id: string;
  name: string;
  payrollCycle: "MONTHLY" | "FORTNIGHTLY";
  goldPayoutCycle: "MONTHLY" | "FORTNIGHTLY";
  goldSettlementMode: "CURRENT_PERIOD" | "NEXT_PERIOD";
  cashDisbursementOnly: boolean;
  autoGeneratePayrollPeriods: boolean;
  autoGenerateGoldPayoutPeriods: boolean;
  periodGenerationHorizon: number;
};

export type PayrollPeriodRecord = {
  id: string;
  companyId: string;
  payoutSource?: "GOLD" | "SCRAP" | "COMMISSION" | "OTHER" | null;
  scopeKey: string;
  periodKey: string;
  cycle: "MONTHLY" | "FORTNIGHTLY";
  startDate: string;
  endDate: string;
  dueDate: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "CLOSED";
  isAutoGenerated: boolean;
  periodPurpose: PeriodPurpose;
  appliesToContractorsOnly: boolean;
  employeeScopeJson?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string } | null;
  approvedBy?: { id: string; name: string } | null;
  _count?: { runs: number };
  runs?: Array<{
    id: string;
    runNumber: number;
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "REJECTED";
    netTotal: number;
    createdAt: string;
  }>;
};

export type PayrollRunRecord = {
  id: string;
  companyId: string;
  periodId: string;
  payoutSource?: "GOLD" | "SCRAP" | "COMMISSION" | "OTHER" | null;
  runNumber: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "REJECTED";
  notes?: string | null;
  grossTotal: number;
  allowancesTotal: number;
  deductionsTotal: number;
  netTotal: number;
  goldRatePerUnit?: number | null;
  goldRateUnit: string;
  goldSettlementMode: "CURRENT_PERIOD" | "NEXT_PERIOD";
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  period: {
    id: string;
    periodKey: string;
    startDate: string;
    endDate: string;
    dueDate: string;
  };
  _count?: { lineItems: number };
  createdBy?: { id: string; name: string } | null;
  submittedBy?: { id: string; name: string } | null;
  approvedBy?: { id: string; name: string } | null;
};

export type DisbursementBatchRecord = {
  id: string;
  companyId: string;
  payrollRunId: string;
  code: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";
  method: "CASH";
  notes?: string | null;
  cashCustodian?: string | null;
  cashIssuedAt?: string | null;
  totalAmount: number;
  itemCount: number;
  submittedAt?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
  payrollRun: {
    id: string;
    runNumber: number;
    payoutSource?: "GOLD" | "SCRAP" | "COMMISSION" | "OTHER" | null;
    status?: string;
    goldRatePerUnit?: number | null;
    goldRateUnit?: string;
    period?: { id: string; periodKey: string; startDate: string; endDate: string };
  };
  _count?: { items: number };
  createdBy?: { id: string; name: string } | null;
  approvedBy?: { id: string; name: string } | null;
};

export type ApprovalHistoryRecord = {
  id: string;
  companyId: string;
  /**
   * Mirrors `ApprovalTargetType`, including the retired value.
   *
   * The settlement and leave values were missing, so an approval recorded against
   * either was a row this type said could not exist — the history screen reads
   * every row in the table, whatever wrote it. `IRREGULAR_PAYOUT_BATCH` stays for
   * the opposite reason: nothing writes it any more, and rows from before P-1 are
   * still there to be displayed.
   */
  entityType:
    | "PAYROLL_RUN"
    | "DISBURSEMENT_BATCH"
    | "ADJUSTMENT_ENTRY"
    | "COMPENSATION_PROFILE"
    | "COMPENSATION_RULE"
    | "GOLD_SHIFT_ALLOCATION"
    | "DISCIPLINARY_ACTION"
    | "SETTLEMENT_INTAKE"
    | "SETTLEMENT_RUN"
    | "SETTLEMENT_BATCH"
    | "LEAVE_REQUEST"
    | "IRREGULAR_PAYOUT_BATCH";
  entityId: string;
  action: "CREATE" | "SUBMIT" | "APPROVE" | "REJECT" | "ADJUST";
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  actedAt: string;
  createdAt: string;
  actedBy: { id: string; name: string; role: string };
};

export type EmployeePayment = {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: number;
  unit: string;
  paidAmount?: number | null;
  paidAt?: string | null;
  status: "DUE" | "PARTIAL" | "PAID";
  notes?: string | null;
  payrollRunId?: string | null;
  payrollLineItemId?: string | null;
  disbursementBatchId?: string | null;
  disbursementItemId?: string | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    name: string;
    employeeId: string;
    position: string;
    isActive: boolean;
  };
  createdBy?: { id: string; name: string } | null;
  payrollRun?: {
    id: string;
    runNumber: number;
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "REJECTED";
    period?: { id: string; periodKey: string } | null;
  } | null;
  disbursementBatch?: {
    id: string;
    code: string;
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";
  } | null;
};

export type SectionSummary = {
  id: string;
  name: string;
  siteId: string;
  isActive: boolean;
  _count?: { shiftReports: number };
  site?: { name: string; code: string };
};

export type DowntimeCode = {
  id: string;
  code: string;
  description: string;
  siteId?: string | null;
  sortOrder: number;
  isActive?: boolean;
  site?: { id: string; name: string; code: string } | null;
};

export type Equipment = {
  id: string;
  equipmentCode: string;
  name: string;
  category: string;
  siteId?: string;
  locationId: string;
  numberOfItems: number;
  site: { name: string; code: string };
  location: { id: string; code: string; name: string };
  qrCode?: string | null;
  lastServiceDate?: string | null;
  nextServiceDue?: string | null;
  serviceHours?: number | null;
  serviceDays?: number | null;
  isActive: boolean;
};

export type WorkOrder = {
  id: string;
  issue: string;
  status: string;
  downtimeStart: string;
  downtimeEnd?: string | null;
  workDone?: string | null;
  partsUsed?: string | null;
  partsCost?: number | null;
  laborCost?: number | null;
  createdAt: string;
  technician?: { id: string; name: string; employeeId: string } | null;
  equipment: {
    id: string;
    name: string;
    equipmentCode: string;
    site: { name: string; code: string };
  };
};

export type InventoryItem = {
  id: string;
  itemCode: string;
  name: string;
  category: string;
  siteId?: string;
  locationId?: string;
  unit: string;
  currentStock: number;
  minStock?: number | null;
  maxStock?: number | null;
  unitCost?: number | null;
  location: { name: string };
  site: { name: string; code: string };
};

export type StockLocation = {
  id: string;
  code: string;
  name: string;
  siteId: string;
  isActive: boolean;
  site?: { name: string; code: string };
};

export type StockMovement = {
  id: string;
  referenceId: string;
  movementType: string;
  quantity: number;
  unit: string;
  issuedTo?: string | null;
  requestedBy?: string | null;
  approvedBy?: string | null;
  notes?: string | null;
  createdAt: string;
  item: {
    name: string;
    itemCode: string;
    unit: string;
    site: { name: string; code: string };
    location: { name: string };
  };
  issuedBy?: { name: string } | null;
};

export type AttendanceRecord = {
  id: string;
  date: string;
  shift: string;
  shiftGroupId?: string | null;
  shiftLeaderId?: string | null;
  shiftLeaderName?: string | null;
  status: string;
  overtime?: number | null;
  notes?: string | null;
  /** Null on a tenant with no sites, and on any register kept company-wide. */
  site: { id: string; name: string; code: string } | null;
  shiftGroup?: {
    id: string;
    name: string;
    code?: string | null;
    leader?: { id: string; name: string; employeeId: string } | null;
  } | null;
  employee: { id: string; name: string; employeeId: string };
};

export type ShiftReportSummary = {
  id: string;
  date: string;
  shift: string;
  siteId: string;
  shiftGroupId?: string | null;
  crewCount: number;
  workType: string;
  status: string;
  site: { name: string; code: string };
  shiftGroup?: { id: string; name: string; code?: string | null } | null;
  section?: { name: string } | null;
  groupLeader?: { name: string } | null;
  downtimeEvents?: Array<{
    id: string;
    durationHours: number;
    notes?: string | null;
    downtimeCode: { description: string; code: string };
  }>;
};

export type PlantReportDowntimeEvent = {
  id: string;
  durationHours: number;
  notes?: string | null;
  downtimeCode: { description: string; code: string };
};

export type PlantReport = {
  id: string;
  date: string;
  siteId: string;
  tonnesFed?: number | null;
  tonnesProcessed?: number | null;
  runHours?: number | null;
  dieselUsed?: number | null;
  grindingMedia?: number | null;
  reagentsUsed?: number | null;
  waterUsed?: number | null;
  goldRecovered?: number | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  site: { name: string; code: string };
  reportedBy?: { name: string } | null;
  downtimeEvents?: PlantReportDowntimeEvent[];
};

export type GoldPour = {
  id: string;
  batchId?: string;
  batchCode?: string;
  pourBarId: string;
  pourDate: string;
  sourceType?: "PRODUCTION" | "PURCHASE_PUBLIC";
  createdAt: string;
  grossWeight: number;
  goldPriceUsdPerGram?: number | null;
  valuationDate?: string | null;
  valueUsd?: number | null;
  estimatedPurity?: number | null;
  storageLocation: string;
  shiftLeaderName?: string | null;
  expenseWeightTotal?: number | null;
  workerSplitWeight?: number | null;
  companySplitWeight?: number | null;
  companyTotalWeight?: number | null;
  expenseBreakdown?: string | null;
  createdBy?: { id: string; name: string } | null;
  goldShiftAllocation?: {
    id: string;
    totalWeight: number;
    netWeight: number;
    workerShareWeight: number;
    companyShareWeight: number;
    expenses: Array<{ id: string; type: string; weight: number }>;
    shiftReport?: {
      id: string;
      groupLeader?: { name: string } | null;
    } | null;
  } | null;
  site: { name: string; code: string };
  witness1?: { name: string } | null;
  witness2?: { name: string } | null;
};

export type GoldDispatchBatchEntry = {
  id: string;
  goldPourId: string;
  sortOrder: number;
  batchId?: string;
  batchCode?: string;
  goldPour: {
    id: string;
    batchId?: string;
    batchCode?: string;
    pourBarId: string;
    pourDate: string;
    grossWeight: number;
    goldPriceUsdPerGram?: number | null;
    valueUsd?: number | null;
    site: { name: string; code: string };
  };
};

export type GoldDispatch = {
  id: string;
  batchId?: string;
  batchCode?: string;
  goldPourId: string;
  dispatchDate: string;
  goldPriceUsdPerGram?: number | null;
  valuationDate?: string | null;
  valueUsd?: number | null;
  courier: string;
  vehicle?: string | null;
  destination: string;
  sealNumbers: string;
  handedOverBy?: { name: string } | null;
  receivedBy?: string | null;
  notes?: string | null;
  warnings?: string[];
  goldPour: {
    id?: string;
    batchId?: string;
    batchCode?: string;
    pourBarId: string;
    pourDate: string;
    grossWeight: number;
    goldPriceUsdPerGram?: number | null;
    valueUsd?: number | null;
    site: { name: string; code: string };
  };
  batches?: GoldDispatchBatchEntry[];
};

export type BuyerReceipt = {
  id: string;
  goldDispatchId?: string | null;
  goldPourId?: string | null;
  receiptNumber: string;
  receiptDate: string;
  assayResult?: number | null;
  paidAmount: number;
  goldPriceUsdPerGram?: number | null;
  valuationDate?: string | null;
  paymentMethod: string;
  paymentChannel?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  goldPour: {
    id?: string;
    batchId?: string;
    batchCode?: string;
    createdAt?: string;
    pourBarId: string;
    grossWeight: number;
    goldPriceUsdPerGram?: number | null;
    valueUsd?: number | null;
    pourDate: string;
    shiftLeaderName?: string | null;
    expenseWeightTotal?: number | null;
    workerSplitWeight?: number | null;
    companySplitWeight?: number | null;
    companyTotalWeight?: number | null;
    createdBy?: { id: string; name: string } | null;
    site: { name: string; code: string };
  };
  goldDispatch?: {
    id: string;
    batchId?: string;
    batchCode?: string;
    dispatchDate: string;
    courier: string;
    goldPour: {
      id?: string;
      batchId?: string;
      batchCode?: string;
      createdAt?: string;
      pourBarId: string;
      grossWeight: number;
      goldPriceUsdPerGram?: number | null;
      valueUsd?: number | null;
      pourDate: string;
      shiftLeaderName?: string | null;
      expenseWeightTotal?: number | null;
      workerSplitWeight?: number | null;
      companySplitWeight?: number | null;
      companyTotalWeight?: number | null;
      createdBy?: { id: string; name: string } | null;
      site: { name: string; code: string };
    };
  } | null;
};

export type GoldPurchase = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  sellerType: "EMPLOYEE" | "EXTERNAL";
  sellerName: string;
  sellerPhone: string;
  grossWeight: number;
  estimatedPurity?: number | null;
  storageLocation: string;
  paidAmount: number;
  currency: string;
  paymentMethod: string;
  paymentChannel?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  createdAt: string;
  site: { id: string; name: string; code: string };
  sellerEmployee?: { id: string; name: string; employeeId: string } | null;
  receiver1: { id: string; name: string; employeeId: string };
  receiver2: { id: string; name: string; employeeId: string };
  goldPour: {
    id: string;
    pourBarId: string;
    pourDate: string;
    grossWeight: number;
    goldPriceUsdPerGram?: number | null;
    valueUsd?: number | null;
    site: { name: string; code: string };
  };
};

export type GoldShiftAllocationExpense = {
  id: string;
  type: string;
  weight: number;
};

export type GoldShiftAllocationWorkerShare = {
  id: string;
  shareWeight: number;
  shareValueUsd?: number | null;
  employee: { id: string; name: string; employeeId: string };
};

export type GoldShiftAllocation = {
  id: string;
  date: string;
  shift: string;
  siteId: string;
  totalWeight: number;
  netWeight: number;
  splitMode: "DEFAULT_50_50" | "OVERRIDE_WORKER_WEIGHT";
  workerShareOverrideWeight?: number | null;
  splitOverrideReason?: string | null;
  workerShareWeight: number;
  companyShareWeight: number;
  perWorkerWeight: number;
  goldPriceUsdPerGram?: number | null;
  valuationDate?: string | null;
  totalWeightValueUsd?: number | null;
  netWeightValueUsd?: number | null;
  workerShareValueUsd?: number | null;
  companyShareValueUsd?: number | null;
  perWorkerValueUsd?: number | null;
  payCycleWeeks: number;
  workflowStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdBy?: { id: string; name: string } | null;
  submittedBy?: { id: string; name: string } | null;
  approvedBy?: { id: string; name: string } | null;
  site: { name: string; code: string };
  shiftReport?: { id: string; status: string; crewCount: number } | null;
  expenses: GoldShiftAllocationExpense[];
  workerShares: GoldShiftAllocationWorkerShare[];
  createdBatchId?: string | null;
  createdBatchCode?: string | null;
  payoutRecordsCreated?: number;
  warnings?: string[];
  createdAt: string;
};

export type GoldCorrection = {
  id: string;
  pourId: string;
  entityType: "POUR" | "DISPATCH" | "RECEIPT";
  entityId: string;
  reason: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  createdAt: string;
  createdBy: { id: string; name: string };
  pour: {
    id: string;
    pourBarId: string;
    site: { id: string; name: string; code: string };
  };
};

export type GoldPriceRecord = {
  id: string;
  companyId: string;
  effectiveDate: string;
  priceUsdPerGram: number;
  note?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export type GoldExpenseType = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PermitRecord = {
  id: string;
  permitType: string;
  permitNumber: string;
  siteId: string;
  issueDate: string;
  expiryDate: string;
  responsiblePerson: string;
  documentUrl?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  site: { id: string; name: string; code: string };
};

export type InspectionRecord = {
  id: string;
  siteId: string;
  inspectionDate: string;
  inspectorName: string;
  inspectorOrg: string;
  findings: string;
  actions?: string | null;
  actionsDue?: string | null;
  completedById?: string | null;
  completedAt?: string | null;
  documentUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  site: { id: string; name: string; code: string };
  completedBy?: { id: string; name: string } | null;
};

export type IncidentRecord = {
  id: string;
  siteId: string;
  incidentDate: string;
  incidentType: string;
  severity: string;
  description: string;
  actionsTaken?: string | null;
  reportedBy: string;
  photoUrls?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  site: { id: string; name: string; code: string };
};

export type HrIncidentRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  siteId?: string | null;
  sourceIncidentId?: string | null;
  incidentDate: string;
  category: "MISCONDUCT" | "ATTENDANCE" | "SAFETY_POLICY" | "PERFORMANCE" | "OTHER";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "UNDER_REVIEW" | "CLOSED";
  title: string;
  description: string;
  investigationNotes?: string | null;
  reportedById: string;
  resolvedById?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  employee: { id: string; employeeId: string; name: string };
  site?: { id: string; name: string; code: string } | null;
  sourceIncident?: {
    id: string;
    incidentType: string;
    severity: string;
    status: string;
    incidentDate: string;
    site: { id: string; name: string; code: string };
  } | null;
  reportedBy: { id: string; name: string };
  resolvedBy?: { id: string; name: string } | null;
  _count?: { actions: number };
};

export type DisciplinaryActionRecord = {
  id: string;
  companyId: string;
  incidentId?: string | null;
  employeeId: string;
  actionType: "WARNING" | "PENALTY" | "SUSPENSION" | "TERMINATION" | "OTHER";
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "APPLIED";
  summary: string;
  notes?: string | null;
  effectiveDate?: string | null;
  penaltyAmount: number;
  penaltyCurrency: string;
  penaltyStatus: "NONE" | "PENDING" | "DEDUCTED" | "PAID" | "WAIVED";
  createdById: string;
  submittedById?: string | null;
  approvedById?: string | null;
  appliedById?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  appliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  employee: { id: string; employeeId: string; name: string };
  incident?: {
    id: string;
    title: string;
    category: string;
    severity: string;
    status: string;
    incidentDate: string;
  } | null;
  createdBy: { id: string; name: string };
  submittedBy?: { id: string; name: string } | null;
  approvedBy?: { id: string; name: string } | null;
  appliedBy?: { id: string; name: string } | null;
};

export type TrainingRecordSummary = {
  id: string;
  userId: string;
  trainingType: string;
  trainingDate: string;
  expiryDate?: string | null;
  certificateUrl?: string | null;
  trainedBy?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string };
};

export type DowntimeAnalytics = {
  siteId: string;
  startDate: string;
  endDate: string;
  totalDowntimeHours: number;
  totalIncidents: number;
  topCause: {
    description: string;
    code: string;
    hours: number;
    count: number;
  } | null;
  causes: Array<{
    description: string;
    code: string;
    hours: number;
    count: number;
  }>;
};

export type ExecutiveRange = "7d" | "30d" | "90d";

export type ExecutiveKpiTone = "neutral" | "positive" | "warning" | "critical";

export type ExecutiveKpiCard = {
  id: string;
  label: string;
  value: number;
  unit?: string;
  valueLabel?: string;
  delta?: number;
  deltaLabel?: string;
  tone?: ExecutiveKpiTone;
  module:
    | "gold"
    | "stores"
    | "finance"
    | "workforce"
    | "operations"
    | "maintenance"
    | "compliance"
    | "reports"
    | "general";
};

export type ExecutiveTrendPoint = {
  date: string;
  value: number;
  comparison?: number;
};

export type ExecutiveCashTrendPoint = {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
};

export type ExecutiveBreakdownPoint = {
  label: string;
  value: number;
};

export type ExecutiveCharts = {
  goldTrend: ExecutiveTrendPoint[];
  cashTrend: ExecutiveCashTrendPoint[];
  throughputTrend: ExecutiveTrendPoint[];
  riskBreakdown: ExecutiveBreakdownPoint[];
};

export type ExecutiveHighlight = {
  id: string;
  title: string;
  description: string;
  value?: number;
  valueLabel?: string;
  unit?: string;
  tone?: ExecutiveKpiTone;
};

export type ExecutiveQuickLink = {
  href: string;
  label: string;
  module:
    | "gold"
    | "stores"
    | "finance"
    | "workforce"
    | "operations"
    | "maintenance"
    | "compliance"
    | "reports"
    | "general";
  priority: number;
  badgeCount?: number;
  badgeLabel?: string;
  isPrimary?: boolean;
  primaryOrder?: number;
};

export type ExecutiveModuleStatus = "healthy" | "watch" | "critical";

export type ExecutiveSummaryMetric = {
  label: string;
  value: number;
  unit?: string;
  valueLabel?: string;
};

export type ExecutiveModuleSummary = {
  module:
    | "finance"
    | "gold"
    | "workforce"
    | "operations"
    | "stores"
    | "maintenance"
    | "compliance"
    | "reports";
  status: ExecutiveModuleStatus;
  primaryMetric: ExecutiveSummaryMetric;
  secondaryMetric?: ExecutiveSummaryMetric;
  tertiaryMetric?: ExecutiveSummaryMetric;
  openExceptions: number;
  trendDelta?: number;
  topExceptionLabel?: string;
  reportHref: string;
};

export type ExecutiveDashboardResponse = {
  generatedAt: string;
  range: ExecutiveRange;
  siteId: string;
  fullView: boolean;
  window: {
    startDate: string;
    endDate: string;
    previousStartDate: string;
    previousEndDate: string;
    days: number;
  };
  sites: Site[];
  kpis: ExecutiveKpiCard[];
  charts: ExecutiveCharts;
  highlights: ExecutiveHighlight[];
  executiveSummary: ExecutiveModuleSummary[];
  quickLinks: ExecutiveQuickLink[];
};

export async function fetchSitesList(
  params: {
    active?: boolean | "all";
    search?: string;
  } = {},
) {
  const query = buildQuery(params);
  const response = await fetchJson<{ sites: Site[] }>(`/api/sites${query}`);
  return response.sites;
}

export async function createSite(input: {
  name: string;
  code?: string;
  location?: string;
  measurementUnit?: "tonnes" | "trips" | "wheelbarrows";
}) {
  return fetchJson<Site>("/api/sites", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSite(
  id: string,
  input: {
    name?: string;
    code?: string;
    location?: string | null;
    measurementUnit?: "tonnes" | "trips" | "wheelbarrows";
    isActive?: boolean;
  },
) {
  return fetchJson<Site>(`/api/sites/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteSite(id: string) {
  return fetchJson<{ success: boolean; archived?: boolean }>(`/api/sites/${id}`, {
    method: "DELETE",
  });
}

export async function fetchExecutiveDashboardOverview(params: {
  siteId?: string;
  range: ExecutiveRange;
}) {
  const query = buildQuery({
    siteId: params.siteId,
    range: params.range,
  });
  return fetchJson<ExecutiveDashboardResponse>(`/api/dashboard/executive-overview${query}`);
}

export async function fetchUsers(
  params: {
    role?: string;
    active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<UserSummary>>(`/api/users${query}`);
}

export type LinkableUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

export async function fetchLinkableUsers(params: { search?: string } = {}) {
  const query = buildQuery(params);
  return fetchJson<{ data: LinkableUser[] }>(`/api/employees/linkable-users${query}`);
}

export async function createManagedUser(input: CreateManagedUserInput) {
  return fetchJson<UserSummary>("/api/users/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setManagedUserStatus(input: SetManagedUserStatusInput) {
  return fetchJson<UserSummary>("/api/users/status", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function resetManagedUserPassword(input: ResetManagedUserPasswordInput) {
  return fetchJson<UserSummary>("/api/users/password-reset", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function changeManagedUserRole(input: ChangeManagedUserRoleInput) {
  return fetchJson<UserSummary>("/api/users/role-change", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchEmployees(
  params: {
    active?: boolean;
    search?: string;
    departmentId?: string;
    gradeId?: string;
    position?: EmployeePositionValue | EmployeePositionValue[];
    /** Only staff assigned to this business — `"SCHOOLS"` for a school's own. */
    module?: EmployeeModuleValue | EmployeeModuleValue[];
    page?: number;
    limit?: number;
  } = {},
) {
  const { position, module: employeeModule, ...rest } = params;
  const positionParam = Array.isArray(position) ? position.join(",") : position;
  const moduleParam = Array.isArray(employeeModule)
    ? employeeModule.join(",")
    : employeeModule;
  const query = buildQuery({ ...rest, position: positionParam, module: moduleParam });
  return fetchJson<Pagination<EmployeeSummary>>(`/api/employees${query}`);
}

export async function fetchShiftGroups(
  params: {
    search?: string;
    siteId?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<ShiftGroupRecord>>(`/api/people/rosters${query}`);
}

export async function fetchShiftGroup(id: string) {
  return fetchJson<
    ShiftGroupRecord & {
      members: ShiftGroupMemberRecord[];
      schedules: ShiftGroupScheduleRecord[];
    }
  >(`/api/people/rosters/${id}`);
}

export async function createShiftGroup(input: {
  name: string;
  code?: string;
  /// Null for a company-wide crew. Not every workforce is organised by site.
  siteId?: string | null;
  leaderEmployeeId: string;
  memberIds?: string[];
}) {
  return fetchJson<ShiftGroupRecord>(`/api/people/rosters`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateShiftGroup(
  id: string,
  input: {
    name?: string;
    code?: string | null;
    siteId?: string | null;
    leaderEmployeeId?: string;
    memberIds?: string[];
    isActive?: boolean;
  },
) {
  return fetchJson<ShiftGroupRecord>(`/api/people/rosters/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function archiveShiftGroup(id: string) {
  return fetchJson<{ success: boolean; archived?: boolean }>(
    `/api/people/rosters/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function permanentlyDeleteShiftGroup(id: string) {
  return fetchJson<{ success: boolean; deleted?: boolean }>(
    `/api/people/rosters/${id}?permanent=true`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchShiftGroupMembers(
  groupId: string,
  params: { active?: boolean } = {},
) {
  const query = buildQuery(params);
  return fetchJson<{
    data: ShiftGroupMemberRecord[];
    leaderEmployeeId?: string;
  }>(`/api/people/rosters/${groupId}/members${query}`);
}

export async function addShiftGroupMembers(
  groupId: string,
  input: { employeeIds: string[] },
) {
  return fetchJson<{ data: ShiftGroupMemberRecord[] }>(
    `/api/people/rosters/${groupId}/members`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function updateShiftGroupMember(
  groupId: string,
  memberId: string,
  input: { isActive: boolean },
) {
  return fetchJson<ShiftGroupMemberRecord>(
    `/api/people/rosters/${groupId}/members/${memberId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function removeShiftGroupMember(groupId: string, memberId: string) {
  return fetchJson<{ success: boolean; removed?: boolean }>(
    `/api/people/rosters/${groupId}/members/${memberId}`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchShiftGroupSchedules(
  params: {
    search?: string;
    siteId?: string;
    shift?: string;
    shiftGroupId?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<ShiftGroupScheduleRecord>>(
    `/api/hr/shift-group-schedules${query}`,
  );
}

export async function createShiftGroupSchedule(input: {
  siteId: string;
  date: string;
  shift: string;
  shiftGroupId: string;
  notes?: string;
}) {
  return fetchJson<ShiftGroupScheduleRecord>(`/api/hr/shift-group-schedules`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateShiftGroupSchedule(
  id: string,
  input: {
    siteId?: string;
    date?: string;
    shift?: string;
    shiftGroupId?: string;
    notes?: string | null;
  },
) {
  return fetchJson<ShiftGroupScheduleRecord>(`/api/hr/shift-group-schedules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteShiftGroupSchedule(id: string) {
  return fetchJson<{ success: boolean; deleted?: boolean }>(
    `/api/hr/shift-group-schedules/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchDepartments(
  params: {
    active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<DepartmentRecord>>(`/api/departments${query}`);
}

export async function createDepartment(input: {
  code?: string;
  name: string;
  isActive?: boolean;
}) {
  return fetchJson<DepartmentRecord>("/api/departments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateDepartment(
  id: string,
  input: {
    code?: string;
    name?: string;
    isActive?: boolean;
  },
) {
  return fetchJson<DepartmentRecord>(`/api/departments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteDepartment(id: string) {
  return fetchJson<{ success: boolean; deleted?: boolean }>(`/api/departments/${id}`, {
    method: "DELETE",
  });
}

export async function fetchJobGrades(
  params: {
    active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<JobGradeRecord>>(`/api/job-grades${query}`);
}

export async function createJobGrade(input: {
  code?: string;
  name: string;
  rank?: number;
  isActive?: boolean;
}) {
  return fetchJson<JobGradeRecord>("/api/job-grades", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateJobGrade(
  id: string,
  input: {
    code?: string;
    name?: string;
    rank?: number;
    isActive?: boolean;
  },
) {
  return fetchJson<JobGradeRecord>(`/api/job-grades/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteJobGrade(id: string) {
  return fetchJson<{ success: boolean; deleted?: boolean }>(`/api/job-grades/${id}`, {
    method: "DELETE",
  });
}

export async function fetchCompensationProfiles(
  params: {
    search?: string;
    employeeId?: string;
    status?: "ACTIVE" | "INACTIVE";
    workflowStatus?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
    effectiveOn?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<CompensationProfileRecord>>(
    `/api/compensation/profiles${query}`,
  );
}

export async function fetchCompensationRules(
  params: {
    search?: string;
    type?: "ALLOWANCE" | "DEDUCTION";
    active?: boolean;
    workflowStatus?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
    employeeId?: string;
    departmentId?: string;
    gradeId?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<CompensationRuleRecord>>(
    `/api/compensation/rules${query}`,
  );
}

export async function fetchCompensationTemplates(
  params: {
    search?: string;
    active?: boolean;
    employmentType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "CASUAL";
    position?: EmployeePositionValue;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<CompensationTemplateRecord>>(
    `/api/compensation/templates${query}`,
  );
}

export async function fetchPayrollPeriods(
  params: {
    search?: string;
    status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "CLOSED";
    cycle?: "MONTHLY" | "FORTNIGHTLY";
    periodPurpose?: PeriodPurpose;
    isAutoGenerated?: boolean;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<PayrollPeriodRecord>>(`/api/payroll/periods${query}`);
}

export async function fetchPayrollRuns(
  params: {
    search?: string;
    periodId?: string;
    status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "POSTED" | "REJECTED";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<PayrollRunRecord>>(`/api/payroll/runs${query}`);
}

export async function fetchDisbursementBatches(
  params: {
    search?: string;
    payrollRunId?: string;
    status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "PAID" | "REJECTED";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<DisbursementBatchRecord>>(
    `/api/disbursements/batches${query}`,
  );
}

export async function fetchPayrollConfig() {
  return fetchJson<PayrollConfigRecord>("/api/payroll/config");
}

export async function updatePayrollConfig(
  input: Partial<
    Pick<
      PayrollConfigRecord,
      | "payrollCycle"
      | "goldPayoutCycle"
      | "goldSettlementMode"
      | "cashDisbursementOnly"
      | "autoGeneratePayrollPeriods"
      | "autoGenerateGoldPayoutPeriods"
      | "periodGenerationHorizon"
    >
  >,
) {
  return fetchJson<PayrollConfigRecord>("/api/payroll/config", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function fetchApprovalHistory(
  params: {
    search?: string;
    entityType?:
      | "PAYROLL_RUN"
      | "DISBURSEMENT_BATCH"
      | "ADJUSTMENT_ENTRY"
      | "COMPENSATION_PROFILE"
      | "COMPENSATION_RULE"
      | "GOLD_SHIFT_ALLOCATION"
      | "DISCIPLINARY_ACTION";
    entityId?: string;
    actedById?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<ApprovalHistoryRecord>>(`/api/approvals/history${query}`);
}

export async function saveWebPushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  return fetchJson("/api/notifications/push-subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeWebPushSubscription(input: { endpoint: string }) {
  return fetchJson<{ updated: number }>("/api/notifications/push-subscriptions", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

export async function fetchEmployeePayments(
  params: {
    search?: string;
    type?: "GOLD" | "SALARY" | "IRREGULAR";
    employeeId?: string;
    status?: "DUE" | "PARTIAL" | "PAID";
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<EmployeePayment>>(`/api/employee-payments${query}`);
}

export async function fetchSections(
  params: {
    siteId?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<SectionSummary>>(`/api/sections${query}`);
}

export async function createSection(input: {
  name: string;
  siteId: string;
  isActive?: boolean;
}) {
  return fetchJson<SectionSummary>("/api/sections", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSection(
  id: string,
  input: {
    name?: string;
    siteId?: string;
    isActive?: boolean;
  },
) {
  return fetchJson<SectionSummary>(`/api/sections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteSection(id: string) {
  return fetchJson<{ success: boolean; archived?: boolean }>(`/api/sections/${id}`, {
    method: "DELETE",
  });
}

export async function fetchDowntimeCodes(
  params: { siteId?: string; active?: boolean | "all"; search?: string } = {},
) {
  const query = buildQuery(params);
  const response = await fetchJson<{ codes: DowntimeCode[] }>(
    `/api/downtime-codes${query}`,
  );
  return response.codes;
}

export async function createDowntimeCode(input: {
  code?: string;
  description: string;
  siteId: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  return fetchJson<DowntimeCode>("/api/downtime-codes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateDowntimeCode(
  id: string,
  input: {
    code?: string;
    description?: string;
    siteId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  return fetchJson<DowntimeCode>(`/api/downtime-codes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteDowntimeCode(id: string) {
  return fetchJson<{ success: boolean; archived?: boolean }>(`/api/downtime-codes/${id}`, {
    method: "DELETE",
  });
}

export async function fetchDowntimeAnalytics(params: {
  siteId: string;
  startDate: string;
  endDate: string;
}) {
  const query = buildQuery(params);
  return fetchJson<DowntimeAnalytics>(`/api/analytics/downtime${query}`);
}

export async function fetchEquipment(
  params: { siteId?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<Equipment>>(`/api/equipment${query}`);
}

export async function fetchWorkOrders(
  params: {
    equipmentId?: string;
    siteId?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<WorkOrder>>(`/api/work-orders${query}`);
}

export async function fetchInventoryItems(
  params: {
    siteId?: string;
    category?: string;
    lowStock?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<InventoryItem>>(`/api/inventory/items${query}`);
}

export async function fetchStockMovements(
  params: {
    siteId?: string;
    itemId?: string;
    movementType?: string;
    category?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<StockMovement>>(
    `/api/inventory/movements${query}`,
  );
}

export async function fetchStockLocations(
  params: {
    siteId?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<StockLocation>>(`/api/stock-locations${query}`);
}

export async function fetchAttendance(
  params: {
    search?: string;
    siteId?: string;
    employeeId?: string;
    shiftGroupId?: string;
    shiftLeaderId?: string;
    shift?: string;
    status?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<AttendanceRecord>>(`/api/people/attendance${query}`);
}

export async function fetchShiftReports(
  params: {
    search?: string;
    siteId?: string;
    shiftGroupId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<ShiftReportSummary>>(
    `/api/shift-reports${query}`,
  );
}

export async function fetchPlantReports(
  params: {
    search?: string;
    siteId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<PlantReport>>(`/api/plant-reports${query}`);
}

export async function fetchGoldPours(
  params: {
    siteId?: string;
    sourceType?: "PRODUCTION" | "PURCHASE_PUBLIC";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldPour>>(`/api/gold/pours${query}`);
}

export async function fetchGoldDispatches(
  params: {
    siteId?: string;
    goldPourId?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldDispatch>>(`/api/gold/dispatches${query}`);
}

export async function fetchGoldReceipts(
  params: {
    siteId?: string;
    goldDispatchId?: string;
    goldPourId?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<BuyerReceipt>>(`/api/gold/receipts${query}`);
}

export async function fetchGoldPurchases(
  params: {
    siteId?: string;
    sellerType?: "EMPLOYEE" | "EXTERNAL";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldPurchase>>(`/api/gold/purchases${query}`);
}

export async function fetchGoldShiftAllocations(
  params: {
    siteId?: string;
    shift?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldShiftAllocation>>(
    `/api/gold/shift-allocations${query}`,
  );
}

export async function fetchGoldCorrections(
  params: {
    siteId?: string;
    pourId?: string;
    entityType?: "POUR" | "DISPATCH" | "RECEIPT";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldCorrection>>(`/api/gold/corrections${query}`);
}

export async function fetchGoldPrices(
  params: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldPriceRecord>>(`/api/gold/prices${query}`);
}

export async function createGoldPrice(input: {
  effectiveDate: string;
  priceUsdPerGram: number;
  note?: string;
}) {
  return fetchJson<GoldPriceRecord>("/api/gold/prices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateGoldPrice(
  id: string,
  input: {
    effectiveDate?: string;
    priceUsdPerGram?: number;
    note?: string | null;
  },
) {
  return fetchJson<GoldPriceRecord>(`/api/gold/prices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function fetchGoldExpenseTypes(
  params: { active?: boolean | "all"; search?: string } = {},
) {
  const query = buildQuery(params);
  const response = await fetchJson<{ expenseTypes: GoldExpenseType[] }>(
    `/api/gold/expense-types${query}`,
  );
  return response.expenseTypes;
}

export async function createGoldExpenseType(input: {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  return fetchJson<GoldExpenseType>("/api/gold/expense-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateGoldExpenseType(
  id: string,
  input: {
    name?: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  return fetchJson<GoldExpenseType>(`/api/gold/expense-types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteGoldExpenseType(id: string) {
  return fetchJson<{ success: boolean; archived?: boolean }>(
    `/api/gold/expense-types/${id}`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchPermits(
  params: {
    siteId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<PermitRecord>>(`/api/compliance/permits${query}`);
}

export async function fetchInspections(
  params: {
    siteId?: string;
    startDate?: string;
    endDate?: string;
    overdue?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<InspectionRecord>>(`/api/compliance/inspections${query}`);
}

export async function fetchIncidents(
  params: {
    siteId?: string;
    incidentType?: string;
    severity?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<IncidentRecord>>(`/api/compliance/incidents${query}`);
}

export async function fetchHrIncidents(
  params: {
    employeeId?: string;
    siteId?: string;
    sourceIncidentId?: string;
    status?: "OPEN" | "UNDER_REVIEW" | "CLOSED";
    severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    category?: "MISCONDUCT" | "ATTENDANCE" | "SAFETY_POLICY" | "PERFORMANCE" | "OTHER";
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<HrIncidentRecord>>(`/api/hr/incidents${query}`);
}

export async function fetchDisciplinaryActions(
  params: {
    employeeId?: string;
    incidentId?: string;
    status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "APPLIED";
    actionType?: "WARNING" | "PENALTY" | "SUSPENSION" | "TERMINATION" | "OTHER";
    penaltyStatus?: "NONE" | "PENDING" | "DEDUCTED" | "PAID" | "WAIVED";
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<DisciplinaryActionRecord>>(
    `/api/hr/disciplinary-actions${query}`,
  );
}

export async function fetchTrainingRecords(
  params: {
    userId?: string;
    startDate?: string;
    endDate?: string;
    expiringDays?: number;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<TrainingRecordSummary>>(`/api/compliance/training-records${query}`);
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

