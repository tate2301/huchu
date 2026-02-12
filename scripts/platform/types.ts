export const ORGANIZATION_STATUSES = ["PROVISIONING", "ACTIVE", "SUSPENDED", "DISABLED"] as const;
export const SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"] as const;
export const ADMIN_ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const ADMIN_ROLES = ["SUPERADMIN", "MANAGER"] as const;
export const SUBDOMAIN_RESERVATION_STATUSES = ["RESERVED", "ACTIVE", "RELEASED"] as const;
export const SUPPORT_ACCESS_STATUSES = ["REQUESTED", "APPROVED", "ACTIVE", "EXPIRED", "REVOKED", "DENIED"] as const;
export const SUPPORT_ACCESS_SCOPES = ["READ_ONLY", "READ_WRITE"] as const;
export const SUPPORT_SESSION_MODES = ["IMPERSONATE", "SHADOW"] as const;
export const RUNBOOK_EXECUTION_STATUSES = ["QUEUED", "RUNNING", "SUCCESS", "FAILED", "CANCELED"] as const;
export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const HEALTH_INCIDENT_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;
export const CONTRACT_STATES = ["ACTIVE", "WARNING", "SUSPENDED", "OVERRIDE"] as const;
export const SUBSCRIPTION_HEALTH_STATES = ["MISSING_SUBSCRIPTION", "ACTIVE", "EXPIRING_SOON", "IN_GRACE", "EXPIRED_BLOCKED"] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
export type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUSES)[number];
export type AdminAccountStatus = (typeof ADMIN_ACCOUNT_STATUSES)[number];
export type AdminRole = (typeof ADMIN_ROLES)[number];
export type SubdomainReservationStatus = (typeof SUBDOMAIN_RESERVATION_STATUSES)[number];
export type SupportAccessStatus = (typeof SUPPORT_ACCESS_STATUSES)[number];
export type SupportAccessScope = (typeof SUPPORT_ACCESS_SCOPES)[number];
export type SupportSessionMode = (typeof SUPPORT_SESSION_MODES)[number];
export type RunbookExecutionStatus = (typeof RUNBOOK_EXECUTION_STATUSES)[number];
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type HealthIncidentStatus = (typeof HEALTH_INCIDENT_STATUSES)[number];
export type ContractState = (typeof CONTRACT_STATES)[number];
export type SubscriptionHealthState = (typeof SUBSCRIPTION_HEALTH_STATES)[number];

export type MutationResult<TResource> =
  | {
      ok: true;
      resource: TResource;
      changed?: Record<string, { before: unknown; after: unknown }>;
      warnings?: string[];
      auditEventId?: string;
    }
  | {
      ok: false;
      errorCode: string;
      message: string;
      warnings?: string[];
    };

export interface OrganizationCounts {
  sites: number;
  activeSites: number;
  users: number;
  activeUsers: number;
}

export interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  isProvisioned: boolean;
  siteCount: number;
  activeSiteCount: number;
  userCount: number;
  activeUserCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  tenantStatus: OrganizationStatus;
  isProvisioned: boolean;
  suspendedAt: string | null;
  disabledAt: string | null;
  payrollCycle: string;
  goldPayoutCycle: string;
  cashDisbursementOnly: boolean;
  autoGeneratePayrollPeriods: boolean;
  autoGenerateGoldPayoutPeriods: boolean;
  periodGenerationHorizon: number;
  createdAt: string | null;
  updatedAt: string | null;
  counts: OrganizationCounts;
}

export interface OrganizationProvisionResult {
  company: {
    id: string;
    name: string;
    slug: string;
    tenantStatus: OrganizationStatus;
    isProvisioned: boolean;
  };
  adminUser: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
    companyId: string;
  };
  subscription: {
    id: string;
    status: SubscriptionStatusValue;
    startedAt: string | null;
    planCode: string;
  };
  auditEventId: string;
}

export interface OrganizationResolveItem {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
}

export interface SubdomainSuggestion {
  candidate: string;
  available: boolean;
  reason: string | null;
}

export interface SubdomainReservationRecord {
  companyId: string;
  companyName: string;
  companySlug: string;
  subdomain: string;
  status: SubdomainReservationStatus;
  provider: string;
  providerReference: string | null;
  reservedAt: string | null;
  activatedAt: string | null;
  releasedAt: string | null;
  updatedAt: string | null;
}

export interface ProvisionBundleInput {
  organizationName: string;
  organizationSlug?: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  tierCode?: string;
  featureTemplate?: string;
  subdomain?: string;
  actor: string;
  reason?: string;
}

export interface ProvisionBundlePreview {
  organizationName: string;
  organizationSlug: string;
  adminEmail: string;
  adminName: string;
  tierCode: string;
  featureTemplate: string;
  templateLabel: string;
  bundleCodes: string[];
  subdomainCandidate: string;
  subdomainAvailable: boolean;
  subdomainSuggestions: SubdomainSuggestion[];
  featuresToEnable: string[];
  actionPreview: string;
  warnings: string[];
}

export interface ProvisionBundleResult {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: OrganizationStatus;
    isProvisioned: boolean;
  };
  admin: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
  };
  subscription: {
    id: string;
    status: SubscriptionStatusValue;
    planCode: string;
    planName: string;
  };
  bundlesApplied: string[];
  featuresApplied: string[];
  subdomainReservation: SubdomainReservationRecord;
  auditEventIds: string[];
  actionPreview: string;
}

export interface SearchIndexEntry {
  id: string;
  kind: "module" | "organization" | "admin" | "action" | "support" | "runbook" | "incident";
  label: string;
  detail: string;
  moduleId: string;
  companyId?: string;
  companySlug?: string;
  companyName?: string;
  actionId?: string;
  keywords: string[];
}

export interface OrganizationStatusResult {
  organizationId: string;
  organizationName: string;
  beforeStatus: OrganizationStatus;
  afterStatus: OrganizationStatus;
  usersChanged: number;
  sitesChanged: number;
  auditEventId: string;
}

export interface SubscriptionSummary {
  id: string;
  companyId: string;
  companyName: string | null;
  companySlug: string | null;
  status: SubscriptionStatusValue;
  planCode: string | null;
  planName: string | null;
  startedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  updatedAt: string | null;
}

export interface SubscriptionStatusResult {
  companyId: string;
  companyName: string;
  companySlug: string;
  beforeStatus: SubscriptionStatusValue | null;
  afterStatus: SubscriptionStatusValue;
  auditEventId: string;
}

export interface TierPlanSummary {
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  annualPrice: number | null;
  includedSites: number;
  additionalSiteMonthlyPrice: number;
  warningDays: number;
  graceDays: number;
  isActive: boolean;
}

export interface TierAssignResult {
  companyId: string;
  companyName: string;
  companySlug: string;
  beforePlanCode: string | null;
  afterPlanCode: string;
  auditEventId: string;
}

export interface AddonBundleSummary {
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  additionalSiteMonthlyPrice: number;
  isActive: boolean;
  enabled: boolean;
  reason: string | null;
}

export interface AddonSetResult {
  companyId: string;
  companyName: string;
  companySlug: string;
  bundleCode: string;
  enabled: boolean;
  reason: string | null;
  auditEventId: string;
}

export interface ClientTemplateSummary {
  code: string;
  label: string;
  description: string;
  targetClients: string[];
  recommendedTierCode: string;
  bundleCodes: string[];
  featureCount: number;
  includeAllFeatures: boolean;
}

export interface ApplySubscriptionTemplateResult {
  companyId: string;
  companyName: string;
  companySlug: string;
  templateCode: string;
  templateLabel: string;
  applyMode: "ADDITIVE" | "REPLACE";
  beforePlanCode: string | null;
  afterPlanCode: string;
  enabledBundles: string[];
  disabledBundles: string[];
  enabledFeatures: string[];
  auditEventId: string;
}

export interface SubscriptionPricingLineItem {
  code: string;
  label: string;
  amount: number;
  type: "tier" | "site-overage" | "addon" | "addon-site" | "feature";
}

export interface SubscriptionPricingSummary {
  companyId: string;
  companyName: string;
  companySlug: string;
  planCode: string | null;
  planName: string | null;
  currency: string;
  siteCount: number;
  tierIncludedSites: number;
  tierSiteOverageRate: number;
  tierSiteOverageCount: number;
  tierSiteOverageAmount: number;
  baseAmount: number;
  addonBaseAmount: number;
  addonSiteAmount: number;
  addonAmount: number;
  featureAmount: number;
  totalAmount: number;
  lineItems: SubscriptionPricingLineItem[];
  computedAt: string;
}

export interface SubscriptionHealthSummary {
  companyId: string;
  state: SubscriptionHealthState;
  status: string | null;
  shouldBlock: boolean;
  warningDays: number;
  graceDays: number;
  currentPeriodEnd: string | null;
  daysUntilEnd: number | null;
  daysOverdue: number | null;
  reason: string;
}

export interface CatalogSyncResult {
  features: number;
  bundles: number;
  bundleItems: number;
  tiers: number;
}

export interface FeatureSummary {
  feature: string;
  featureLabel: string;
  platformActive: boolean;
  enabled: boolean;
  reason: string | null;
  updatedAt: string | null;
}

export interface FeatureSetResult {
  companyId: string;
  companyName: string;
  feature: string;
  featureLabel: string;
  enabled: boolean;
  reason: string | null;
  auditEventId: string;
}

export interface AdminSummary {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  companyId: string;
  companyName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminCreateResult {
  id: string;
  companyId: string;
  companyName: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string | null;
  auditEventId: string;
}

export interface AdminStatusResult {
  adminId: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  companyId: string;
  companyName: string;
  updatedAt: string | null;
  auditEventId: string;
}

export interface AdminResetPasswordResult {
  adminId: string;
  email: string;
  role: AdminRole;
  companyId: string;
  companyName: string;
  updatedAt: string | null;
  auditEventId: string;
}

export interface AuditEventRecord {
  id: string;
  timestamp: string | null;
  actor: string | null;
  action: string | null;
  entityType: string | null;
  entityId: string | null;
  companyId: string | null;
  reason: string | null;
  payload?: unknown;
  eventHash?: string | null;
  prevEventHash?: string | null;
}

export interface AuditExportInput {
  from?: string;
  to?: string;
  actor?: string;
  action?: string;
  companyId?: string;
  format?: "json" | "csv";
}

export interface AuditExportResult {
  format: "json" | "csv";
  generatedAt: string;
  count: number;
  content: string;
}

export interface AuditVerifyChainResult {
  ok: boolean;
  checked: number;
  brokenEventId?: string;
  message: string;
}

export interface SupportAccessRequestRecord {
  id: string;
  companyId: string;
  companyName: string | null;
  companySlug: string | null;
  requestedBy: string;
  approvedBy: string | null;
  reason: string;
  scope: SupportAccessScope;
  status: SupportAccessStatus;
  requestedAt: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SupportSessionRecord {
  id: string;
  requestId: string | null;
  companyId: string;
  companyName: string | null;
  companySlug: string | null;
  actor: string;
  mode: SupportSessionMode;
  scope: SupportAccessScope;
  status: SupportAccessStatus;
  reason: string;
  startedAt: string | null;
  endedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RunbookDefinitionRecord {
  id: string;
  name: string;
  companyId: string | null;
  actionType: string;
  schedule: string | null;
  enabled: boolean;
  riskLevel: RiskLevel;
  inputJson: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RunbookExecutionRecord {
  id: string;
  runbookId: string;
  runbookName: string | null;
  companyId: string | null;
  status: RunbookExecutionStatus;
  dryRun: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  resultJson: string | null;
  errorJson: string | null;
  createdAt: string | null;
}

export interface SloMetricSnapshotRecord {
  id: string;
  companyId: string;
  companyName: string | null;
  companySlug: string | null;
  metricKey: string;
  value: number;
  status: string;
  windowStart: string | null;
  windowEnd: string | null;
  createdAt: string | null;
}

export interface HealthIncidentRecord {
  id: string;
  companyId: string;
  companyName: string | null;
  companySlug: string | null;
  metricKey: string;
  riskLevel: RiskLevel;
  actionType: string;
  status: HealthIncidentStatus;
  message: string;
  actualValue: number | null;
  thresholdValue: number | null;
  createdAt: string | null;
  resolvedAt: string | null;
}

export interface ContractEvaluationResult {
  companyId: string;
  companyName: string;
  companySlug: string;
  subscriptionStatus: SubscriptionStatusValue | null;
  currentState: ContractState;
  recommendedState: ContractState;
  warningReason: string | null;
  canOperate: boolean;
}

export interface ContractEnforcementResult {
  companyId: string;
  companySlug: string;
  beforeState: ContractState;
  afterState: ContractState;
  enforced: boolean;
  reason: string;
  auditEventId: string;
}

export interface ContractOverrideResult {
  companyId: string;
  companySlug: string;
  overrideState: ContractState;
  expiresAt: string | null;
  reason: string;
  auditEventId: string;
}

export interface DnsProvider {
  id: string;
  checkAvailability(candidate: string): Promise<{ available: boolean; reason?: string }>;
  reserve(candidate: string): Promise<{ providerReference: string | null }>;
  activate(candidate: string): Promise<void>;
  release(candidate: string): Promise<void>;
}

export interface ModuleExtension {
  id: string;
  label: string;
  mount: string;
  commands?: Array<{ id: string; label: string; actionType: string }>;
  capabilities?: string[];
}

export interface ListOrganizationsInput {
  status?: OrganizationStatus | string;
  search?: string;
  limit?: number;
  skip?: number;
}

export interface ProvisionOrganizationInput {
  name: string;
  slug?: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  actor: string;
}

export interface ReserveSubdomainInput {
  companyId: string;
  subdomain: string;
  actor: string;
  reason?: string;
}

export interface MutateOrganizationStatusInput {
  companyId: string;
  actor: string;
  reason?: string;
}

export interface ListSubscriptionsInput {
  companyId?: string;
  status?: SubscriptionStatusValue | string;
  limit?: number;
  skip?: number;
}

export interface SetSubscriptionStatusInput {
  companyId: string;
  status: SubscriptionStatusValue | string;
  actor: string;
  reason?: string;
}

export interface AssignSubscriptionTierInput {
  companyId: string;
  tierCode: string;
  actor: string;
  reason?: string;
}

export interface ListAddonsInput {
  companyId: string;
}

export interface SetAddonInput {
  companyId: string;
  bundleCode: string;
  enabled: boolean;
  actor: string;
  reason?: string;
}

export interface ApplySubscriptionTemplateInput {
  companyId: string;
  templateCode: string;
  actor: string;
  tierCode?: string;
  mode?: "ADDITIVE" | "REPLACE" | string;
  reason?: string;
}

export interface ListFeaturesInput {
  companyId?: string;
}

export interface SetFeatureInput {
  companyId: string;
  featureKey: string;
  enabled: boolean;
  actor: string;
  reason?: string;
}

export interface ListAdminsInput {
  companyId?: string;
  status?: AdminAccountStatus | string;
  search?: string;
  limit?: number;
  skip?: number;
}

export interface CreateAdminInput {
  companyId: string;
  email: string;
  name: string;
  password: string;
  role?: AdminRole | string;
  actor: string;
}

export interface SetAdminStatusInput {
  userId: string;
  actor: string;
  reason?: string;
}

export interface ResetAdminPasswordInput {
  userId: string;
  newPassword: string;
  actor: string;
  reason?: string;
}

export interface ListAuditEventsInput {
  limit?: number;
  actor?: string;
  action?: string;
  companyId?: string;
}

export interface AddAuditNoteInput {
  actor: string;
  message: string;
  companyId: string;
}

export interface ListSupportRequestsInput {
  companyId?: string;
  status?: SupportAccessStatus | string;
  limit?: number;
}

export interface RequestSupportAccessInput {
  companyId: string;
  requestedBy: string;
  reason: string;
  scope?: SupportAccessScope;
  ttlMinutes?: number;
}

export interface ApproveSupportAccessInput {
  requestId: string;
  approvedBy: string;
  approve: boolean;
  reason?: string;
}

export interface StartSupportSessionInput {
  requestId: string;
  actor: string;
  mode?: SupportSessionMode;
}

export interface EndSupportSessionInput {
  sessionId: string;
  actor: string;
  reason?: string;
}

export interface UpsertRunbookInput {
  id?: string;
  name: string;
  companyId?: string;
  actionType: string;
  schedule?: string;
  enabled?: boolean;
  riskLevel?: RiskLevel;
  inputJson?: string;
  createdBy?: string;
}

export interface ExecuteRunbookInput {
  runbookId: string;
  actor: string;
  dryRun?: boolean;
}

export interface ListRunbookExecutionsInput {
  runbookId?: string;
  companyId?: string;
  limit?: number;
}

export interface ListHealthIncidentsInput {
  companyId?: string;
  status?: HealthIncidentStatus | string;
  limit?: number;
}

export interface RecordMetricInput {
  companyId: string;
  metricKey: string;
  value: number;
  status?: string;
  windowStart?: string;
  windowEnd?: string;
}

export interface TriggerRemediationInput {
  incidentId: string;
  actor: string;
  reason?: string;
}

export interface EvaluateContractInput {
  companyId: string;
}

export interface EnforceContractInput {
  companyId: string;
  actor: string;
  reason?: string;
}

export interface OverrideContractInput {
  companyId: string;
  actor: string;
  reason: string;
  expiresAt?: string;
}

export interface OrganizationService {
  list(input?: ListOrganizationsInput): Promise<OrganizationListItem[]>;
  resolve(query: string, limit?: number): Promise<OrganizationResolveItem[]>;
  detail(companyId: string): Promise<OrganizationDetail>;
  provision(input: ProvisionOrganizationInput): Promise<MutationResult<OrganizationProvisionResult>>;
  previewProvisionBundle(input: ProvisionBundleInput): Promise<MutationResult<ProvisionBundlePreview>>;
  provisionBundle(input: ProvisionBundleInput): Promise<MutationResult<ProvisionBundleResult>>;
  suggestSubdomains(seed: string, limit?: number): Promise<SubdomainSuggestion[]>;
  reserveSubdomain(input: ReserveSubdomainInput): Promise<MutationResult<SubdomainReservationRecord>>;
  getSubdomainReservation(companyId: string): Promise<SubdomainReservationRecord | null>;
  suspend(input: MutateOrganizationStatusInput): Promise<MutationResult<OrganizationStatusResult>>;
  activate(input: MutateOrganizationStatusInput): Promise<MutationResult<OrganizationStatusResult>>;
  disable(input: MutateOrganizationStatusInput): Promise<MutationResult<OrganizationStatusResult>>;
}

export interface SubscriptionService {
  list(input?: ListSubscriptionsInput): Promise<SubscriptionSummary[]>;
  setStatus(input: SetSubscriptionStatusInput): Promise<MutationResult<SubscriptionStatusResult>>;
  listPlans(): Promise<TierPlanSummary[]>;
  assignTier(input: AssignSubscriptionTierInput): Promise<MutationResult<TierAssignResult>>;
  listTemplates(): Promise<ClientTemplateSummary[]>;
  applyTemplate(input: ApplySubscriptionTemplateInput): Promise<MutationResult<ApplySubscriptionTemplateResult>>;
  listAddons(input: ListAddonsInput): Promise<AddonBundleSummary[]>;
  setAddon(input: SetAddonInput): Promise<MutationResult<AddonSetResult>>;
  recomputePricing(companyId: string): Promise<MutationResult<SubscriptionPricingSummary>>;
  health(companyId: string): Promise<SubscriptionHealthSummary>;
  syncCatalog(actor: string): Promise<MutationResult<CatalogSyncResult>>;
}

export interface FeatureService {
  list(input?: ListFeaturesInput): Promise<FeatureSummary[]>;
  set(input: SetFeatureInput): Promise<MutationResult<FeatureSetResult>>;
}

export interface AdminService {
  list(input?: ListAdminsInput): Promise<AdminSummary[]>;
  create(input: CreateAdminInput): Promise<MutationResult<AdminCreateResult>>;
  activate(input: SetAdminStatusInput): Promise<MutationResult<AdminStatusResult>>;
  deactivate(input: SetAdminStatusInput): Promise<MutationResult<AdminStatusResult>>;
  resetPassword(input: ResetAdminPasswordInput): Promise<MutationResult<AdminResetPasswordResult>>;
}

export interface AuditService {
  list(input?: ListAuditEventsInput): Promise<AuditEventRecord[]>;
  addNote(input: AddAuditNoteInput): Promise<MutationResult<AuditEventRecord>>;
  export(input: AuditExportInput): Promise<MutationResult<AuditExportResult>>;
  verifyChain(companyId?: string): Promise<MutationResult<AuditVerifyChainResult>>;
}

export interface SupportService {
  listRequests(input?: ListSupportRequestsInput): Promise<SupportAccessRequestRecord[]>;
  listSessions(companyId?: string): Promise<SupportSessionRecord[]>;
  requestAccess(input: RequestSupportAccessInput): Promise<MutationResult<SupportAccessRequestRecord>>;
  approveRequest(input: ApproveSupportAccessInput): Promise<MutationResult<SupportAccessRequestRecord>>;
  startSession(input: StartSupportSessionInput): Promise<MutationResult<SupportSessionRecord>>;
  endSession(input: EndSupportSessionInput): Promise<MutationResult<SupportSessionRecord>>;
  expireSessions(nowIso?: string): Promise<MutationResult<{ expiredCount: number }>>;
}

export interface RunbookService {
  listDefinitions(companyId?: string): Promise<RunbookDefinitionRecord[]>;
  upsertDefinition(input: UpsertRunbookInput): Promise<MutationResult<RunbookDefinitionRecord>>;
  listExecutions(input?: ListRunbookExecutionsInput): Promise<RunbookExecutionRecord[]>;
  execute(input: ExecuteRunbookInput): Promise<MutationResult<RunbookExecutionRecord>>;
  setEnabled(id: string, enabled: boolean, actor: string): Promise<MutationResult<RunbookDefinitionRecord>>;
}

export interface HealthService {
  recordMetric(input: RecordMetricInput): Promise<MutationResult<SloMetricSnapshotRecord>>;
  listMetrics(companyId?: string, limit?: number): Promise<SloMetricSnapshotRecord[]>;
  listIncidents(input?: ListHealthIncidentsInput): Promise<HealthIncidentRecord[]>;
  triggerRemediation(input: TriggerRemediationInput): Promise<MutationResult<HealthIncidentRecord>>;
}

export interface ContractService {
  evaluate(input: EvaluateContractInput): Promise<MutationResult<ContractEvaluationResult>>;
  enforce(input: EnforceContractInput): Promise<MutationResult<ContractEnforcementResult>>;
  override(input: OverrideContractInput): Promise<MutationResult<ContractOverrideResult>>;
  getState(companyId: string): Promise<ContractState>;
}

export interface PlatformServices {
  org: OrganizationService;
  subscription: SubscriptionService;
  feature: FeatureService;
  admin: AdminService;
  audit: AuditService;
  support: SupportService;
  runbook: RunbookService;
  health: HealthService;
  contract: ContractService;
  search: {
    global: (query: string, limit?: number) => Promise<SearchIndexEntry[]>;
  };
  disconnect: () => Promise<void>;
}
