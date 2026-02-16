import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";

import { prisma, disconnectPrisma } from "./prisma";
import {
  getSubdomainReservation as getOrgSubdomainReservation,
  previewProvisionBundle,
  provisionBundle,
  reserveSubdomain as reserveOrgSubdomain,
  resolveOrganizations,
  suggestSubdomains,
} from "./domain/organization-advanced";
import {
  appendAuditEvent as appendLedgerAuditEvent,
  exportAudit,
  listAuditEvents as listLedgerAuditEvents,
  verifyAuditChain,
} from "./domain/audit-ledger";
import {
  approveSupportAccess,
  endSupportSession,
  expireSupportSessions,
  listSupportRequests,
  listSupportSessions,
  requestSupportAccess,
  startSupportSession,
} from "./domain/support-service";
import {
  executeRunbook,
  listRunbookDefinitions,
  listRunbookExecutions,
  setRunbookEnabled,
  upsertRunbookDefinition,
} from "./domain/runbook-service";
import {
  listHealthIncidents,
  listMetrics,
  recordMetric,
  triggerRemediation,
} from "./domain/health-service";
import {
  enforceContract,
  evaluateContract,
  getContractState,
  overrideContract,
} from "./domain/contract-service";
import {
  assignTier,
  getSubscriptionHealthSummary,
  listAddOnBundles,
  listTierPlans,
  recomputeSubscriptionPricing,
  setAddOnBundle,
  syncCommercialCatalog,
} from "./domain/commercial-service";
import {
  getBundleFeatureKeysByCodes,
  listBundleCatalog,
  setBundleFeatures,
  upsertBundleCatalog,
} from "./domain/bundle-catalog-service";
import {
  changeUserRole,
  createUser,
  listUsers,
  resetUserPassword,
  setUserStatus,
} from "./domain/user-management-service";
import { searchGlobal } from "./domain/search-service";
import { getTierDefinition } from "../../lib/platform/feature-catalog";
import {
  CLIENT_BUNDLE_TEMPLATES,
  getClientTemplateBundleCodes,
  getClientTemplateDefinition,
  getClientTemplateFeatureKeys,
} from "../../lib/platform/client-templates";
import {
  ADMIN_ACCOUNT_STATUSES,
  ADMIN_ROLES,
  ORGANIZATION_STATUSES,
  SUBSCRIPTION_STATUSES,
  type AddAuditNoteInput,
  type BundleCatalogSummary,
  type ApplySubscriptionTemplateInput,
  type ApplySubscriptionTemplateResult,
  type AssignSubscriptionTierInput,
  type AdminCreateResult,
  type AdminResetPasswordResult,
  type AdminRole,
  type AdminStatusResult,
  type AdminSummary,
  type CreateAdminInput,
  type ClientTemplateSummary,
  type FeatureSetResult,
  type FeatureSummary,
  type ListAdminsInput,
  type ListAuditEventsInput,
  type ListFeaturesInput,
  type ListOrganizationsInput,
  type ListSubscriptionsInput,
  type ListAddonsInput,
  type MutationResult,
  type OrganizationDetail,
  type OrganizationListItem,
  type OrganizationProvisionResult,
  type OrganizationStatus,
  type OrganizationStatusResult,
  type PlatformServices,
  type ProvisionOrganizationInput,
  type ResetAdminPasswordInput,
  type SetAdminStatusInput,
  type SetFeatureInput,
  type SetBundleFeaturesInput,
  type SetSubscriptionStatusInput,
  type SetAddonInput,
  type UpsertBundleCatalogInput,
  type SubscriptionStatusResult,
  type SubscriptionPricingSummary,
  type SubscriptionHealthSummary,
  type SubscriptionStatusValue,
  type SubscriptionSummary,
  type AuditEventRecord,
} from "./types";

function formatDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function slugify(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeEmail(email: string, label = "email"): string {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error(`Invalid ${label}: ${email}`);
  }
  return normalized;
}

function normalizeEnum<T extends string>(value: string, label: string, allowed: readonly T[]): T {
  const normalized = value.trim().toUpperCase();
  if (!allowed.includes(normalized as T)) {
    throw new Error(`Invalid ${label}: ${value}. Use ${allowed.map((entry) => entry.toLowerCase()).join(", ")}.`);
  }
  return normalized as T;
}

function toErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  if (message.includes("not found")) return "NOT_FOUND";
  if (message.includes("already exists") || message.includes("duplicate") || message.includes("unique")) return "CONFLICT";
  if (message.includes("invalid") || message.includes("empty") || message.includes("required")) return "VALIDATION_ERROR";
  if (message.includes("permission") || message.includes("role")) return "PERMISSION_DENIED";
  return "OPERATION_FAILED";
}

async function toMutation<T>(task: () => Promise<T>): Promise<MutationResult<T>> {
  try {
    return { ok: true, resource: await task() };
  } catch (error) {
    return {
      ok: false,
      errorCode: toErrorCode(error),
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function appendAuditEvent(event: {
  actor?: string | null;
  action?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  companyId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}): Promise<AuditEventRecord> {
  return appendLedgerAuditEvent(event);
}

async function ensureDefaultPlan() {
  return prisma.subscriptionPlan.upsert({
    where: { code: "CUSTOM" },
    update: { isActive: true },
    create: {
      code: "CUSTOM",
      name: "Custom",
      description: "Default manually managed plan",
      monthlyPrice: 0,
      annualPrice: 0,
      currency: "USD",
      isActive: true,
    },
    select: { id: true, code: true },
  });
}

async function listOrganizations(input?: ListOrganizationsInput): Promise<OrganizationListItem[]> {
  const where: Prisma.CompanyWhereInput = {};
  if (input?.status) {
    where.tenantStatus = normalizeEnum(input.status, "status", ORGANIZATION_STATUSES);
  }
  const query = input?.search?.trim();
  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { slug: { contains: query, mode: "insensitive" } },
      { id: query },
    ];
  }

  const companies = await prisma.company.findMany({
    where,
    select: { id: true, name: true, slug: true, tenantStatus: true, isProvisioned: true, createdAt: true, updatedAt: true },
    orderBy: { name: "asc" },
    take: input?.limit ?? 100,
    skip: input?.skip ?? 0,
  });

  const rows = await Promise.all(
    companies.map(async (company) => {
      const [siteCount, activeSiteCount, userCount, activeUserCount] = await Promise.all([
        prisma.site.count({ where: { companyId: company.id } }),
        prisma.site.count({ where: { companyId: company.id, isActive: true } }),
        prisma.user.count({ where: { companyId: company.id } }),
        prisma.user.count({ where: { companyId: company.id, isActive: true } }),
      ]);

      return {
        id: company.id,
        name: company.name,
        slug: company.slug,
        status: company.tenantStatus as OrganizationStatus,
        isProvisioned: company.isProvisioned,
        siteCount,
        activeSiteCount,
        userCount,
        activeUserCount,
        createdAt: formatDate(company.createdAt),
        updatedAt: formatDate(company.updatedAt),
      };
    }),
  );

  return rows;
}

async function getOrganization(companyId: string): Promise<OrganizationDetail> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      slug: true,
      tenantStatus: true,
      isProvisioned: true,
      suspendedAt: true,
      disabledAt: true,
      payrollCycle: true,
      goldPayoutCycle: true,
      cashDisbursementOnly: true,
      autoGeneratePayrollPeriods: true,
      autoGenerateGoldPayoutPeriods: true,
      periodGenerationHorizon: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!company) throw new Error(`Organization not found for id: ${companyId}`);

  const [siteCount, activeSiteCount, userCount, activeUserCount] = await Promise.all([
    prisma.site.count({ where: { companyId } }),
    prisma.site.count({ where: { companyId, isActive: true } }),
    prisma.user.count({ where: { companyId } }),
    prisma.user.count({ where: { companyId, isActive: true } }),
  ]);

  return {
    ...company,
    tenantStatus: company.tenantStatus as OrganizationStatus,
    createdAt: formatDate(company.createdAt),
    updatedAt: formatDate(company.updatedAt),
    suspendedAt: formatDate(company.suspendedAt),
    disabledAt: formatDate(company.disabledAt),
    counts: { sites: siteCount, activeSites: activeSiteCount, users: userCount, activeUsers: activeUserCount },
  };
}

async function provisionOrganization(input: ProvisionOrganizationInput): Promise<OrganizationProvisionResult> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Organization name cannot be empty.");
  const slug = slugify(input.slug || name);
  if (!slug) throw new Error("Invalid organization slug.");
  const adminEmail = normalizeEmail(input.adminEmail, "admin email");
  const adminName = String(input.adminName || "").trim();
  if (!adminName) throw new Error("Admin name cannot be empty.");
  if (String(input.adminPassword || "").length < 8) throw new Error("Admin password must be at least 8 characters.");

  const existingSlug = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
  if (existingSlug) throw new Error(`Slug already exists: ${slug}`);
  const existingEmail = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
  if (existingEmail) throw new Error(`User email already exists: ${adminEmail}`);

  const plan = await ensureDefaultPlan();
  const passwordHash = await bcrypt.hash(input.adminPassword, 12);

  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name, slug, tenantStatus: "ACTIVE", isProvisioned: true },
      select: { id: true, name: true, slug: true, tenantStatus: true, isProvisioned: true },
    });

    const adminUser = await tx.user.create({
      data: { email: adminEmail, name: adminName, password: passwordHash, role: "SUPERADMIN", companyId: company.id, isActive: true },
      select: { id: true, email: true, name: true, role: true, companyId: true },
    });

    const subscription = await tx.companySubscription.create({
      data: { companyId: company.id, planId: plan.id, status: "ACTIVE", startedAt: new Date(), currentPeriodStart: new Date() },
      select: { id: true, status: true, startedAt: true },
    });

    const event = await tx.provisioningEvent.create({
      data: {
        companyId: company.id,
        eventType: "ORG_PROVISIONED",
        status: "SUCCESS",
        message: "Organization provisioned via Ink TUI",
        payloadJson: JSON.stringify({ actor: input.actor, adminUserId: adminUser.id, planCode: plan.code }),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
      select: { id: true },
    });

    return { company, adminUser, subscription, event };
  });

  return {
    company: {
      ...result.company,
      tenantStatus: result.company.tenantStatus as OrganizationStatus,
    },
    adminUser: {
      ...result.adminUser,
      role: result.adminUser.role as AdminRole,
    },
    subscription: {
      id: result.subscription.id,
      status: result.subscription.status as SubscriptionStatusValue,
      startedAt: formatDate(result.subscription.startedAt),
      planCode: plan.code,
    },
    auditEventId: result.event.id,
  };
}

async function setOrganizationStatus(args: {
  companyId: string;
  actor: string;
  reason?: string;
  targetStatus: "ACTIVE" | "SUSPENDED" | "DISABLED";
}): Promise<OrganizationStatusResult> {
  const before = await getOrganization(args.companyId);
  const activate = args.targetStatus === "ACTIVE";

  const [, usersResult, sitesResult] = await prisma.$transaction([
    prisma.company.update({
      where: { id: args.companyId },
      data: {
        tenantStatus: args.targetStatus,
        isProvisioned: true,
        suspendedAt: args.targetStatus === "SUSPENDED" ? new Date() : null,
        disabledAt: args.targetStatus === "DISABLED" ? new Date() : null,
      },
    }),
    prisma.user.updateMany({ where: { companyId: args.companyId, isActive: !activate }, data: { isActive: activate } }),
    prisma.site.updateMany({ where: { companyId: args.companyId, isActive: !activate }, data: { isActive: activate } }),
  ]);

  const after = await getOrganization(args.companyId);
  const action = args.targetStatus === "ACTIVE" ? "ORG_ACTIVATE" : args.targetStatus === "DISABLED" ? "ORG_DISABLE" : "ORG_SUSPEND";

  const audit = await appendAuditEvent({
    actor: args.actor,
    action,
    entityType: "organization",
    entityId: args.companyId,
    companyId: args.companyId,
    reason: args.reason ?? null,
    before: { status: before.tenantStatus, counts: before.counts },
    after: { status: after.tenantStatus, counts: after.counts },
    metadata: { usersChanged: usersResult.count, sitesChanged: sitesResult.count },
  });

  return {
    organizationId: args.companyId,
    organizationName: after.name,
    beforeStatus: before.tenantStatus,
    afterStatus: after.tenantStatus,
    usersChanged: usersResult.count,
    sitesChanged: sitesResult.count,
    auditEventId: audit.id,
  };
}

function mapSubscription(row: {
  id: string;
  companyId: string;
  status: string;
  startedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  updatedAt: Date;
  company?: { name: string; slug: string } | null;
  plan?: { code: string; name: string } | null;
}): SubscriptionSummary {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    companySlug: row.company?.slug ?? null,
    status: row.status as SubscriptionStatusValue,
    planCode: row.plan?.code ?? null,
    planName: row.plan?.name ?? null,
    startedAt: formatDate(row.startedAt),
    currentPeriodStart: formatDate(row.currentPeriodStart),
    currentPeriodEnd: formatDate(row.currentPeriodEnd),
    trialEndsAt: formatDate(row.trialEndsAt),
    canceledAt: formatDate(row.canceledAt),
    endedAt: formatDate(row.endedAt),
    updatedAt: formatDate(row.updatedAt),
  };
}

async function listSubscriptions(input?: ListSubscriptionsInput): Promise<SubscriptionSummary[]> {
  const where: Prisma.CompanySubscriptionWhereInput = {};
  if (input?.companyId) where.companyId = input.companyId;
  if (input?.status) where.status = normalizeEnum(input.status, "status", SUBSCRIPTION_STATUSES);

  const rows = await prisma.companySubscription.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      status: true,
      startedAt: true,
      trialEndsAt: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      canceledAt: true,
      endedAt: true,
      updatedAt: true,
      company: { select: { name: true, slug: true } },
      plan: { select: { code: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: input?.limit ?? 100,
    skip: input?.skip ?? 0,
  });

  return rows.map(mapSubscription);
}

async function setSubscriptionStatus(input: SetSubscriptionStatusInput): Promise<SubscriptionStatusResult> {
  const status = normalizeEnum(input.status, "status", SUBSCRIPTION_STATUSES);
  const company = await prisma.company.findUnique({ where: { id: input.companyId }, select: { id: true, name: true, slug: true } });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);
  const plan = await ensureDefaultPlan();

  const before = await prisma.companySubscription.findFirst({
    where: { companyId: input.companyId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, companyId: true, status: true, startedAt: true, trialEndsAt: true, currentPeriodStart: true, currentPeriodEnd: true,
      canceledAt: true, endedAt: true, updatedAt: true, company: { select: { name: true, slug: true } }, plan: { select: { code: true, name: true } },
    },
  });

  const now = new Date();
  const after = before
    ? await prisma.companySubscription.update({
        where: { id: before.id },
        data: {
          status,
          currentPeriodStart: now,
          currentPeriodEnd: null,
          canceledAt: status === "CANCELED" ? now : null,
          endedAt: status === "EXPIRED" ? now : null,
        },
        select: {
          id: true, companyId: true, status: true, startedAt: true, trialEndsAt: true, currentPeriodStart: true, currentPeriodEnd: true,
          canceledAt: true, endedAt: true, updatedAt: true, company: { select: { name: true, slug: true } }, plan: { select: { code: true, name: true } },
        },
      })
    : await prisma.companySubscription.create({
        data: { companyId: input.companyId, planId: plan.id, status, startedAt: now, currentPeriodStart: now },
        select: {
          id: true, companyId: true, status: true, startedAt: true, trialEndsAt: true, currentPeriodStart: true, currentPeriodEnd: true,
          canceledAt: true, endedAt: true, updatedAt: true, company: { select: { name: true, slug: true } }, plan: { select: { code: true, name: true } },
        },
      });

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "SUBSCRIPTION_SET_STATUS",
    entityType: "subscription",
    entityId: input.companyId,
    companyId: input.companyId,
    reason: input.reason ?? null,
    before: before ? mapSubscription(before) : null,
    after: mapSubscription(after),
  });

  return {
    companyId: input.companyId,
    companyName: company.name,
    companySlug: company.slug,
    beforeStatus: before ? (before.status as SubscriptionStatusValue) : null,
    afterStatus: after.status as SubscriptionStatusValue,
    auditEventId: audit.id,
  };
}

function normalizeTemplateApplyMode(mode: string | undefined): "ADDITIVE" | "REPLACE" {
  const normalized = String(mode || "ADDITIVE").trim().toUpperCase();
  return normalized === "REPLACE" ? "REPLACE" : "ADDITIVE";
}

async function listClientTemplates(): Promise<ClientTemplateSummary[]> {
  return CLIENT_BUNDLE_TEMPLATES.map((template) => ({
    code: template.code,
    label: template.label,
    description: template.description,
    targetClients: [...template.targetClients],
    recommendedTierCode: template.recommendedTierCode,
    bundleCodes: getClientTemplateBundleCodes(template.code),
    featureCount: getClientTemplateFeatureKeys(template.code, template.recommendedTierCode).length,
    includeAllFeatures: template.includeAllFeatures === true,
  }));
}

async function applyClientTemplate(input: ApplySubscriptionTemplateInput): Promise<ApplySubscriptionTemplateResult> {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  const template = getClientTemplateDefinition(input.templateCode);
  if (!template) {
    throw new Error(`Unknown template code: ${input.templateCode}`);
  }
  const applyMode = normalizeTemplateApplyMode(input.mode);
  const tierCode = String(input.tierCode || template.recommendedTierCode || "").trim().toUpperCase();
  if (!tierCode) throw new Error(`Template ${template.code} does not define a tier.`);

  const bundleCodes = getClientTemplateBundleCodes(template.code);
  const featureKeys = getClientTemplateFeatureKeys(template.code, tierCode);

  const beforeSubscription = await prisma.companySubscription.findFirst({
    where: { companyId: input.companyId },
    include: { plan: { select: { code: true } } },
    orderBy: [{ updatedAt: "desc" }],
  });
  const beforePlanCode = beforeSubscription?.plan?.code ?? null;

  const addonRowsBefore = await prisma.companySubscriptionAddon.findMany({
    where: { companyId: input.companyId },
    include: { bundle: { select: { code: true } } },
  });
  const beforeAddonState = new Map(addonRowsBefore.map((row) => [row.bundle.code, row.isEnabled]));

  const tierResult = await assignTier({
    companyId: input.companyId,
    tierCode,
    actor: input.actor,
    reason: input.reason ?? `Template ${template.code} applied`,
  });

  const enabledBundles: string[] = [];
  const disabledBundles: string[] = [];

  if (applyMode === "REPLACE") {
    for (const addon of addonRowsBefore) {
      if (!addon.isEnabled) continue;
      if (bundleCodes.includes(addon.bundle.code)) continue;
      const result = await setAddOnBundle({
        companyId: input.companyId,
        bundleCode: addon.bundle.code,
        enabled: false,
        actor: input.actor,
        reason: input.reason ?? `Template ${template.code} replace mode`,
      });
      if (!result.enabled) {
        disabledBundles.push(addon.bundle.code);
      }
    }
  }

  for (const bundleCode of bundleCodes) {
    const result = await setAddOnBundle({
      companyId: input.companyId,
      bundleCode,
      enabled: true,
      actor: input.actor,
      reason: input.reason ?? `Template ${template.code} applied`,
    });
    if (result.enabled && beforeAddonState.get(bundleCode) !== true) {
      enabledBundles.push(bundleCode);
    }
  }

  const enabledFeatures: string[] = [];
  for (const featureKey of featureKeys) {
    const result = await setFeature({
      companyId: input.companyId,
      featureKey,
      enabled: true,
      actor: input.actor,
      reason: input.reason ?? `Template ${template.code} applied`,
    });
    if (result.enabled) {
      enabledFeatures.push(result.feature);
    }
  }

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "SUBSCRIPTION_APPLY_TEMPLATE",
    entityType: "subscription_template",
    entityId: `${input.companyId}:${template.code}`,
    companyId: input.companyId,
    reason: input.reason ?? `Applied template ${template.code}`,
    before: {
      planCode: beforePlanCode,
      enabledAddonCodes: addonRowsBefore.filter((row) => row.isEnabled).map((row) => row.bundle.code),
    },
    after: {
      planCode: tierResult.afterPlanCode,
      applyMode,
      templateCode: template.code,
      enabledBundles,
      disabledBundles,
      enabledFeatureCount: enabledFeatures.length,
    },
  });

  return {
    companyId: company.id,
    companyName: company.name,
    companySlug: company.slug,
    templateCode: template.code,
    templateLabel: template.label,
    applyMode,
    beforePlanCode,
    afterPlanCode: tierResult.afterPlanCode,
    enabledBundles,
    disabledBundles,
    enabledFeatures,
    auditEventId: audit.id,
  };
}

async function listSubscriptionBundleCatalog(): Promise<BundleCatalogSummary[]> {
  return listBundleCatalog();
}

async function upsertSubscriptionBundleCatalog(input: UpsertBundleCatalogInput): Promise<BundleCatalogSummary> {
  return upsertBundleCatalog(input);
}

async function setSubscriptionBundleFeatures(input: SetBundleFeaturesInput): Promise<BundleCatalogSummary> {
  return setBundleFeatures(input);
}

function getFeatureDefinition(featureKey: string) {
  const key = featureKey.trim().toLowerCase().replace(/\s+/g, "-");
  if (!key) throw new Error("Feature key cannot be empty.");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(key)) {
    throw new Error(`Invalid feature key: ${featureKey}`);
  }
  return {
    key,
    label: key
      .split(/[._-]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
  };
}

async function getSubscriptionEntitledFeatureSet(companyId: string): Promise<Set<string>> {
  const [subscription, enabledAddons] = await Promise.all([
    prisma.companySubscription.findFirst({
      where: { companyId },
      include: { plan: { select: { code: true } } },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.companySubscriptionAddon.findMany({
      where: { companyId, isEnabled: true },
      include: { bundle: { select: { code: true } } },
    }),
  ]);

  const tier = getTierDefinition(subscription?.plan?.code);
  const entitled = new Set<string>();
  for (const key of tier?.includedFeatures ?? []) {
    entitled.add(String(key || "").trim().toLowerCase());
  }

  const tierBundleFeatures = await getBundleFeatureKeysByCodes(tier?.includedBundles ?? []);
  for (const key of tierBundleFeatures) entitled.add(key);

  const addonBundleCodes = enabledAddons.map((row) => row.bundle.code);
  const addonBundleFeatures = await getBundleFeatureKeysByCodes(addonBundleCodes);
  for (const key of addonBundleFeatures) entitled.add(key);

  return entitled;
}

async function listFeatures(input?: ListFeaturesInput): Promise<FeatureSummary[]> {
  const features = await prisma.platformFeature.findMany({
    select: { id: true, key: true, name: true, defaultEnabled: true, isBillable: true, isActive: true, updatedAt: true },
    orderBy: { key: "asc" },
  });

  if (!input?.companyId) {
    return features.map((feature) => ({
      feature: feature.key,
      featureLabel: feature.name,
      platformActive: feature.isActive,
      enabled: false,
      reason: null,
      updatedAt: formatDate(feature.updatedAt),
    }));
  }

  const flags = await prisma.companyFeatureFlag.findMany({
    where: {
      companyId: input.companyId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { featureId: true, isEnabled: true, reason: true, updatedAt: true },
  });
  const flagByFeatureId = new Map(flags.map((flag) => [flag.featureId, flag]));
  const entitledBySubscription = await getSubscriptionEntitledFeatureSet(input.companyId);

  return features.map((feature) => {
    const flag = flagByFeatureId.get(feature.id);
    const normalizedKey = feature.key.trim().toLowerCase();
    const subscriptionEntitled = entitledBySubscription.has(normalizedKey);
    const requested = flag ? flag.isEnabled : feature.defaultEnabled;
    const effectiveEnabled = feature.isBillable ? (subscriptionEntitled ? requested : false) : requested;
    const restrictionReason = feature.isBillable && !subscriptionEntitled
      ? "Not included in active tier/add-ons."
      : null;
    return {
      feature: feature.key,
      featureLabel: feature.name,
      platformActive: feature.isActive,
      enabled: effectiveEnabled,
      reason: restrictionReason ? (flag?.reason ? `${flag.reason} | ${restrictionReason}` : restrictionReason) : (flag?.reason ?? null),
      updatedAt: formatDate(flag?.updatedAt ?? feature.updatedAt),
    };
  });
}

async function setFeature(input: SetFeatureInput): Promise<FeatureSetResult> {
  const definition = getFeatureDefinition(input.featureKey);
  const company = await prisma.company.findUnique({ where: { id: input.companyId }, select: { id: true, name: true } });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  const feature = await prisma.platformFeature.upsert({
    where: { key: definition.key },
    update: { name: definition.label, isActive: true },
    create: { key: definition.key, name: definition.label, description: `Feature flag for ${definition.key}`, isActive: true },
    select: { id: true, key: true, isBillable: true },
  });

  if (input.enabled && feature.isBillable) {
    const entitledBySubscription = await getSubscriptionEntitledFeatureSet(input.companyId);
    if (!entitledBySubscription.has(feature.key.toLowerCase())) {
      const suggestedBundles = (
        await prisma.featureBundle.findMany({
          where: {
            isActive: true,
            items: {
              some: {
                feature: {
                  key: feature.key,
                },
              },
            },
          },
          select: { code: true },
          orderBy: [{ code: "asc" }],
        })
      ).map((bundle) => bundle.code);
      const bundleHint = suggestedBundles.length > 0
        ? ` Enable an add-on bundle first: ${suggestedBundles.join(", ")}.`
        : "";
      throw new Error(
        `Cannot enable "${feature.key}" because it is not included in the company's active tier/add-ons.${bundleHint}`,
      );
    }
  }

  const before = await prisma.companyFeatureFlag.findUnique({
    where: { companyId_featureId: { companyId: input.companyId, featureId: feature.id } },
    select: { isEnabled: true, reason: true },
  });

  const after = await prisma.companyFeatureFlag.upsert({
    where: { companyId_featureId: { companyId: input.companyId, featureId: feature.id } },
    update: { isEnabled: input.enabled, reason: input.reason ?? null },
    create: { companyId: input.companyId, featureId: feature.id, isEnabled: input.enabled, reason: input.reason ?? null },
    select: { isEnabled: true, reason: true },
  });

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "FEATURE_SET",
    entityType: "feature",
    entityId: `${input.companyId}:${definition.key}`,
    companyId: input.companyId,
    reason: input.reason ?? null,
    before: { enabled: before?.isEnabled ?? null, reason: before?.reason ?? null },
    after: { enabled: after.isEnabled, reason: after.reason ?? null },
  });

  return {
    companyId: input.companyId,
    companyName: company.name,
    feature: definition.key,
    featureLabel: definition.label,
    enabled: after.isEnabled,
    reason: after.reason ?? null,
    auditEventId: audit.id,
  };
}

async function listAdmins(input?: ListAdminsInput): Promise<AdminSummary[]> {
  const where: Prisma.UserWhereInput = { role: { in: [...ADMIN_ROLES] } };
  if (input?.companyId) where.companyId = input.companyId;
  if (input?.status) {
    where.isActive = normalizeEnum(input.status, "status", ADMIN_ACCOUNT_STATUSES) === "ACTIVE";
  }
  const search = input?.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { id: search },
    ];
  }

  const rows = await prisma.user.findMany({
    where,
    select: {
      id: true, email: true, name: true, role: true, isActive: true, companyId: true, createdAt: true, updatedAt: true,
      company: { select: { name: true } },
    },
    orderBy: [{ companyId: "asc" }, { name: "asc" }],
    take: input?.limit ?? 100,
    skip: input?.skip ?? 0,
  });

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as AdminRole,
    isActive: row.isActive,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt),
  }));
}

async function createAdmin(input: CreateAdminInput): Promise<AdminCreateResult> {
  const company = await prisma.company.findUnique({ where: { id: input.companyId }, select: { id: true, name: true } });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);
  const email = normalizeEmail(input.email);
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Admin name cannot be empty.");
  const role = normalizeEnum(input.role || "SUPERADMIN", "role", ADMIN_ROLES);
  if (String(input.password || "").length < 8) throw new Error("Password must be at least 8 characters.");

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new Error(`User already exists for email: ${email}`);

  const password = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { companyId: input.companyId, email, name, password, role, isActive: true },
    select: { id: true, companyId: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "ADMIN_CREATE",
    entityType: "admin",
    entityId: user.id,
    companyId: input.companyId,
    reason: `Created admin ${user.email}`,
    after: { role: user.role, isActive: user.isActive },
  });

  return {
    id: user.id,
    companyId: user.companyId,
    companyName: company.name,
    email: user.email,
    name: user.name,
    role: user.role as AdminRole,
    isActive: user.isActive,
    createdAt: formatDate(user.createdAt),
    auditEventId: audit.id,
  };
}

async function setAdminStatus(input: SetAdminStatusInput & { isActive: boolean }): Promise<AdminStatusResult> {
  const before = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true, companyId: true, company: { select: { name: true } } },
  });
  if (!before) throw new Error(`Admin user not found for id: ${input.userId}`);
  if (!ADMIN_ROLES.includes(before.role as AdminRole)) throw new Error(`User ${before.email} has role ${before.role}, not admin role.`);
  if (!input.isActive && before.role === "SUPERADMIN" && before.isActive) {
    const activeSuperadminCount = await prisma.user.count({
      where: { companyId: before.companyId, role: "SUPERADMIN", isActive: true },
    });
    if (activeSuperadminCount <= 1) {
      throw new Error(
        `Guardrail: cannot deactivate ${before.email} because this would leave company ${before.companyId} without an active SUPERADMIN.`,
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: { isActive: input.isActive },
    select: { id: true, email: true, name: true, role: true, isActive: true, companyId: true, company: { select: { name: true } }, updatedAt: true },
  });

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: input.isActive ? "ADMIN_ACTIVATE" : "ADMIN_DEACTIVATE",
    entityType: "admin",
    entityId: input.userId,
    companyId: updated.companyId,
    reason: input.reason ?? null,
    before: { isActive: before.isActive },
    after: { isActive: updated.isActive },
  });

  return {
    adminId: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role as AdminRole,
    isActive: updated.isActive,
    companyId: updated.companyId,
    companyName: updated.company.name,
    updatedAt: formatDate(updated.updatedAt),
    auditEventId: audit.id,
  };
}

async function resetAdminPassword(input: ResetAdminPasswordInput): Promise<AdminResetPasswordResult> {
  if (String(input.newPassword || "").length < 8) throw new Error("New password must be at least 8 characters.");
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, role: true, companyId: true, company: { select: { name: true } } },
  });
  if (!user) throw new Error(`Admin user not found for id: ${input.userId}`);
  if (!ADMIN_ROLES.includes(user.role as AdminRole)) throw new Error(`User ${user.email} has role ${user.role}, not admin role.`);

  const password = await bcrypt.hash(input.newPassword, 12);
  const updated = await prisma.user.update({ where: { id: input.userId }, data: { password }, select: { updatedAt: true } });

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "ADMIN_RESET_PASSWORD",
    entityType: "admin",
    entityId: user.id,
    companyId: user.companyId,
    reason: input.reason ?? "Password reset via Ink TUI",
  });

  return {
    adminId: user.id,
    email: user.email,
    role: user.role as AdminRole,
    companyId: user.companyId,
    companyName: user.company.name,
    updatedAt: formatDate(updated.updatedAt),
    auditEventId: audit.id,
  };
}

async function listAuditEvents(input?: ListAuditEventsInput): Promise<AuditEventRecord[]> {
  return listLedgerAuditEvents(input);
}

async function addAuditNote(input: AddAuditNoteInput): Promise<AuditEventRecord> {
  const message = String(input.message || "").trim();
  if (!message) throw new Error("Audit note message cannot be empty.");
  if (!input.companyId) throw new Error("Audit note requires companyId.");
  const company = await prisma.company.findUnique({ where: { id: input.companyId }, select: { id: true } });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  return appendAuditEvent({
    actor: input.actor,
    action: "AUDIT_NOTE",
    entityType: "audit",
    entityId: input.companyId,
    companyId: input.companyId,
    reason: message,
    metadata: { message },
  });
}

export function createPlatformServices(): PlatformServices {
  return {
    org: {
      list: listOrganizations,
      resolve: resolveOrganizations,
      detail: getOrganization,
      provision: (input) => toMutation(() => provisionOrganization(input)),
      previewProvisionBundle: (input) => toMutation(() => previewProvisionBundle(input)),
      provisionBundle: (input) => toMutation(() => provisionBundle(input)),
      suggestSubdomains,
      reserveSubdomain: (input) => toMutation(() => reserveOrgSubdomain(input)),
      getSubdomainReservation: getOrgSubdomainReservation,
      suspend: (input) => toMutation(() => setOrganizationStatus({ ...input, targetStatus: "SUSPENDED" })),
      activate: (input) => toMutation(() => setOrganizationStatus({ ...input, targetStatus: "ACTIVE" })),
      disable: (input) => toMutation(() => setOrganizationStatus({ ...input, targetStatus: "DISABLED" })),
    },
    subscription: {
      list: listSubscriptions,
      setStatus: (input) => toMutation(() => setSubscriptionStatus(input)),
      listPlans: listTierPlans,
      assignTier: (input) => toMutation(() => assignTier(input as AssignSubscriptionTierInput)),
      listTemplates: listClientTemplates,
      applyTemplate: (input) => toMutation(() => applyClientTemplate(input as ApplySubscriptionTemplateInput)),
      listBundleCatalog: listSubscriptionBundleCatalog,
      upsertBundleCatalog: (input) => toMutation(() => upsertSubscriptionBundleCatalog(input as UpsertBundleCatalogInput)),
      setBundleFeatures: (input) => toMutation(() => setSubscriptionBundleFeatures(input as SetBundleFeaturesInput)),
      listAddons: (input) => listAddOnBundles((input as ListAddonsInput).companyId),
      setAddon: (input) => toMutation(() => setAddOnBundle(input as SetAddonInput)),
      recomputePricing: (companyId) => toMutation(() => recomputeSubscriptionPricing(companyId) as Promise<SubscriptionPricingSummary>),
      health: (companyId) => getSubscriptionHealthSummary(companyId) as Promise<SubscriptionHealthSummary>,
      syncCatalog: (actor: string) => {
        void actor;
        return toMutation(() => syncCommercialCatalog());
      },
    },
    feature: {
      list: listFeatures,
      set: (input) => toMutation(() => setFeature(input)),
    },
    admin: {
      list: listAdmins,
      create: (input) => toMutation(() => createAdmin(input)),
      activate: (input) => toMutation(() => setAdminStatus({ ...input, isActive: true })),
      deactivate: (input) => toMutation(() => setAdminStatus({ ...input, isActive: false })),
      resetPassword: (input) => toMutation(() => resetAdminPassword(input)),
    },
    user: {
      list: listUsers,
      create: (input) => toMutation(() => createUser(input)),
      activate: (input) => toMutation(() => setUserStatus({ ...input, isActive: true })),
      deactivate: (input) => toMutation(() => setUserStatus({ ...input, isActive: false })),
      resetPassword: (input) => toMutation(() => resetUserPassword(input)),
      changeRole: (input) => toMutation(() => changeUserRole(input)),
    },
    audit: {
      list: listAuditEvents,
      addNote: (input) => toMutation(() => addAuditNote(input)),
      export: (input) => toMutation(() => exportAudit(input)),
      verifyChain: (companyId?: string) => toMutation(() => verifyAuditChain(companyId)),
    },
    support: {
      listRequests: listSupportRequests,
      listSessions: listSupportSessions,
      requestAccess: (input) => toMutation(() => requestSupportAccess(input)),
      approveRequest: (input) => toMutation(() => approveSupportAccess(input)),
      startSession: (input) => toMutation(() => startSupportSession(input)),
      endSession: (input) => toMutation(() => endSupportSession(input)),
      expireSessions: (nowIso?: string) => toMutation(() => expireSupportSessions(nowIso)),
    },
    runbook: {
      listDefinitions: listRunbookDefinitions,
      upsertDefinition: (input) => toMutation(() => upsertRunbookDefinition(input)),
      listExecutions: listRunbookExecutions,
      execute: (input) => toMutation(() => executeRunbook(input)),
      setEnabled: (id, enabled, actor) => toMutation(() => setRunbookEnabled(id, enabled, actor)),
    },
    health: {
      recordMetric: (input) => toMutation(() => recordMetric(input)),
      listMetrics,
      listIncidents: listHealthIncidents,
      triggerRemediation: (input) => toMutation(() => triggerRemediation(input)),
    },
    contract: {
      evaluate: (input) => toMutation(() => evaluateContract(input)),
      enforce: (input) => toMutation(() => enforceContract(input)),
      override: (input) => toMutation(() => overrideContract(input)),
      getState: getContractState,
    },
    search: {
      global: searchGlobal,
    },
    disconnect: disconnectPrisma,
  };
}
