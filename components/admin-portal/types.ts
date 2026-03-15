export type OperationManifest = Record<string, string[]>;

export type AdminWorkspaceScope = "platform" | "organization" | "site";

export type CompanyWorkspace = {
  id: string;
  name: string;
  slug?: string | null;
  status?: string | null;
};

export type AdminMetricCard = {
  id: string;
  label: string;
  value: number;
  hint?: string;
};

export type AdminSearchResult = {
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
};

export type AdminQuickAction = {
  id: string;
  label: string;
  description: string;
  href: string;
  scope: AdminWorkspaceScope;
};

export type IdentityHubData = {
  admins: import("@/scripts/platform/types").AdminSummary[];
  users: import("@/scripts/platform/types").UserSummary[];
  requests: import("@/scripts/platform/types").SupportAccessRequestRecord[];
  sessions: import("@/scripts/platform/types").SupportSessionRecord[];
};

export type WorkspacePricingSummary = {
  tierBase: number;
  siteOverage: number;
  addonBaseTotal: number;
  addonSiteTotal: number;
  total: number;
};

export type WorkspaceOverview = {
  company: import("@/scripts/platform/types").OrganizationDetail;
  reservation: import("@/scripts/platform/types").SubdomainReservationRecord | null;
  contractState: import("@/scripts/platform/types").ContractState;
  subscription: import("@/scripts/platform/types").SubscriptionSummary | null;
  subscriptionHealth: import("@/scripts/platform/types").SubscriptionHealthSummary | null;
  pricing: WorkspacePricingSummary | null;
  addons: import("@/scripts/platform/types").AddonBundleSummary[];
  features: import("@/scripts/platform/types").FeatureSummary[];
  admins: import("@/scripts/platform/types").AdminSummary[];
  users: import("@/scripts/platform/types").UserSummary[];
  sites: import("@/scripts/platform/types").SiteSummary[];
  supportSessions: import("@/scripts/platform/types").SupportSessionRecord[];
  auditEvents: import("@/scripts/platform/types").AuditEventRecord[];
  incidents: import("@/scripts/platform/types").HealthIncidentRecord[];
};

export type CommercialCenterData = {
  subscriptions: import("@/scripts/platform/types").SubscriptionSummary[];
  plans: import("@/scripts/platform/types").TierPlanSummary[];
  templates: import("@/scripts/platform/types").ClientTemplateSummary[];
  bundleCatalog: import("@/scripts/platform/types").BundleCatalogSummary[];
  featureCatalog: import("@/scripts/platform/types").FeatureSummary[];
};

export type ReliabilityClusterData = {
  incidents: import("@/scripts/platform/types").HealthIncidentRecord[];
  metrics: import("@/scripts/platform/types").SloMetricSnapshotRecord[];
  contractEvaluations: import("@/scripts/platform/types").ContractEvaluationResult[];
  runbooks: import("@/scripts/platform/types").RunbookDefinitionRecord[];
  executions: import("@/scripts/platform/types").RunbookExecutionRecord[];
  auditEvents: import("@/scripts/platform/types").AuditEventRecord[];
};
