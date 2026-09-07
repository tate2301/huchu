/** The people screens' client: what the browser asks of `/api/employees` and friends. */
import { buildQuery, fetchJson, type Pagination } from "@corelithzw/platform/api-client";
import type { EmployeePositionValue } from "@corelithzw/platform/vertical-defaults";

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
