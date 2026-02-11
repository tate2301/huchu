export const ORGANIZATION_STATUSES = ["PROVISIONING", "ACTIVE", "SUSPENDED", "DISABLED"] as const;
export const SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"] as const;
export const ADMIN_ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const ADMIN_ROLES = ["SUPERADMIN", "MANAGER"] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
export type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUSES)[number];
export type AdminAccountStatus = (typeof ADMIN_ACCOUNT_STATUSES)[number];
export type AdminRole = (typeof ADMIN_ROLES)[number];

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

export interface OrganizationService {
  list(input?: ListOrganizationsInput): Promise<OrganizationListItem[]>;
  detail(companyId: string): Promise<OrganizationDetail>;
  provision(input: ProvisionOrganizationInput): Promise<MutationResult<OrganizationProvisionResult>>;
  suspend(input: MutateOrganizationStatusInput): Promise<MutationResult<OrganizationStatusResult>>;
  activate(input: MutateOrganizationStatusInput): Promise<MutationResult<OrganizationStatusResult>>;
  disable(input: MutateOrganizationStatusInput): Promise<MutationResult<OrganizationStatusResult>>;
}

export interface SubscriptionService {
  list(input?: ListSubscriptionsInput): Promise<SubscriptionSummary[]>;
  setStatus(input: SetSubscriptionStatusInput): Promise<MutationResult<SubscriptionStatusResult>>;
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
}

export interface PlatformServices {
  org: OrganizationService;
  subscription: SubscriptionService;
  feature: FeatureService;
  admin: AdminService;
  audit: AuditService;
  disconnect: () => Promise<void>;
}
