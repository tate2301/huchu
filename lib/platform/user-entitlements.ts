import { prisma } from "@/lib/prisma";
import { getCompanyFeatureMap, type FeatureMap } from "@/lib/platform/entitlements";
import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";

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

const ROLE_PREFIX_ALLOWLIST: Record<string, readonly string[] | null> = {
  MANAGER: null,
  CLERK: null,
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
  TEACHER: [
    ...SCHOOL_SHARED_ALLOW_PREFIXES,
    "schools.attendance",
    "schools.results",
    "schools.portal.teacher",
  ],
  PARENT: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "schools.portal.parent",
    "portal.",
  ],
  STUDENT: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
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
    "portal.autos",
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
    "thrift.",
    "portal.thrift",
  ],
  CASHIER: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "thrift.checkout",
    "thrift.catalog",
    "portal.thrift",
  ],
  STOCK_CLERK: [
    "core.auth.",
    "core.help.",
    "core.notifications.",
    "core.multitenancy.",
    "thrift.intake",
    "thrift.catalog",
    "portal.thrift",
  ],
};

const MANAGED_USER_ROLES = new Set([
  "MANAGER",
  "CLERK",
  "SCHOOL_ADMIN",
  "REGISTRAR",
  "BURSAR",
  "TEACHER",
  "PARENT",
  "STUDENT",
  "AUTO_MANAGER",
  "SALES_EXEC",
  "FINANCE_OFFICER",
  "SHOP_MANAGER",
  "CASHIER",
  "STOCK_CLERK",
]);

const CATALOG_BY_KEY = new Map(
  FEATURE_CATALOG.map((feature) => [normalizeFeatureKey(feature.key), feature]),
);

const CATALOG_DEFAULTS = new Map(
  FEATURE_CATALOG.map((feature) => [
    normalizeFeatureKey(feature.key),
    feature.defaultEnabled === true,
  ]),
);

export type ManagedUserRole =
  | "MANAGER"
  | "CLERK"
  | "SCHOOL_ADMIN"
  | "REGISTRAR"
  | "BURSAR"
  | "TEACHER"
  | "PARENT"
  | "STUDENT"
  | "AUTO_MANAGER"
  | "SALES_EXEC"
  | "FINANCE_OFFICER"
  | "SHOP_MANAGER"
  | "CASHIER"
  | "STOCK_CLERK";
export type ManagedUserFeatureBlockedReason =
  | "COMPANY_DISABLED"
  | "TEMPLATE_BLOCKED";

export type ManagedUserFeatureAccessEntry = {
  featureKey: string;
  name: string;
  description: string;
  domain: string;
  companyEnabled: boolean;
  templateAllowed: boolean;
  available: boolean;
  isEnabled: boolean;
  hasOverride: boolean;
  blockedReason: ManagedUserFeatureBlockedReason | null;
};

function normalizeFeatureKey(value: string): string {
  return value.trim().toLowerCase();
}

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

  if (!userId || !isManagedUserRole(role)) {
    return companyEnabled;
  }

  const overrideMap = await getUserFeatureOverrideMap(userId);
  return companyEnabled.filter((featureKey) => {
    if (!isTemplateAllowedForRole(role, featureKey)) return false;
    const override = overrideMap.get(featureKey);
    if (override === false) return false;
    return true;
  });
}

export async function getManagedUserFeatureAccessEntries(input: {
  companyId: string;
  userId: string;
  role: ManagedUserRole;
}): Promise<ManagedUserFeatureAccessEntry[]> {
  const companyId = input.companyId.trim();
  const userId = input.userId.trim();
  if (!companyId || !userId) return [];

  const [companyMap, overrideMap] = await Promise.all([
    getCompanyFeatureMap(companyId),
    getUserFeatureOverrideMap(userId),
  ]);

  const keys = new Set<string>([
    ...FEATURE_CATALOG.map((feature) => normalizeFeatureKey(feature.key)),
    ...Object.keys(companyMap).map((key) => normalizeFeatureKey(key)),
    ...overrideMap.keys(),
  ]);

  const entries: ManagedUserFeatureAccessEntry[] = [];
  for (const featureKey of keys) {
    const catalog = CATALOG_BY_KEY.get(featureKey);
    const companyEnabled = isCompanyFeatureEnabled(featureKey, companyMap);
    const templateAllowed = isTemplateAllowedForRole(input.role, featureKey);
    const available = companyEnabled && templateAllowed;
    const override = overrideMap.get(featureKey);
    const hasOverride = override !== undefined;

    let blockedReason: ManagedUserFeatureBlockedReason | null = null;
    if (!companyEnabled) {
      blockedReason = "COMPANY_DISABLED";
    } else if (!templateAllowed) {
      blockedReason = "TEMPLATE_BLOCKED";
    }

    entries.push({
      featureKey,
      name: catalog?.name ?? featureKey,
      description:
        catalog?.description ?? "Custom feature flag managed at platform level.",
      domain: catalog?.domain ?? "custom",
      companyEnabled,
      templateAllowed,
      available,
      isEnabled: available && (override ?? true),
      hasOverride,
      blockedReason,
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
  role: ManagedUserRole;
  featureKey: string;
  isEnabled: boolean;
}): Promise<void> {
  const normalizedFeatureKey = normalizeFeatureKey(input.featureKey);
  const companyMap = await getCompanyFeatureMap(input.companyId.trim());

  if (!isCompanyFeatureEnabled(normalizedFeatureKey, companyMap)) {
    throw new Error("FEATURE_NOT_ENABLED_FOR_COMPANY");
  }
  if (!isTemplateAllowedForRole(input.role, normalizedFeatureKey)) {
    throw new Error("FEATURE_BLOCKED_BY_TEMPLATE");
  }

  const catalog = CATALOG_BY_KEY.get(normalizedFeatureKey);
  const feature = await prisma.platformFeature.upsert({
    where: { key: catalog?.key ?? normalizedFeatureKey },
    update: {
      name: catalog?.name ?? normalizedFeatureKey,
      description:
        catalog?.description ?? `Feature flag for ${normalizedFeatureKey}`,
      domain: catalog?.domain ?? null,
      defaultEnabled: catalog?.defaultEnabled ?? false,
      isBillable: catalog?.isBillable ?? false,
      monthlyPrice: catalog?.monthlyPrice ?? null,
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

  if (input.isEnabled) {
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
      isEnabled: false,
    },
    create: {
      userId: input.userId.trim(),
      featureId: feature.id,
      isEnabled: false,
    },
  });
}
