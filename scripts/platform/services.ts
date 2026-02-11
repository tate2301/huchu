import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";

import { prisma, disconnectPrisma } from "./prisma";
import {
  ADMIN_ACCOUNT_STATUSES,
  ADMIN_ROLES,
  ORGANIZATION_STATUSES,
  SUBSCRIPTION_STATUSES,
  type AddAuditNoteInput,
  type AdminCreateResult,
  type AdminResetPasswordResult,
  type AdminRole,
  type AdminStatusResult,
  type AdminSummary,
  type CreateAdminInput,
  type FeatureSetResult,
  type FeatureSummary,
  type ListAdminsInput,
  type ListAuditEventsInput,
  type ListFeaturesInput,
  type ListOrganizationsInput,
  type ListSubscriptionsInput,
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
  type SetSubscriptionStatusInput,
  type SubscriptionStatusResult,
  type SubscriptionStatusValue,
  type SubscriptionSummary,
  type AuditEventRecord,
} from "./types";

type JsonRecord = Record<string, unknown>;

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

function parsePayload(raw: string | null): JsonRecord {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as JsonRecord;
  } catch {
    return {};
  }
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
  const companyId = event.companyId ?? null;
  const payload = {
    actor: event.actor ?? null,
    action: event.action ?? null,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    reason: event.reason ?? null,
    before: event.before ?? null,
    after: event.after ?? null,
    metadata: event.metadata ?? null,
  };

  if (!companyId) {
    return {
      id: `local-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: payload.actor,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      companyId: null,
      reason: payload.reason,
      payload,
    };
  }

  const created = await prisma.provisioningEvent.create({
    data: {
      companyId,
      eventType: payload.action ?? "AUDIT_EVENT",
      status: "SUCCESS",
      message: payload.reason ?? payload.action ?? "Audit event",
      payloadJson: JSON.stringify(payload),
      startedAt: new Date(),
      finishedAt: new Date(),
    },
    select: {
      id: true,
      companyId: true,
      eventType: true,
      message: true,
      payloadJson: true,
      createdAt: true,
    },
  });

  return {
    id: created.id,
    timestamp: formatDate(created.createdAt),
    actor: payload.actor,
    action: created.eventType,
    entityType: payload.entityType,
    entityId: payload.entityId,
    companyId: created.companyId,
    reason: created.message,
    payload: parsePayload(created.payloadJson),
  };
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

function getFeatureDefinition(featureKey: string) {
  const key = featureKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!key) throw new Error("Feature key cannot be empty.");
  return {
    key,
    label: key.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
  };
}

async function listFeatures(input?: ListFeaturesInput): Promise<FeatureSummary[]> {
  const features = await prisma.platformFeature.findMany({
    select: { id: true, key: true, name: true, isActive: true, updatedAt: true },
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
    where: { companyId: input.companyId },
    select: { featureId: true, isEnabled: true, reason: true, updatedAt: true },
  });
  const flagByFeatureId = new Map(flags.map((flag) => [flag.featureId, flag]));

  return features.map((feature) => {
    const flag = flagByFeatureId.get(feature.id);
    return {
      feature: feature.key,
      featureLabel: feature.name,
      platformActive: feature.isActive,
      enabled: flag ? flag.isEnabled : false,
      reason: flag?.reason ?? null,
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
    select: { id: true },
  });

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
  const where: Prisma.ProvisioningEventWhereInput = {};
  if (input?.companyId) where.companyId = input.companyId;
  if (input?.action) where.eventType = input.action.trim().toUpperCase();

  const rows = await prisma.provisioningEvent.findMany({
    where,
    select: { id: true, companyId: true, eventType: true, message: true, payloadJson: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: input?.limit ?? 50,
  });

  const mapped = rows.map((row) => {
    const payload = parsePayload(row.payloadJson);
    return {
      id: row.id,
      timestamp: formatDate(row.createdAt),
      actor: typeof payload.actor === "string" ? payload.actor : null,
      action: row.eventType,
      entityType: typeof payload.entityType === "string" ? payload.entityType : null,
      entityId: typeof payload.entityId === "string" ? payload.entityId : null,
      companyId: row.companyId,
      reason: row.message,
      payload,
    } as AuditEventRecord;
  });

  if (!input?.actor) return mapped;
  const actorFilter = input.actor.trim().toLowerCase();
  return mapped.filter((entry) => String(entry.actor || "").toLowerCase() === actorFilter);
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
      detail: getOrganization,
      provision: (input) => toMutation(() => provisionOrganization(input)),
      suspend: (input) => toMutation(() => setOrganizationStatus({ ...input, targetStatus: "SUSPENDED" })),
      activate: (input) => toMutation(() => setOrganizationStatus({ ...input, targetStatus: "ACTIVE" })),
      disable: (input) => toMutation(() => setOrganizationStatus({ ...input, targetStatus: "DISABLED" })),
    },
    subscription: {
      list: listSubscriptions,
      setStatus: (input) => toMutation(() => setSubscriptionStatus(input)),
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
    audit: {
      list: listAuditEvents,
      addNote: (input) => toMutation(() => addAuditNote(input)),
    },
    disconnect: disconnectPrisma,
  };
}
