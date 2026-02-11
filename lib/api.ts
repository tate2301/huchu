import { fetchJson } from "@/lib/api-client";

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
};

export type Pagination<T> = {
  data: T[];
  pagination: PaginationMeta;
};

export type Site = {
  id: string;
  name: string;
  code: string;
  location?: string | null;
  measurementUnit: string;
  isActive: boolean;
};

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

export type EmployeeSummary = {
  id: string;
  employeeId: string;
  name: string;
  phone: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  passportPhotoUrl: string;
  villageOfOrigin: string;
  position: string;
  departmentId?: string | null;
  gradeId?: string | null;
  supervisorId?: string | null;
  employmentType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "CASUAL";
  hireDate?: string | null;
  terminationDate?: string | null;
  defaultCurrency?: string;
  department?: { id: string; code: string; name: string } | null;
  grade?: { id: string; code: string; name: string; rank: number } | null;
  supervisor?: { id: string; employeeId: string; name: string } | null;
  isActive: boolean;
  goldOwed: number;
  salaryOwed: number;
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
    | "MANAGER"
    | "CLERK"
    | "SUPPORT_STAFF"
    | "ENGINEERS"
    | "CHEMIST"
    | "MINERS"
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

export type RunDomain = "PAYROLL" | "GOLD_PAYOUT";

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
  domain: RunDomain;
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
  domain: RunDomain;
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
    domain?: RunDomain;
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
  entityType:
    | "PAYROLL_RUN"
    | "DISBURSEMENT_BATCH"
    | "ADJUSTMENT_ENTRY"
    | "COMPENSATION_PROFILE"
    | "COMPENSATION_RULE"
    | "GOLD_SHIFT_ALLOCATION";
  entityId: string;
  action: "CREATE" | "SUBMIT" | "APPROVE" | "REJECT" | "ADJUST";
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  actedAt: string;
  createdAt: string;
  actedBy: { id: string; name: string; role: string };
};

export type NotificationType =
  | "HR_PAYROLL_SUBMITTED"
  | "HR_PAYROLL_APPROVED"
  | "HR_PAYROLL_REJECTED"
  | "HR_DISBURSEMENT_SUBMITTED"
  | "HR_DISBURSEMENT_APPROVED"
  | "HR_DISBURSEMENT_REJECTED"
  | "HR_ADJUSTMENT_SUBMITTED"
  | "HR_ADJUSTMENT_APPROVED"
  | "HR_ADJUSTMENT_REJECTED"
  | "HR_COMP_PROFILE_SUBMITTED"
  | "HR_COMP_PROFILE_APPROVED"
  | "HR_COMP_PROFILE_REJECTED"
  | "HR_COMP_RULE_SUBMITTED"
  | "HR_COMP_RULE_APPROVED"
  | "HR_COMP_RULE_REJECTED"
  | "HR_GOLD_PAYOUT_SUBMITTED"
  | "HR_GOLD_PAYOUT_APPROVED"
  | "HR_GOLD_PAYOUT_REJECTED"
  | "OPS_INCIDENT_CREATED"
  | "OPS_INCIDENT_STATUS_CHANGED"
  | "OPS_PERMIT_EXPIRING"
  | "OPS_PERMIT_EXPIRED"
  | "OPS_WORK_ORDER_OPENED"
  | "OPS_WORK_ORDER_IN_PROGRESS";

export type NotificationSeverity = "INFO" | "WARNING" | "CRITICAL";

export type NotificationEntityType =
  | "PAYROLL_RUN"
  | "DISBURSEMENT_BATCH"
  | "ADJUSTMENT_ENTRY"
  | "COMPENSATION_PROFILE"
  | "COMPENSATION_RULE"
  | "GOLD_SHIFT_ALLOCATION"
  | "INCIDENT"
  | "PERMIT"
  | "WORK_ORDER";

export type NotificationAction = {
  key: string;
  label: string;
  kind: "api" | "link";
  href: string;
  method?: "POST" | "PATCH" | "DELETE";
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  confirmMessage?: string;
};

export type NotificationListItem = {
  id: string;
  recipientId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  summary: string;
  payload: Record<string, unknown> | null;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
  sourceAction?: string | null;
  createdAt: string;
  isRead: boolean;
  readAt?: string | null;
  isArchived: boolean;
  archivedAt?: string | null;
  actionTaken?: string | null;
  actedAt?: string | null;
  actions: NotificationAction[];
};

export type NotificationListResponse = {
  data: NotificationListItem[];
  pagination: PaginationMeta;
  unreadCount: number;
};

export type UserNotificationPreferences = {
  userId: string;
  inAppEnabled: boolean;
  webPushEnabled: boolean;
  hrEnabled: boolean;
  opsEnabled: boolean;
};

export type FixedSalary = {
  id: string;
  employeeId: string;
  monthlyAmount: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    name: string;
    employeeId: string;
    position: string;
    isActive: boolean;
  };
};

export type EmployeePayment = {
  id: string;
  employeeId: string;
  type: "GOLD" | "SALARY";
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
    domain: RunDomain;
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
  site?: { name: string; code: string };
};

export type DowntimeCode = {
  id: string;
  code: string;
  description: string;
  siteId?: string | null;
  sortOrder: number;
};

export type Equipment = {
  id: string;
  equipmentCode: string;
  name: string;
  category: string;
  siteId?: string;
  site: { name: string; code: string };
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
  name: string;
  siteId: string;
  isActive: boolean;
  site?: { name: string; code: string };
};

export type StockMovement = {
  id: string;
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
  shift: "DAY" | "NIGHT";
  status: string;
  overtime?: number | null;
  notes?: string | null;
  site: { id: string; name: string; code: string };
  employee: { id: string; name: string; employeeId: string };
};

export type ShiftReportSummary = {
  id: string;
  date: string;
  shift: "DAY" | "NIGHT";
  siteId: string;
  crewCount: number;
  workType: string;
  status: string;
  site: { name: string; code: string };
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
  grossWeight: number;
  estimatedPurity?: number | null;
  storageLocation: string;
  site: { name: string; code: string };
  witness1?: { name: string } | null;
  witness2?: { name: string } | null;
};

export type GoldDispatch = {
  id: string;
  batchId?: string;
  batchCode?: string;
  goldPourId: string;
  dispatchDate: string;
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
    site: { name: string; code: string };
  };
};

export type BuyerReceipt = {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  assayResult?: number | null;
  paidAmount: number;
  paymentMethod: string;
  paymentChannel?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  goldDispatch: {
    id: string;
    batchId?: string;
    batchCode?: string;
    dispatchDate: string;
    courier: string;
    goldPour: {
      id?: string;
      batchId?: string;
      batchCode?: string;
      pourBarId: string;
      grossWeight: number;
      pourDate: string;
      site: { name: string; code: string };
    };
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
  employee: { id: string; name: string; employeeId: string };
};

export type GoldShiftAllocation = {
  id: string;
  date: string;
  shift: "DAY" | "NIGHT";
  siteId: string;
  totalWeight: number;
  netWeight: number;
  workerShareWeight: number;
  companyShareWeight: number;
  perWorkerWeight: number;
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

function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>,
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function fetchSites() {
  const response = await fetchJson<{ sites: Site[] }>("/api/sites");
  return response.sites;
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

export async function fetchEmployees(
  params: {
    active?: boolean;
    search?: string;
    departmentId?: string;
    gradeId?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<EmployeeSummary>>(`/api/employees${query}`);
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

export async function fetchCompensationProfiles(
  params: {
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
    position?:
      | "MANAGER"
      | "CLERK"
      | "SUPPORT_STAFF"
      | "ENGINEERS"
      | "CHEMIST"
      | "MINERS";
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
    domain?: RunDomain;
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
    periodId?: string;
    domain?: RunDomain;
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
    entityType?:
      | "PAYROLL_RUN"
      | "DISBURSEMENT_BATCH"
      | "ADJUSTMENT_ENTRY"
      | "COMPENSATION_PROFILE"
      | "COMPENSATION_RULE"
      | "GOLD_SHIFT_ALLOCATION";
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

export async function fetchNotifications(
  params: {
    unreadOnly?: boolean;
    includeArchived?: boolean;
    type?: NotificationType;
    severity?: NotificationSeverity;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<NotificationListResponse>(`/api/notifications${query}`);
}

export async function markNotificationsRead(input: {
  recipientIds: string[];
  actionTaken?: string;
}) {
  return fetchJson<{ updated: number }>("/api/notifications/read", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function archiveNotifications(input: { recipientIds: string[] }) {
  return fetchJson<{ updated: number }>("/api/notifications/archive", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchNotificationPreferences() {
  return fetchJson<UserNotificationPreferences>("/api/notifications/preferences");
}

export async function updateNotificationPreferences(
  input: Partial<
    Pick<UserNotificationPreferences, "inAppEnabled" | "webPushEnabled" | "hrEnabled" | "opsEnabled">
  >,
) {
  return fetchJson<UserNotificationPreferences>("/api/notifications/preferences", {
    method: "PUT",
    body: JSON.stringify(input),
  });
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

export async function fetchFixedSalaries(
  params: {
    active?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<FixedSalary>>(`/api/fixed-salaries${query}`);
}

export async function fetchEmployeePayments(
  params: {
    type?: "GOLD" | "SALARY";
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

export async function fetchDowntimeCodes(
  params: { siteId?: string; active?: boolean } = {},
) {
  const query = buildQuery(params);
  const response = await fetchJson<{ codes: DowntimeCode[] }>(
    `/api/downtime-codes${query}`,
  );
  return response.codes;
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
    siteId?: string;
    employeeId?: string;
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
  return fetchJson<Pagination<AttendanceRecord>>(`/api/attendance${query}`);
}

export async function fetchShiftReports(
  params: {
    siteId?: string;
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
  params: { siteId?: string; page?: number; limit?: number } = {},
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
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<BuyerReceipt>>(`/api/gold/receipts${query}`);
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

// ============================================
// CCTV API Functions
// ============================================

export type Camera = {
  id: string;
  name: string;
  channelNumber: number;
  nvrId: string;
  siteId: string;
  area: string;
  description?: string | null;
  hasPTZ: boolean;
  hasAudio: boolean;
  hasMotionDetect: boolean;
  hasLineDetect: boolean;
  isActive: boolean;
  isOnline: boolean;
  isRecording: boolean;
  lastSeen?: string | null;
  isHighSecurity: boolean;
  createdAt?: string;
  updatedAt?: string;
  nvr?: { id: string; name: string; ipAddress: string; isOnline: boolean; isActive: boolean };
  site?: { id: string; name: string; code: string };
};

export type NVR = {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  httpPort: number;
  siteId: string;
  manufacturer: string;
  model?: string | null;
  firmware?: string | null;
  username?: string;
  password?: string;
  isActive: boolean;
  isOnline: boolean;
  rtspPort: number;
  isapiEnabled: boolean;
  onvifEnabled: boolean;
  lastHeartbeat?: string | null;
  createdAt?: string;
  updatedAt?: string;
  site?: { id: string; name: string; code: string };
  _count?: { cameras: number };
};

export type CCTVEvent = {
  id: string;
  eventType: string;
  severity: string;
  eventTime: string;
  title: string;
  description?: string | null;
  isAcknowledged: boolean;
  linkedIncidentId?: string | null;
  notes?: string | null;
  camera?: { id: string; name: string; area: string; site: { id: string; name: string; code: string } };
  nvr?: { id: string; name: string; siteId: string };
};

export type CCTVStreamSession = {
  id: string;
  cameraId: string;
  siteId: string;
  userId: string;
  streamType: string;
  protocol: "WEBRTC" | "HLS";
  status: "ACTIVE" | "STOPPED" | "FAILED";
  playUrl?: string | null;
  purpose?: string | null;
  clientMeta?: string | null;
  startedAt: string;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  camera?: {
    id: string;
    name: string;
    area: string;
    isOnline?: boolean;
    nvr?: { id: string; name: string; isOnline?: boolean };
    site: { id: string; name: string; code: string };
  };
  user?: { id: string; name: string; email: string };
};

export type CCTVAccessLog = {
  id: string;
  cameraId: string;
  userId?: string | null;
  accessType: string;
  startTime: string;
  endTime?: string | null;
  duration?: number | null;
  ipAddress?: string | null;
  purpose?: string | null;
  notes?: string | null;
  camera: {
    id: string;
    name: string;
    area: string;
    site: { id: string; name: string; code: string };
  };
  user?: { id: string; name: string; email: string } | null;
};

export type PlaybackClip = {
  startTime: string;
  endTime: string;
  duration: number;
  fileSize: number;
  playbackUri: string;
  recordingType: string;
};

export type PlaybackSearchResponse = {
  clips: PlaybackClip[];
  totalClips: number;
  pagination: PaginationMeta;
  camera: {
    id: string;
    name: string;
    area: string;
    site: { id: string; name: string; code: string };
  };
  searchParams: {
    startTime: string;
    endTime: string;
    recordType: string;
  };
  isapiSearchXML: string;
  note: string;
};

export type StartStreamSessionResponse = {
  session: CCTVStreamSession;
  token: string;
  rtspUrl: string;
  expiresAt: string;
  protocol: "WEBRTC" | "HLS";
  playUrl: string | null;
  fallbackPlayUrl: string | null;
  gatewayConfigured: boolean;
};

export type StreamProfileResponse = {
  session: CCTVStreamSession;
  token: string;
  rtspUrl: string;
  playUrl: string | null;
  fallbackPlayUrl: string | null;
  protocol: "WEBRTC" | "HLS";
  expiresAt: string;
};

export async function fetchCameras(
  params: {
    siteId?: string;
    area?: string;
    isOnline?: boolean;
    nvrId?: string;
    isHighSecurity?: boolean;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<Camera>>(`/api/cctv/cameras${query}`);
}

export async function fetchNVRs(
  params: {
    siteId?: string;
    isOnline?: boolean;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<NVR>>(`/api/cctv/nvrs${query}`);
}

export async function fetchCCTVEvents(
  params: {
    siteId?: string;
    cameraId?: string;
    eventType?: string;
    severity?: string;
    isAcknowledged?: boolean;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);

  return fetchJson<Pagination<CCTVEvent>>(`/api/cctv/events${query}`);
}

export async function fetchCCTVStreamSessions(
  params: {
    siteId?: string;
    cameraId?: string;
    status?: "ACTIVE" | "STOPPED" | "FAILED";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<CCTVStreamSession>>(`/api/cctv/streams/sessions${query}`);
}

export async function startCCTVStreamSession(input: {
  cameraId: string;
  streamType?: "main" | "sub" | "third";
  preferredProtocol?: "WEBRTC" | "HLS";
  purpose?: string;
  clientMeta?: unknown;
  expiresInMinutes?: number;
}) {
  return fetchJson<StartStreamSessionResponse>("/api/cctv/streams/session/start", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function stopCCTVStreamSession(sessionId: string) {
  return fetchJson<{ session: CCTVStreamSession }>("/api/cctv/streams/session/stop", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function switchCCTVStreamProfile(input: {
  sessionId: string;
  streamType: "main" | "sub" | "third";
  preferredProtocol?: "WEBRTC" | "HLS";
}) {
  return fetchJson<StreamProfileResponse>("/api/cctv/streams/profile", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchCCTVAccessLogs(
  params: {
    siteId?: string;
    cameraId?: string;
    accessType?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<CCTVAccessLog>>(`/api/cctv/access-logs${query}`);
}

export async function searchCCTVPlayback(input: {
  cameraId: string;
  startTime: string;
  endTime: string;
  recordType?: string;
  purpose?: string;
  page?: number;
  limit?: number;
}) {
  return fetchJson<PlaybackSearchResponse>("/api/cctv/playback/search", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
