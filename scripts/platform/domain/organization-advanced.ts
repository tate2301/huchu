import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import type {
  AdminRole,
  OrganizationResolveItem,
  OrganizationStatus,
  ProvisionBundleInput,
  ProvisionBundlePreview,
  ProvisionBundleResult,
  SubdomainReservationRecord,
  SubdomainSuggestion,
  SubscriptionStatusValue,
} from "../types";
import { appendAuditEvent } from "./audit-ledger";
import { formatDate, normalizeEmail, slugify } from "./helpers";

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "admin",
  "root",
  "platform",
  "support",
  "status",
  "mail",
  "ftp",
]);

const FEATURE_TEMPLATES: Record<string, string[]> = {
  BASE: ["core-access", "audit-log"],
  GOLD: ["core-access", "audit-log", "gold-ledger", "gold-reconciliation"],
  FULL: ["core-access", "audit-log", "gold-ledger", "gold-reconciliation", "advanced-analytics"],
};

function isUniqueConstraint(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (error.code !== "P2002") {
    return false;
  }
  if (!field) return true;
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes(field);
  }
  return String(target ?? "").includes(field);
}

async function throwFriendlySubdomainConflict(subdomain: string): Promise<never> {
  const suggestions = await suggestSubdomains(subdomain, 5);
  const available = suggestions
    .filter((row) => row.available)
    .map((row) => row.candidate)
    .slice(0, 3);
  if (available.length > 0) {
    throw new Error(`Subdomain "${subdomain}" was just taken. Try: ${available.join(", ")}`);
  }
  throw new Error(`Subdomain "${subdomain}" is unavailable. Please choose a different subdomain.`);
}

function normalizeSubdomain(value: string): string {
  const normalized = slugify(value);
  if (!normalized || normalized.length < 3) {
    throw new Error("Subdomain must be at least 3 characters.");
  }
  if (normalized.length > 63) {
    throw new Error("Subdomain cannot exceed 63 characters.");
  }
  if (RESERVED_SUBDOMAINS.has(normalized)) {
    throw new Error(`Subdomain "${normalized}" is reserved.`);
  }
  return normalized;
}

async function ensurePlan(code = "CUSTOM") {
  return prisma.subscriptionPlan.upsert({
    where: { code },
    update: { isActive: true },
    create: {
      code,
      name: code === "CUSTOM" ? "Custom" : code,
      description: code === "CUSTOM" ? "Default manually managed plan" : `${code} tier`,
      monthlyPrice: 0,
      annualPrice: 0,
      currency: "USD",
      isActive: true,
    },
    select: { id: true, code: true, name: true },
  });
}

export async function resolveOrganizations(query: string, limit = 12): Promise<OrganizationResolveItem[]> {
  const value = query.trim();
  if (!value) return [];
  const rows = await prisma.company.findMany({
    where: {
      OR: [{ id: value }, { slug: { contains: value, mode: "insensitive" } }, { name: { contains: value, mode: "insensitive" } }],
    },
    select: { id: true, name: true, slug: true, tenantStatus: true },
    orderBy: [{ name: "asc" }],
    take: limit,
  });
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug, status: row.tenantStatus as OrganizationStatus }));
}

async function isSubdomainAvailable(candidate: string, excludeCompanyId?: string): Promise<{ available: boolean; reason: string | null }> {
  const subdomain = normalizeSubdomain(candidate);
  const row = await prisma.subdomainReservation.findFirst({
    where: {
      subdomain,
      status: { in: ["RESERVED", "ACTIVE"] },
      ...(excludeCompanyId ? { companyId: { not: excludeCompanyId } } : {}),
    },
    select: { id: true },
  });
  if (row) return { available: false, reason: "already reserved" };
  return { available: true, reason: null };
}

function buildSuggestions(seed: string, limit = 6): string[] {
  const sub = normalizeSubdomain(seed);
  const candidates = [sub, `${sub}-mine`, `${sub}-zw`];
  for (let i = 2; i < limit + 2; i += 1) {
    candidates.push(`${sub}-${i}`);
  }
  return [...new Set(candidates)].slice(0, limit);
}

function mapReservation(row: {
  companyId: string;
  subdomain: string;
  status: string;
  provider: string;
  providerRef: string | null;
  reservedAt: Date;
  activatedAt: Date | null;
  releasedAt: Date | null;
  updatedAt: Date;
  company?: { name: string; slug: string } | null;
}): SubdomainReservationRecord {
  return {
    companyId: row.companyId,
    companyName: row.company?.name ?? "",
    companySlug: row.company?.slug ?? "",
    subdomain: row.subdomain,
    status: row.status as "RESERVED" | "ACTIVE" | "RELEASED",
    provider: row.provider,
    providerReference: row.providerRef ?? null,
    reservedAt: formatDate(row.reservedAt),
    activatedAt: formatDate(row.activatedAt),
    releasedAt: formatDate(row.releasedAt),
    updatedAt: formatDate(row.updatedAt),
  };
}

async function reserveSubdomainRecord(
  tx: Prisma.TransactionClient,
  companyId: string,
  subdomain: string,
) {
  const existing = await tx.subdomainReservation.findUnique({
    where: { subdomain },
    select: { companyId: true, status: true },
  });
  if (
    existing &&
    existing.companyId !== companyId &&
    (existing.status === "RESERVED" || existing.status === "ACTIVE")
  ) {
    throw new Error(`Subdomain "${subdomain}" is unavailable (already reserved).`);
  }

  const now = new Date();
  return tx.subdomainReservation.upsert({
    where: { subdomain },
    update: {
      companyId,
      status: "RESERVED",
      provider: "registry-stub",
      providerRef: `stub:${subdomain}`,
      reservedAt: now,
      releasedAt: null,
      activatedAt: null,
      lastCheckedAt: now,
    },
    create: {
      companyId,
      subdomain,
      status: "RESERVED",
      provider: "registry-stub",
      providerRef: `stub:${subdomain}`,
      reservedAt: now,
      lastCheckedAt: now,
    },
    include: { company: { select: { name: true, slug: true } } },
  });
}

function actionPreview(preview: ProvisionBundlePreview): string {
  return JSON.stringify(
    {
      action: "org.provision.bundle",
      input: {
        organizationName: preview.organizationName,
        organizationSlug: preview.organizationSlug,
        adminEmail: preview.adminEmail,
        adminName: preview.adminName,
        tierCode: preview.tierCode,
        featureTemplate: preview.featureTemplate,
        subdomain: preview.subdomainCandidate,
      },
    },
    null,
    2,
  );
}

function featureList(template: string): string[] {
  const normalized = template.trim().toUpperCase();
  return FEATURE_TEMPLATES[normalized] ?? FEATURE_TEMPLATES.BASE;
}

export async function suggestSubdomains(seed: string, limit = 6): Promise<SubdomainSuggestion[]> {
  const candidates = buildSuggestions(seed, limit);
  const checks = await Promise.all(
    candidates.map(async (candidate) => {
      const result = await isSubdomainAvailable(candidate);
      return {
        candidate,
        available: result.available,
        reason: result.reason,
      };
    }),
  );
  return checks;
}

export async function getSubdomainReservation(companyId: string): Promise<SubdomainReservationRecord | null> {
  const row = await prisma.subdomainReservation.findFirst({
    where: { companyId, status: { in: ["RESERVED", "ACTIVE"] } },
    include: { company: { select: { name: true, slug: true } } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  if (!row) return null;
  return mapReservation(row);
}

export async function reserveSubdomain(input: {
  companyId: string;
  subdomain: string;
  actor: string;
  reason?: string;
}): Promise<SubdomainReservationRecord> {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  const subdomain = normalizeSubdomain(input.subdomain);
  const check = await isSubdomainAvailable(subdomain, input.companyId);
  if (!check.available) {
    await throwFriendlySubdomainConflict(subdomain);
  }

  let row: Awaited<ReturnType<typeof prisma.subdomainReservation.create>>;
  try {
    row = await prisma.$transaction(async (tx) => {
      await tx.subdomainReservation.updateMany({
        where: { companyId: input.companyId, status: { in: ["RESERVED", "ACTIVE"] } },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
      return reserveSubdomainRecord(tx, input.companyId, subdomain);
    });
  } catch (error) {
    if (isUniqueConstraint(error, "subdomain")) {
      await throwFriendlySubdomainConflict(subdomain);
    }
    throw error;
  }

  const mapped = mapReservation(row);
  await appendAuditEvent({
    actor: input.actor,
    action: "SUBDOMAIN_RESERVED",
    entityType: "subdomain",
    entityId: subdomain,
    companyId: input.companyId,
    reason: input.reason ?? `Reserved ${subdomain}`,
    after: mapped,
  });
  return {
    ...mapped,
    companyName: company.name,
    companySlug: company.slug,
  };
}

export async function previewProvisionBundle(input: ProvisionBundleInput): Promise<ProvisionBundlePreview> {
  const organizationName = String(input.organizationName || "").trim();
  if (!organizationName) throw new Error("organizationName is required.");

  const organizationSlug = normalizeSubdomain(input.organizationSlug || organizationName);
  const adminEmail = normalizeEmail(input.adminEmail, "admin email");
  const adminName = String(input.adminName || "").trim();
  if (!adminName) throw new Error("adminName is required.");
  const tierCode = String(input.tierCode || "CUSTOM").trim().toUpperCase();
  const featureTemplate = String(input.featureTemplate || "BASE").trim().toUpperCase();
  const subdomainCandidate = normalizeSubdomain(input.subdomain || organizationSlug);

  const availability = await isSubdomainAvailable(subdomainCandidate);
  const suggestions = await suggestSubdomains(subdomainCandidate, 6);
  const featuresToEnable = featureList(featureTemplate);
  const warnings: string[] = [];
  if (!FEATURE_TEMPLATES[featureTemplate]) {
    warnings.push(`Unknown feature template "${featureTemplate}". Falling back to BASE.`);
  }
  if (!availability.available) {
    warnings.push(`Subdomain "${subdomainCandidate}" is unavailable.`);
  }

  const preview: ProvisionBundlePreview = {
    organizationName,
    organizationSlug,
    adminEmail,
    adminName,
    tierCode,
    featureTemplate,
    subdomainCandidate,
    subdomainAvailable: availability.available,
    subdomainSuggestions: suggestions,
    featuresToEnable,
    actionPreview: "",
    warnings,
  };
  preview.actionPreview = actionPreview(preview);
  return preview;
}

export async function provisionBundle(input: ProvisionBundleInput): Promise<ProvisionBundleResult> {
  const preview = await previewProvisionBundle(input);
  if (!preview.subdomainAvailable) {
    const suggested = preview.subdomainSuggestions
      .filter((row) => row.available)
      .map((row) => row.candidate)
      .slice(0, 3);
    if (suggested.length > 0) {
      throw new Error(`Subdomain "${preview.subdomainCandidate}" is unavailable. Try: ${suggested.join(", ")}`);
    }
    throw new Error(`Subdomain "${preview.subdomainCandidate}" is unavailable.`);
  }
  if (String(input.adminPassword || "").length < 8) {
    throw new Error("adminPassword must be at least 8 characters.");
  }

  const existingSlug = await prisma.company.findUnique({ where: { slug: preview.organizationSlug }, select: { id: true } });
  if (existingSlug) throw new Error(`Organization slug already exists: ${preview.organizationSlug}`);
  const existingEmail = await prisma.user.findUnique({ where: { email: preview.adminEmail }, select: { id: true } });
  if (existingEmail) throw new Error(`User email already exists: ${preview.adminEmail}`);

  const plan = await ensurePlan(preview.tierCode);
  const passwordHash = await bcrypt.hash(input.adminPassword, 12);
  const featuresToEnable = featureList(preview.featureTemplate);

  let tx: {
    company: { id: string; name: string; slug: string; tenantStatus: string; isProvisioned: boolean };
    admin: { id: string; email: string; name: string; role: string };
    subscription: { id: string; status: string };
    appliedFeatures: string[];
    reservation: Awaited<ReturnType<typeof prisma.subdomainReservation.create>>;
  };
  try {
    tx = await prisma.$transaction(async (trx) => {
      const company = await trx.company.create({
        data: {
          name: preview.organizationName,
          slug: preview.organizationSlug,
          tenantStatus: "ACTIVE",
          isProvisioned: true,
        },
        select: { id: true, name: true, slug: true, tenantStatus: true, isProvisioned: true },
      });

      const admin = await trx.user.create({
        data: {
          companyId: company.id,
          email: preview.adminEmail,
          name: preview.adminName,
          password: passwordHash,
          role: "SUPERADMIN",
          isActive: true,
        },
        select: { id: true, email: true, name: true, role: true },
      });

      const subscription = await trx.companySubscription.create({
        data: {
          companyId: company.id,
          planId: plan.id,
          status: "ACTIVE",
          startedAt: new Date(),
          currentPeriodStart: new Date(),
        },
        select: { id: true, status: true },
      });

      const appliedFeatures: string[] = [];
      for (const featureKey of featuresToEnable) {
        const key = slugify(featureKey);
        const feature = await trx.platformFeature.upsert({
          where: { key },
          update: { name: key, isActive: true },
          create: { key, name: key, description: `Feature flag for ${key}`, isActive: true },
          select: { id: true, key: true },
        });
        await trx.companyFeatureFlag.upsert({
          where: { companyId_featureId: { companyId: company.id, featureId: feature.id } },
          update: { isEnabled: true, reason: `Provision template ${preview.featureTemplate}` },
          create: {
            companyId: company.id,
            featureId: feature.id,
            isEnabled: true,
            reason: `Provision template ${preview.featureTemplate}`,
          },
        });
        appliedFeatures.push(feature.key);
      }

      const reservation = await reserveSubdomainRecord(trx, company.id, preview.subdomainCandidate);

      return { company, admin, subscription, appliedFeatures, reservation };
    });
  } catch (error) {
    if (isUniqueConstraint(error, "subdomain")) {
      await throwFriendlySubdomainConflict(preview.subdomainCandidate);
    }
    if (isUniqueConstraint(error, "slug")) {
      throw new Error(`Organization slug "${preview.organizationSlug}" already exists. Try a different slug.`);
    }
    if (isUniqueConstraint(error, "email")) {
      throw new Error(`Admin email "${preview.adminEmail}" is already in use.`);
    }
    throw error;
  }

  const events = [
    { action: "PROVISION_ORG_CREATED", entityType: "organization", entityId: tx.company.id, reason: `Created ${tx.company.slug}` },
    { action: "PROVISION_ADMIN_CREATED", entityType: "admin", entityId: tx.admin.id, reason: `Created ${tx.admin.email}` },
    { action: "PROVISION_TIER_ASSIGNED", entityType: "subscription", entityId: tx.subscription.id, reason: `Assigned tier ${plan.code}` },
    { action: "PROVISION_FEATURES_APPLIED", entityType: "feature", entityId: tx.company.id, reason: `Applied ${tx.appliedFeatures.length} features` },
    { action: "PROVISION_SUBDOMAIN_RESERVED", entityType: "subdomain", entityId: tx.reservation.subdomain, reason: `Reserved ${tx.reservation.subdomain}` },
  ];
  const auditIds: string[] = [];
  for (const event of events) {
    const audit = await appendAuditEvent({
      actor: input.actor,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      companyId: tx.company.id,
      reason: event.reason,
    });
    auditIds.push(audit.id);
  }
  const consolidated = await appendAuditEvent({
    actor: input.actor,
    action: "PROVISION_BUNDLE_COMPLETED",
    entityType: "provision",
    entityId: tx.company.id,
    companyId: tx.company.id,
    reason: input.reason ?? "Provision bundle completed",
  });
  auditIds.unshift(consolidated.id);

  return {
    organization: {
      id: tx.company.id,
      name: tx.company.name,
      slug: tx.company.slug,
      status: tx.company.tenantStatus as OrganizationStatus,
      isProvisioned: tx.company.isProvisioned,
    },
    admin: {
      id: tx.admin.id,
      email: tx.admin.email,
      name: tx.admin.name,
      role: tx.admin.role as AdminRole,
    },
    subscription: {
      id: tx.subscription.id,
      status: tx.subscription.status as SubscriptionStatusValue,
      planCode: plan.code,
      planName: plan.name,
    },
    featuresApplied: tx.appliedFeatures,
    subdomainReservation: mapReservation(tx.reservation),
    auditEventIds: auditIds,
    actionPreview: actionPreview(preview),
  };
}
