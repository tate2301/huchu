import { prisma } from "@/lib/prisma";
import { getCompanyFeatureMap, type FeatureMap } from "@/lib/platform/entitlements";
import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";
import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";

const MANAGER_TEMPLATE_DENY = new Set([
  "core.branding.manage",
  "core.branding.custom-domain",
  "admin.user-management.create",
  "admin.user-management.status",
  "admin.user-management.password-reset",
  "admin.user-management.role-change",
  "admin.user-management.feature-access",
]);

const CLERK_TEMPLATE_ALLOW = new Set([
  "ops.shift-report.submit",
  "ops.attendance.mark",
  "ops.plant-report.submit",
  "stores.dashboard",
  "stores.inventory",
  "stores.movements",
  "stores.issue",
  "stores.receive",
  "gold.home",
  "gold.intake.pours",
  "gold.dispatches",
  "gold.receipts",
  "reports.dashboard",
  "reports.shift",
  "reports.attendance",
  "reports.plant",
  "reports.stores-movements",
  "hr.employees",
  "core.auth.login",
  "core.multitenancy.tenant-host-enforcement",
  "core.help.quick-tips",
  "core.notifications.center",
]);

const SCHOOL_SHARED_ALLOW_PREFIXES = [
  "core.auth.",
  "core.help.",
  "core.notifications.",
  "core.multitenancy.",
  "schools.",
  "portal.",
] as const;

const OPERATOR_TEMPLATE_ALLOW_PREFIXES = [
  "core.auth.",
  "core.help.",
  "core.notifications.",
  "core.multitenancy.",
  "scrap-metal.",
  "stores.",
  "maintenance.",
  "reports.",
  // An operator counts the scrap and weighs the gold, so settlements are theirs
  // to record. The matrix in `lib/settlements/permissions.ts` keeps them to
  // recording and submitting — they cannot approve their own count or pay it out.
  "settlements.",
] as const;

const ROLE_PREFIX_ALLOWLIST: Record<string, readonly string[] | null> = {
  SUPERADMIN: null,
  MANAGER: null,
  CLERK: null,
  OPERATOR: OPERATOR_TEMPLATE_ALLOW_PREFIXES,
  SCHOOL_ADMIN: SCHOOL_SHARED_ALLOW_PREFIXES,
  REGISTRAR: SCHOOL_SHARED_ALLOW_PREFIXES,
  BURSAR: [
    ...SCHOOL_SHARED_ALLOW_PREFIXES,
    "accounting.core",
    "accounting.ar",
    "accounting.banking",
    "accounting.tax",
    "accounting.zimra.",
  ],
  HOD: SCHOOL_SHARED_ALLOW_PREFIXES,
  WARDEN: SCHOOL_SHARED_ALLOW_PREFIXES,
  TEACHER: [
    ...SCHOOL_SHARED_ALLOW_PREFIXES,
    "schools.attendance",
    "schools.results",
    "schools.portal.teacher",
  ],
  // `schools.core` is here because `schools.portal.parent` and
  // `schools.portal.student` both *depend* on it — see
  // `lib/platform/gating/feature-dependencies.ts`. Granting the portal key
  // alone resolved to "requires schools.core" on every request, so every
  // parent and every pupil, on every tenant, was bounced to /access-blocked
  // by a portal they had been given. It grants nothing on its own: the
  // schools pages are gated on `schools.students`, `schools.fees` and the
  // rest, which are still absent from these two lists, and a portal user's
  // records are resolved from their own linked account regardless.
  PARENT: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "schools.core",
    "schools.portal.parent",
    "portal.",
  ],
  STUDENT: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "schools.core",
    "schools.portal.student",
    "portal.",
  ],
  AUTO_MANAGER: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "autos.",
    "portal.autos",
  ],
  SALES_EXEC: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "autos.leads",
    "autos.deals",
    "crm.",
    "portal.autos",
  ],
  SALES_REP: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "crm.",
  ],
  FINANCE_OFFICER: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "autos.deals",
    "autos.financing",
    "accounting.core",
    "accounting.ar",
    "accounting.banking",
    "accounting.tax",
    "portal.autos",
  ],
  SHOP_MANAGER: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "retail.",
    "portal.pos",
  ],
  CASHIER: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "retail.core",
    "retail.pos",
    "retail.catalog",
    "portal.core",
    "portal.pos",
  ],
  STOCK_CLERK: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "retail.purchasing",
    "retail.catalog",
    "portal.pos",
  ],
};

const MANAGED_USER_ROLE_VALUES = [
  "SUPERADMIN",
  "MANAGER",
  "CLERK",
  "OPERATOR",
  "SCHOOL_ADMIN",
  "REGISTRAR",
  "BURSAR",
  "HOD",
  "WARDEN",
  "TEACHER",
  "PARENT",
  "STUDENT",
  "AUTO_MANAGER",
  "SALES_EXEC",
  "FINANCE_OFFICER",
  "SHOP_MANAGER",
  "CASHIER",
  "STOCK_CLERK",
  "SALES_REP",
] as const;

const MANAGED_USER_ROLES = new Set<string>(MANAGED_USER_ROLE_VALUES);

const CATALOG_BY_KEY = new Map(
  FEATURE_CATALOG.map((feature) => [normalizeFeatureKey(feature.key), feature]),
);

const CATALOG_DEFAULTS = new Map(
  FEATURE_CATALOG.map((feature) => [
    normalizeFeatureKey(feature.key),
    feature.defaultEnabled === true,
  ]),
);

export type ManagedUserRole = (typeof MANAGED_USER_ROLE_VALUES)[number];
export type ManagedUserFeatureBlockedReason =
  | "COMPANY_DISABLED"
  | "TEMPLATE_BLOCKED";
export type ManagedUserFeatureAccessEntry = {
  featureKey: string;
  name: string;
  description: string;
  domain: string;
  roleDefault: boolean;
  isEnabled: boolean;
  hasOverride: boolean;
};

function isManagedUserRole(role: string): role is ManagedUserRole {
  return MANAGED_USER_ROLES.has(role.trim().toUpperCase());
}

function featureMatchesAnyPrefix(
  featureKey: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some((prefix) => featureKey.startsWith(prefix));
}

function isCompanyFeatureEnabled(featureKey: string, companyMap: FeatureMap): boolean {
  const normalized = normalizeFeatureKey(featureKey);
  if (Object.prototype.hasOwnProperty.call(companyMap, normalized)) {
    return companyMap[normalized] === true;
  }
  return CATALOG_DEFAULTS.get(normalized) === true;
}

function hasEnabledFeaturePrefix(companyMap: FeatureMap, prefix: string): boolean {
  for (const [featureKey, isEnabled] of Object.entries(companyMap)) {
    if (!isEnabled) continue;
    if (normalizeFeatureKey(featureKey).startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function resolveTemplateRoleForCompany(
  role: string,
  companyMap: FeatureMap,
): string {
  const normalizedRole = role.trim().toUpperCase();
  if (normalizedRole === "CLERK" && hasEnabledFeaturePrefix(companyMap, "scrap-metal.")) {
    return "OPERATOR";
  }
  return normalizedRole;
}

function getAllCompanyEnabledFeatureKeys(companyMap: FeatureMap): string[] {
  const enabled = new Set<string>();

  for (const feature of FEATURE_CATALOG) {
    const key = normalizeFeatureKey(feature.key);
    if (isCompanyFeatureEnabled(key, companyMap)) {
      enabled.add(key);
    }
  }

  for (const [key, isEnabled] of Object.entries(companyMap)) {
    if (isEnabled) enabled.add(normalizeFeatureKey(key));
  }

  return [...enabled].sort();
}

export function isTemplateAllowedForRole(role: string, featureKey: string): boolean {
  const normalizedRole = role.trim().toUpperCase();
  const normalizedFeatureKey = normalizeFeatureKey(featureKey);

  if (normalizedRole === "MANAGER") {
    return !MANAGER_TEMPLATE_DENY.has(normalizedFeatureKey);
  }

  if (normalizedRole === "CLERK") {
    return CLERK_TEMPLATE_ALLOW.has(normalizedFeatureKey);
  }

  const allowPrefixes = ROLE_PREFIX_ALLOWLIST[normalizedRole];
  if (allowPrefixes) {
    return featureMatchesAnyPrefix(normalizedFeatureKey, allowPrefixes);
  }

  return true;
}

function getRoleDefaultForFeature(templateRole: string, featureKey: string): boolean {
  if (!isManagedUserRole(templateRole)) return true;
  return isTemplateAllowedForRole(templateRole, featureKey);
}

export async function getUserFeatureOverrideMap(userId: string): Promise<Map<string, boolean>> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return new Map();

  const rows = await prisma.userFeatureFlag.findMany({
    where: { userId: normalizedUserId },
    select: {
      isEnabled: true,
      feature: { select: { key: true } },
    },
  });

  const map = new Map<string, boolean>();
  for (const row of rows) {
    map.set(normalizeFeatureKey(row.feature.key), row.isEnabled === true);
  }
  return map;
}

export async function clearUserFeatureOverrides(userId: string): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;
  await prisma.userFeatureFlag.deleteMany({
    where: { userId: normalizedUserId },
  });
}

/**
 * Drop one feature's override so the person follows their role again.
 *
 * `setManagedUserFeatureOverride` already deletes a row that happens to match
 * the current role default, but that is a different intent: it means "make it
 * true", and it silently becomes "and stop tracking the role" only because the
 * two agreed today. Clearing has to be its own verb for the permissions screen
 * to offer three honest states instead of two.
 */
export async function clearManagedUserFeatureOverride(
  userId: string,
  featureKey: string,
): Promise<void> {
  const normalizedUserId = userId.trim();
  const normalizedFeatureKey = normalizeFeatureKey(featureKey);
  if (!normalizedUserId || !normalizedFeatureKey) return;

  await prisma.userFeatureFlag.deleteMany({
    where: {
      userId: normalizedUserId,
      feature: { key: CATALOG_BY_KEY.get(normalizedFeatureKey)?.key ?? normalizedFeatureKey },
    },
  });
}

export async function getEffectiveFeaturesForUser(input: {
  companyId: string;
  userId: string;
  role: string;
}): Promise<string[]> {
  const companyId = input.companyId.trim();
  const userId = input.userId.trim();
  const role = input.role.trim().toUpperCase();
  if (!companyId) return [];

  const companyMap = await getCompanyFeatureMap(companyId);
  const companyEnabled = getAllCompanyEnabledFeatureKeys(companyMap);
  const templateRole = resolveTemplateRoleForCompany(role, companyMap);

  const overrideMap = userId
    ? await getUserFeatureOverrideMap(userId)
    : new Map<string, boolean>();

  return companyEnabled.filter((featureKey) => {
    const override = overrideMap.get(featureKey);
    if (override !== undefined) return override;
    return getRoleDefaultForFeature(templateRole, featureKey);
  });
}

export async function getManagedUserFeatureAccessEntries(input: {
  companyId: string;
  userId: string;
  role: string;
}): Promise<ManagedUserFeatureAccessEntry[]> {
  const companyId = input.companyId.trim();
  const userId = input.userId.trim();
  if (!companyId || !userId) return [];

  const [companyMap, overrideMap] = await Promise.all([
    getCompanyFeatureMap(companyId),
    getUserFeatureOverrideMap(userId),
  ]);
  const templateRole = resolveTemplateRoleForCompany(input.role, companyMap);

  const entries: ManagedUserFeatureAccessEntry[] = [];
  for (const featureKey of getAllCompanyEnabledFeatureKeys(companyMap)) {
    const catalog = CATALOG_BY_KEY.get(featureKey);
    const roleDefault = getRoleDefaultForFeature(templateRole, featureKey);
    const override = overrideMap.get(featureKey);

    entries.push({
      featureKey,
      name: catalog?.name ?? featureKey,
      description:
        catalog?.description ?? "Custom feature flag managed at platform level.",
      domain: catalog?.domain ?? "custom",
      roleDefault,
      isEnabled: override ?? roleDefault,
      hasOverride: override !== undefined,
    });
  }

  return entries.sort((a, b) => {
    if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.featureKey.localeCompare(b.featureKey);
  });
}

export async function setManagedUserFeatureOverride(input: {
  companyId: string;
  userId: string;
  role: string;
  featureKey: string;
  isEnabled: boolean;
}): Promise<void> {
  const normalizedFeatureKey = normalizeFeatureKey(input.featureKey);
  const companyMap = await getCompanyFeatureMap(input.companyId.trim());
  const templateRole = resolveTemplateRoleForCompany(input.role, companyMap);

  if (!isCompanyFeatureEnabled(normalizedFeatureKey, companyMap)) {
    throw new Error("FEATURE_NOT_ENABLED_FOR_COMPANY");
  }

  const catalog = CATALOG_BY_KEY.get(normalizedFeatureKey);
  const feature = await prisma.platformFeature.upsert({
    where: { key: catalog?.key ?? normalizedFeatureKey },
    update: {
      isActive: true,
    },
    create: {
      key: catalog?.key ?? normalizedFeatureKey,
      name: catalog?.name ?? normalizedFeatureKey,
      description:
        catalog?.description ?? `Feature flag for ${normalizedFeatureKey}`,
      domain: catalog?.domain ?? null,
      defaultEnabled: catalog?.defaultEnabled ?? false,
      isBillable: catalog?.isBillable ?? false,
      monthlyPrice: catalog?.monthlyPrice ?? null,
      isActive: true,
    },
    select: { id: true },
  });

  const roleDefault = getRoleDefaultForFeature(templateRole, normalizedFeatureKey);

  if (input.isEnabled === roleDefault) {
    // Matches the role default, so no override is needed.
    await prisma.userFeatureFlag.deleteMany({
      where: {
        userId: input.userId.trim(),
        featureId: feature.id,
      },
    });
    return;
  }

  await prisma.userFeatureFlag.upsert({
    where: {
      userId_featureId: {
        userId: input.userId.trim(),
        featureId: feature.id,
      },
    },
    update: {
      isEnabled: input.isEnabled,
    },
    create: {
      userId: input.userId.trim(),
      featureId: feature.id,
      isEnabled: input.isEnabled,
    },
  });
}
