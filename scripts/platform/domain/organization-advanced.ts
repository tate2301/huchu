import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import { FEATURE_BUNDLES, FEATURE_CATALOG } from "../../../lib/platform/feature-catalog";
import {
  getClientTemplateBundleCodes,
  getClientTemplateDefinition,
  getClientTemplateFeatureKeys,
} from "../../../lib/platform/client-templates";
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
        bundleCodes: preview.bundleCodes,
        subdomain: preview.subdomainCandidate,
      },
    },
    null,
    2,
  );
}

function resolveTemplateSelection(featureTemplate: string, tierCodeInput?: string) {
  const warnings: string[] = [];
  const requestedTemplateCode = String(featureTemplate || "TEMPLATE_CORE_STARTER").trim().toUpperCase();
  const template =
    getClientTemplateDefinition(requestedTemplateCode) ??
    getClientTemplateDefinition("TEMPLATE_CORE_STARTER");
  if (!template) {
    throw new Error("Template catalog is unavailable.");
  }
  if (!getClientTemplateDefinition(requestedTemplateCode)) {
    warnings.push(`Unknown feature template "${requestedTemplateCode}". Falling back to ${template.code}.`);
  }

  const tierCode = String(tierCodeInput || template.recommendedTierCode || "CUSTOM")
    .trim()
    .toUpperCase();
  const bundleCodes = getClientTemplateBundleCodes(template.code);
  const featuresToEnable = getClientTemplateFeatureKeys(template.code, tierCode);

  return {
    tierCode,
    templateCode: template.code,
    templateLabel: template.label,
    bundleCodes,
    featuresToEnable,
    warnings,
  };
}

function getFeatureCatalogDefinition(featureKey: string) {
  const normalized = featureKey.trim().toLowerCase();
  return FEATURE_CATALOG.find((feature) => feature.key.toLowerCase() === normalized) ?? null;
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const PROVISION_TX_MAX_WAIT_MS = parseNumber(process.env.PRISMA_PROVISION_TX_MAX_WAIT_MS, 20000);
const PROVISION_TX_TIMEOUT_MS = parseNumber(process.env.PRISMA_PROVISION_TX_TIMEOUT_MS, 180000);
const PROVISION_TX_RETRIES = Math.max(0, parseNumber(process.env.PRISMA_PROVISION_TX_RETRIES, 2));

type FeatureRow = { id: string; key: string };
type BundleRow = { id: string; code: string };
type BundleDefinition = (typeof FEATURE_BUNDLES)[number];

interface PreparedProvisioningCatalog {
  bundleRows: BundleRow[];
  featureRowsForCompany: FeatureRow[];
}

function uniquePreserveOrder(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function toCanonicalFeatureKey(featureKey: string): string {
  const normalized = featureKey.trim().toLowerCase();
  if (!normalized) return normalized;
  return getFeatureCatalogDefinition(normalized)?.key ?? normalized;
}

function getBundleDefinitions(bundleCodes: string[]): BundleDefinition[] {
  const seen = new Set<string>();
  const definitions: BundleDefinition[] = [];
  for (const code of bundleCodes) {
    if (seen.has(code)) continue;
    seen.add(code);
    const definition = FEATURE_BUNDLES.find((bundle) => bundle.code === code);
    if (!definition) continue;
    definitions.push(definition);
  }
  return definitions;
}

async function prepareProvisioningCatalog(input: {
  bundleCodesToEnable: string[];
  featuresToEnable: string[];
}): Promise<PreparedProvisioningCatalog> {
  const bundleDefinitions = getBundleDefinitions(input.bundleCodesToEnable);
  const allFeatureKeys = uniquePreserveOrder(
    [
      ...input.featuresToEnable,
      ...bundleDefinitions.flatMap((bundle) => bundle.features),
    ]
      .map((featureKey) => toCanonicalFeatureKey(featureKey))
      .filter(Boolean),
  );

  if (allFeatureKeys.length > 0) {
    await prisma.platformFeature.createMany({
      data: allFeatureKeys.map((key) => {
        const catalog = getFeatureCatalogDefinition(key);
        return {
          key: catalog?.key ?? key,
          name: catalog?.name ?? key,
          description: catalog?.description ?? `Feature flag for ${key}`,
          domain: catalog?.domain ?? null,
          defaultEnabled: catalog?.defaultEnabled ?? false,
          isBillable: catalog?.isBillable ?? false,
          monthlyPrice: catalog?.monthlyPrice ?? null,
          isActive: true,
        };
      }),
      skipDuplicates: true,
    });

    await prisma.platformFeature.updateMany({
      where: { key: { in: allFeatureKeys } },
      data: { isActive: true },
    });
  }

  const featureRows = allFeatureKeys.length
    ? await prisma.platformFeature.findMany({
      where: { key: { in: allFeatureKeys } },
      select: { id: true, key: true },
    })
    : [];
  const featureByKey = new Map(featureRows.map((feature) => [feature.key, feature]));

  const bundleRows: BundleRow[] = [];
  for (const bundleDefinition of bundleDefinitions) {
    const bundle = await prisma.featureBundle.upsert({
      where: { code: bundleDefinition.code },
      update: {
        name: bundleDefinition.name,
        description: bundleDefinition.description,
        monthlyPrice: bundleDefinition.monthlyPrice,
        additionalSiteMonthlyPrice: bundleDefinition.additionalSiteMonthlyPrice,
        isActive: true,
      },
      create: {
        code: bundleDefinition.code,
        name: bundleDefinition.name,
        description: bundleDefinition.description,
        monthlyPrice: bundleDefinition.monthlyPrice,
        additionalSiteMonthlyPrice: bundleDefinition.additionalSiteMonthlyPrice,
        isActive: true,
      },
      select: { id: true, code: true },
    });
    bundleRows.push(bundle);
  }

  const bundleByCode = new Map(bundleRows.map((bundle) => [bundle.code, bundle]));
  for (const bundleDefinition of bundleDefinitions) {
    const bundle = bundleByCode.get(bundleDefinition.code);
    if (!bundle) continue;
    const bundleFeatureItems = uniquePreserveOrder(
      bundleDefinition.features.map((featureKey) => toCanonicalFeatureKey(featureKey)).filter(Boolean),
    )
      .map((featureKey) => featureByKey.get(featureKey))
      .filter((feature): feature is FeatureRow => Boolean(feature))
      .map((feature) => ({ bundleId: bundle.id, featureId: feature.id }));
    if (bundleFeatureItems.length === 0) continue;
    await prisma.featureBundleItem.createMany({
      data: bundleFeatureItems,
      skipDuplicates: true,
    });
  }

  const featureRowsForCompany = uniquePreserveOrder(
    input.featuresToEnable.map((featureKey) => toCanonicalFeatureKey(featureKey)).filter(Boolean),
  )
    .map((featureKey) => featureByKey.get(featureKey))
    .filter((feature): feature is FeatureRow => Boolean(feature));

  return { bundleRows, featureRowsForCompany };
}

function isTransientProvisioningTransactionError(error: unknown): boolean {
  if (isUniqueConstraint(error)) return false;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2028" || error.code === "P2034" || error.code === "P1008") {
      return true;
    }
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return (
    message.includes("expired transaction") ||
    message.includes("transaction api error") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

async function waitMs(delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function withProvisioningRetry<T>(task: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await task();
    } catch (error) {
      if (!isTransientProvisioningTransactionError(error) || attempt >= PROVISION_TX_RETRIES) {
        throw error;
      }
      const backoffMs = Math.min(1500, 250 * (2 ** attempt));
      attempt += 1;
      await waitMs(backoffMs);
    }
  }
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
  const templateSelection = resolveTemplateSelection(String(input.featureTemplate || "TEMPLATE_CORE_STARTER"), input.tierCode);
  const tierCode = templateSelection.tierCode;
  const featureTemplate = templateSelection.templateCode;
  const subdomainCandidate = normalizeSubdomain(input.subdomain || organizationSlug);

  const availability = await isSubdomainAvailable(subdomainCandidate);
  const suggestions = await suggestSubdomains(subdomainCandidate, 6);
  const featuresToEnable = templateSelection.featuresToEnable;
  const warnings: string[] = [...templateSelection.warnings];
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
    templateLabel: templateSelection.templateLabel,
    bundleCodes: templateSelection.bundleCodes,
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

  const featuresToEnable = uniquePreserveOrder(preview.featuresToEnable.map((featureKey) => toCanonicalFeatureKey(featureKey)).filter(Boolean));
  const bundleCodesToEnable = uniquePreserveOrder(preview.bundleCodes);
  const [plan, passwordHash, preparedCatalog] = await Promise.all([
    ensurePlan(preview.tierCode),
    bcrypt.hash(input.adminPassword, 12),
    prepareProvisioningCatalog({
      bundleCodesToEnable,
      featuresToEnable,
    }),
  ]);

  let tx: {
    company: { id: string; name: string; slug: string; tenantStatus: string; isProvisioned: boolean };
    admin: { id: string; email: string; name: string; role: string };
    subscription: { id: string; status: string };
    appliedBundles: string[];
    appliedFeatures: string[];
    reservation: Awaited<ReturnType<typeof prisma.subdomainReservation.create>>;
  };
  try {
    tx = await withProvisioningRetry(() =>
      prisma.$transaction(
        async (trx) => {
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

          const currentBundles = preparedCatalog.bundleRows.length > 0
            ? await trx.featureBundle.findMany({
              where: { code: { in: preparedCatalog.bundleRows.map((bundle) => bundle.code) } },
              select: { id: true, code: true },
            })
            : [];
          const currentFeatures = preparedCatalog.featureRowsForCompany.length > 0
            ? await trx.platformFeature.findMany({
              where: { key: { in: preparedCatalog.featureRowsForCompany.map((feature) => feature.key) } },
              select: { id: true, key: true },
            })
            : [];

          if (currentBundles.length > 0) {
            await trx.companySubscriptionAddon.createMany({
              data: currentBundles.map((bundle) => ({
                companyId: company.id,
                bundleId: bundle.id,
                isEnabled: true,
                reason: `Provision template ${preview.featureTemplate}`,
              })),
              skipDuplicates: true,
            });
          }

          if (currentFeatures.length > 0) {
            await trx.companyFeatureFlag.createMany({
              data: currentFeatures.map((feature) => ({
                companyId: company.id,
                featureId: feature.id,
                isEnabled: true,
                reason: `Provision template ${preview.featureTemplate}`,
              })),
              skipDuplicates: true,
            });
          }

          const reservation = await reserveSubdomainRecord(trx, company.id, preview.subdomainCandidate);
          const appliedBundles = currentBundles.map((bundle) => bundle.code);
          const appliedFeatures = currentFeatures.map((feature) => feature.key);

          return { company, admin, subscription, appliedBundles, appliedFeatures, reservation };
        },
        {
          maxWait: PROVISION_TX_MAX_WAIT_MS,
          timeout: PROVISION_TX_TIMEOUT_MS,
        },
      ),
    );
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
    if (isTransientProvisioningTransactionError(error)) {
      throw new Error(
        "Provisioning timed out while applying organization setup. Please retry. If this keeps happening, increase PRISMA_PROVISION_TX_TIMEOUT_MS.",
      );
    }
    throw error;
  }

  const warnings: string[] = [...preview.warnings];
  const events = [
    { action: "PROVISION_ORG_CREATED", entityType: "organization", entityId: tx.company.id, reason: `Created ${tx.company.slug}` },
    { action: "PROVISION_ADMIN_CREATED", entityType: "admin", entityId: tx.admin.id, reason: `Created ${tx.admin.email}` },
    { action: "PROVISION_TIER_ASSIGNED", entityType: "subscription", entityId: tx.subscription.id, reason: `Assigned tier ${plan.code}` },
    { action: "PROVISION_BUNDLES_APPLIED", entityType: "subscription_addon", entityId: tx.company.id, reason: `Applied ${tx.appliedBundles.length} bundles` },
    { action: "PROVISION_FEATURES_APPLIED", entityType: "feature", entityId: tx.company.id, reason: `Applied ${tx.appliedFeatures.length} features` },
    { action: "PROVISION_SUBDOMAIN_RESERVED", entityType: "subdomain", entityId: tx.reservation.subdomain, reason: `Reserved ${tx.reservation.subdomain}` },
  ];
  const auditIds: string[] = [];
  for (const event of events) {
    try {
      const audit = await appendAuditEvent({
        actor: input.actor,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        companyId: tx.company.id,
        reason: event.reason,
      });
      auditIds.push(audit.id);
    } catch (error) {
      warnings.push(
        `Audit write skipped (${event.action}): ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  try {
    const consolidated = await appendAuditEvent({
      actor: input.actor,
      action: "PROVISION_BUNDLE_COMPLETED",
      entityType: "provision",
      entityId: tx.company.id,
      companyId: tx.company.id,
      reason: input.reason ?? "Provision bundle completed",
    });
    auditIds.unshift(consolidated.id);
  } catch (error) {
    warnings.push(
      `Audit write skipped (PROVISION_BUNDLE_COMPLETED): ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

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
    bundlesApplied: tx.appliedBundles,
    featuresApplied: tx.appliedFeatures,
    subdomainReservation: mapReservation(tx.reservation),
    auditEventIds: auditIds,
    actionPreview: actionPreview(preview),
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
