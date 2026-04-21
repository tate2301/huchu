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
  getClientTemplateDisabledFeatureKeys,
  getClientTemplateDefinition,
  getClientTemplateFeatureKeys,
  getClientTemplateWorkspaceProfile,
} from "../../lib/platform/client-templates";
import {
  ADMIN_ACCOUNT_STATUSES,
  ADMIN_ROLES,
  ORGANIZATION_STATUSES,
  SITE_MEASUREMENT_UNITS,
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
  type ProvisionBundleResult,
  type ProvisionOrganizationInput,
  type CreateSiteInput,
  type ListSitesInput,
  type ResetAdminPasswordInput,
  type SetSiteStatusInput,
  type SetAdminStatusInput,
  type SetFeatureInput,
  type SetBundleFeaturesInput,
  type SetSubscriptionStatusInput,
  type SetAddonInput,
  type SiteCreateResult,
  type SiteDetail,
  type SiteMeasurementUnit,
  type SiteStatusResult,
  type SiteSummary,
  type SiteUpdateResult,
  type UpsertBundleCatalogInput,
  type UpdateSiteInput,
  type SubscriptionStatusResult,
  type SubscriptionPricingSummary,
  type SubscriptionHealthSummary,
  type SubscriptionStatusValue,
  type SubscriptionSummary,
  type AuditEventRecord,
  type WorkspaceResetInput,
  type WorkspaceResetPreview,
  type WorkspaceResetPreviewInput,
  type WorkspaceResetResult,
  type WorkspaceResetTableStat,
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

function normalizePasswordInput(password: string, label = "Password"): string {
  const strippedControls = Array.from(String(password || ""))
    .filter((char) => {
      const codePoint = char.codePointAt(0);
      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
    })
    .join("");
  const normalized = strippedControls.trim();
  if (normalized.length < 8) {
    throw new Error(`${label} must be at least 8 characters.`);
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

function normalizeSiteCode(value: string): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    throw new Error("Site code cannot be empty.");
  }
  if (normalized.length > 20) {
    throw new Error("Site code cannot exceed 20 characters.");
  }
  return normalized;
}

function normalizeSiteName(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error("Site name cannot be empty.");
  }
  if (normalized.length > 200) {
    throw new Error("Site name cannot exceed 200 characters.");
  }
  return normalized;
}

function normalizeSiteLocation(value: string | null | undefined): string | null {
  if (value === null) return null;
  if (value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > 200) {
    throw new Error("Site location cannot exceed 200 characters.");
  }
  return normalized;
}

function normalizeSiteMeasurementUnit(value: string | undefined): SiteMeasurementUnit {
  const normalized = String(value || "units").trim().toLowerCase();
  if (!SITE_MEASUREMENT_UNITS.includes(normalized as SiteMeasurementUnit)) {
    throw new Error(
      `Invalid measurement unit: ${value}. Use ${SITE_MEASUREMENT_UNITS.join(", ")}.`,
    );
  }
  return normalized as SiteMeasurementUnit;
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

type DeletePredicateBuilder = (alias: string) => string;

type ForeignKeyMetadataRow = {
  constraint_name: string;
  child_table: string;
  parent_table: string;
  child_columns: string[];
  parent_columns: string[];
};

type ResetPlan = {
  companyId: string;
  companyName: string;
  companySlug: string;
  confirmationToken: string;
  activeSupportSessionCount: number;
  preservedAdminCount: number;
  activePreservedAdminCount: number;
  deletionOrder: string[];
  tablePredicates: Map<string, DeletePredicateBuilder>;
  tableStats: WorkspaceResetTableStat[];
};

const WORKSPACE_RESET_PRESERVED_TABLES = new Set([
  "Company",
  "CompanyBranding",
  "CompanyDomain",
  "CompanyFeatureFlag",
  "CompanySubscription",
  "CompanySubscriptionAddon",
  "ContractEnforcementEvent",
  "HealthIncident",
  "PlatformAuditEvent",
  "ProvisioningEvent",
  "RunbookDefinition",
  "RunbookExecution",
  "SubdomainReservation",
  "SupportAccessRequest",
  "SupportSession",
  "TenantSloMetricSnapshot",
]);

const WORKSPACE_RESET_PRESERVED_SCOPES = [
  "Company record and portal access shell",
  "SUPERADMIN accounts and their login sessions",
  "Branding, domains, subscriptions, add-ons, and feature flags",
  "Platform audit, support, runbook, and reliability records",
];

const WORKSPACE_RESET_ROOT_PREDICATES: Record<string, DeletePredicateBuilder> = {
  User: (alias) => `${alias}.${quoteIdent("companyId")} = $1 AND ${alias}.${quoteIdent("role")} <> 'SUPERADMIN'`,
};

async function listCompanyScopedTables(
  tx: Prisma.TransactionClient,
): Promise<Set<string>> {
  const rows = await tx.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'companyId'
  `;

  return new Set(rows.map((row) => row.table_name));
}

async function listForeignKeyMetadata(
  tx: Prisma.TransactionClient,
): Promise<ForeignKeyMetadataRow[]> {
  return tx.$queryRaw<ForeignKeyMetadataRow[]>`
    SELECT
      con.conname AS constraint_name,
      child.relname AS child_table,
      parent.relname AS parent_table,
      array_agg(child_attr.attname ORDER BY cols.ord) AS child_columns,
      array_agg(parent_attr.attname ORDER BY cols.ord) AS parent_columns
    FROM pg_constraint con
    INNER JOIN pg_class child
      ON child.oid = con.conrelid
    INNER JOIN pg_class parent
      ON parent.oid = con.confrelid
    INNER JOIN pg_namespace ns
      ON ns.oid = child.relnamespace
    INNER JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS cols(child_attnum, parent_attnum, ord)
      ON TRUE
    INNER JOIN pg_attribute child_attr
      ON child_attr.attrelid = child.oid
     AND child_attr.attnum = cols.child_attnum
    INNER JOIN pg_attribute parent_attr
      ON parent_attr.attrelid = parent.oid
     AND parent_attr.attnum = cols.parent_attnum
    WHERE con.contype = 'f'
      AND ns.nspname = 'public'
    GROUP BY con.conname, child.relname, parent.relname
  `;
}

function buildWorkspaceResetPredicates(
  companyScopedTables: Set<string>,
  foreignKeys: ForeignKeyMetadataRow[],
) {
  const predicates = new Map<string, DeletePredicateBuilder>();

  for (const tableName of companyScopedTables) {
    if (WORKSPACE_RESET_PRESERVED_TABLES.has(tableName)) {
      continue;
    }

    const customPredicate = WORKSPACE_RESET_ROOT_PREDICATES[tableName];
    predicates.set(
      tableName,
      customPredicate ??
        ((alias) => `${alias}.${quoteIdent("companyId")} = $1`),
    );
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const foreignKey of foreignKeys) {
      if (predicates.has(foreignKey.child_table)) {
        continue;
      }

      if (WORKSPACE_RESET_PRESERVED_TABLES.has(foreignKey.child_table)) {
        continue;
      }

      const parentPredicate = predicates.get(foreignKey.parent_table);
      if (!parentPredicate) {
        continue;
      }

      predicates.set(foreignKey.child_table, (alias) => {
        const joinConditions = foreignKey.child_columns
          .map((childColumn, index) => {
            const parentColumn = foreignKey.parent_columns[index];
            return `p.${quoteIdent(parentColumn)} = ${alias}.${quoteIdent(childColumn)}`;
          })
          .join(" AND ");

        return `EXISTS (
          SELECT 1
          FROM ${quoteIdent(foreignKey.parent_table)} AS p
          WHERE ${joinConditions}
            AND ${parentPredicate("p")}
        )`;
      });
      changed = true;
    }
  }

  return predicates;
}

function buildWorkspaceResetDeletionOrder(
  tablePredicates: Map<string, DeletePredicateBuilder>,
  foreignKeys: ForeignKeyMetadataRow[],
) {
  const tableNames = [...tablePredicates.keys()];
  const indegree = new Map<string, number>(tableNames.map((table) => [table, 0]));
  const childrenByParent = new Map<string, Set<string>>();

  for (const foreignKey of foreignKeys) {
    if (!tablePredicates.has(foreignKey.child_table) || !tablePredicates.has(foreignKey.parent_table)) {
      continue;
    }
    if (foreignKey.child_table === foreignKey.parent_table) {
      continue;
    }

    const siblings = childrenByParent.get(foreignKey.parent_table) ?? new Set<string>();
    if (!siblings.has(foreignKey.child_table)) {
      siblings.add(foreignKey.child_table);
      childrenByParent.set(foreignKey.parent_table, siblings);
      indegree.set(
        foreignKey.child_table,
        (indegree.get(foreignKey.child_table) ?? 0) + 1,
      );
    }
  }

  const queue = tableNames
    .filter((table) => (indegree.get(table) ?? 0) === 0)
    .sort((left, right) => left.localeCompare(right));
  const topo: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    topo.push(current);

    for (const child of childrenByParent.get(current) ?? []) {
      const nextDegree = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, nextDegree);
      if (nextDegree === 0) {
        queue.push(child);
        queue.sort((left, right) => left.localeCompare(right));
      }
    }
  }

  const unresolved = tableNames
    .filter((table) => !topo.includes(table))
    .sort((left, right) => left.localeCompare(right));

  return [...topo, ...unresolved].reverse();
}

async function countWorkspaceResetRows(
  tx: Prisma.TransactionClient,
  tableName: string,
  predicate: DeletePredicateBuilder,
  companyId: string,
) {
  const sql = `SELECT COUNT(*)::bigint AS count FROM ${quoteIdent(tableName)} AS t WHERE ${predicate("t")}`;
  const rows = await tx.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(sql, companyId);
  const rawCount = rows[0]?.count ?? 0;
  return Number(rawCount);
}

async function buildWorkspaceResetPlan(
  tx: Prisma.TransactionClient,
  input: WorkspaceResetPreviewInput,
): Promise<ResetPlan> {
  const company = await tx.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) {
    throw new Error(`Organization not found for id: ${input.companyId}`);
  }

  const [activeSupportSessionCount, preservedAdminCount, activePreservedAdminCount, companyScopedTables, foreignKeys] =
    await Promise.all([
      tx.supportSession.count({
        where: {
          companyId: input.companyId,
          status: "ACTIVE",
        },
      }),
      tx.user.count({
        where: {
          companyId: input.companyId,
          role: "SUPERADMIN",
        },
      }),
      tx.user.count({
        where: {
          companyId: input.companyId,
          role: "SUPERADMIN",
          isActive: true,
        },
      }),
      listCompanyScopedTables(tx),
      listForeignKeyMetadata(tx),
    ]);

  if (preservedAdminCount === 0) {
    throw new Error(
      `Workspace ${company.slug} has no SUPERADMIN users to preserve. Restore a SUPERADMIN before resetting it.`,
    );
  }

  if (activePreservedAdminCount === 0) {
    throw new Error(
      `Workspace ${company.slug} has no active SUPERADMIN users. Reactivate one before resetting the workspace.`,
    );
  }

  const tablePredicates = buildWorkspaceResetPredicates(companyScopedTables, foreignKeys);
  const deletionOrder = buildWorkspaceResetDeletionOrder(tablePredicates, foreignKeys);
  const tableStats = (
    await Promise.all(
      deletionOrder.map(async (tableName) => ({
        table: tableName,
        rowCount: await countWorkspaceResetRows(
          tx,
          tableName,
          tablePredicates.get(tableName)!,
          input.companyId,
        ),
      })),
    )
  ).filter((row) => row.rowCount > 0);

  return {
    companyId: company.id,
    companyName: company.name,
    companySlug: company.slug,
    confirmationToken: `RESET ${company.slug}`,
    activeSupportSessionCount,
    preservedAdminCount,
    activePreservedAdminCount,
    deletionOrder,
    tablePredicates,
    tableStats: tableStats.sort((left, right) => right.rowCount - left.rowCount),
  };
}

async function previewWorkspaceReset(
  input: WorkspaceResetPreviewInput,
): Promise<WorkspaceResetPreview> {
  const plan = await prisma.$transaction((tx) => buildWorkspaceResetPlan(tx, input));

  return {
    companyId: plan.companyId,
    companyName: plan.companyName,
    companySlug: plan.companySlug,
    confirmationToken: plan.confirmationToken,
    activeSupportSessionCount: plan.activeSupportSessionCount,
    preservedAdminCount: plan.preservedAdminCount,
    activePreservedAdminCount: plan.activePreservedAdminCount,
    tablesToDelete: plan.tableStats,
    totalRowsToDelete: plan.tableStats.reduce((sum, row) => sum + row.rowCount, 0),
    preservedScopes: [...WORKSPACE_RESET_PRESERVED_SCOPES],
  };
}

async function resetWorkspace(input: WorkspaceResetInput): Promise<WorkspaceResetResult> {
  const confirmationToken = input.confirmationToken.trim();
  let deletedTables: WorkspaceResetTableStat[] = [];
  let companyName = "";
  let companySlug = "";
  let preservedAdminCount = 0;
  let activePreservedAdminCount = 0;

  await prisma.$transaction(async (tx) => {
    const plan = await buildWorkspaceResetPlan(tx, input);
    companyName = plan.companyName;
    companySlug = plan.companySlug;
    preservedAdminCount = plan.preservedAdminCount;
    activePreservedAdminCount = plan.activePreservedAdminCount;

    if (plan.activeSupportSessionCount > 0) {
      throw new Error(
        `Workspace ${plan.companySlug} has ${plan.activeSupportSessionCount} active support session(s). End those sessions before resetting the workspace.`,
      );
    }

    if (confirmationToken !== plan.confirmationToken) {
      throw new Error(`Confirmation mismatch. Type "${plan.confirmationToken}" to continue.`);
    }

    const results: WorkspaceResetTableStat[] = [];
    for (const tableName of plan.deletionOrder) {
      const predicate = plan.tablePredicates.get(tableName);
      if (!predicate) {
        continue;
      }

      const sql = `DELETE FROM ${quoteIdent(tableName)} AS t WHERE ${predicate("t")}`;
      const deletedRowCount = await tx.$executeRawUnsafe<number>(sql, plan.companyId);
      if (deletedRowCount > 0) {
        results.push({
          table: tableName,
          rowCount: deletedRowCount,
        });
      }
    }

    deletedTables = results.sort((left, right) => right.rowCount - left.rowCount);
  });

  let auditEventId: string | null = null;
  try {
    const audit = await appendAuditEvent({
      actor: input.actor,
      action: "ORG_RESET_WORKSPACE",
      entityType: "organization",
      entityId: input.companyId,
      companyId: input.companyId,
      reason: input.reason ?? "Workspace reset from admin portal",
      after: {
        preservedAdminCount,
        activePreservedAdminCount,
        deletedTables,
        totalRowsDeleted: deletedTables.reduce((sum, row) => sum + row.rowCount, 0),
      },
      metadata: {
        companySlug,
        confirmationToken,
      },
    });
    auditEventId = audit.id;
  } catch {
    auditEventId = null;
  }

  return {
    companyId: input.companyId,
    companyName,
    companySlug,
    confirmationToken,
    deletedTables,
    totalRowsDeleted: deletedTables.reduce((sum, row) => sum + row.rowCount, 0),
    preservedAdminCount,
    activePreservedAdminCount,
    auditEventId,
  };
}

function toErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  if (message.includes("not found")) return "NOT_FOUND";
  if (message.includes("already exists") || message.includes("duplicate") || message.includes("unique")) return "CONFLICT";
  if (message.includes("invalid") || message.includes("empty") || message.includes("required")) return "VALIDATION_ERROR";
  if (message.includes("permission") || message.includes("role")) return "PERMISSION_DENIED";
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("expired transaction") ||
    message.includes("a query cannot be executed on an expired transaction")
  ) {
    return "TIMEOUT";
  }
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

async function toProvisionBundleMutation(
  task: () => Promise<ProvisionBundleResult>,
): Promise<MutationResult<ProvisionBundleResult>> {
  const result = await toMutation(task);
  if (!result.ok) return result;
  const warnings = result.resource.warnings;
  if (!warnings || warnings.length === 0) return result;
  return {
    ...result,
    warnings,
  };
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
      workspaceProfile: true,
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
    workspaceProfile: company.workspaceProfile,
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
  const normalizedAdminPassword = normalizePasswordInput(input.adminPassword, "Admin password");
  const workspaceProfile = String(input.workspaceProfile || "GENERAL").trim().toUpperCase() as Prisma.CompanyCreateInput["workspaceProfile"];

  const existingSlug = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
  if (existingSlug) throw new Error(`Slug already exists: ${slug}`);
  const existingEmail = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
  if (existingEmail) throw new Error(`User email already exists: ${adminEmail}`);

  const plan = await ensureDefaultPlan();
  const passwordHash = await bcrypt.hash(normalizedAdminPassword, 12);

  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name,
        slug,
        tenantStatus: "ACTIVE",
        isProvisioned: true,
        workspaceProfile: workspaceProfile as Prisma.CompanyCreateInput["workspaceProfile"],
        payrollCycle: "MONTHLY",
        goldPayoutCycle: "MONTHLY",
        goldSettlementMode: "CURRENT_PERIOD",
        cashDisbursementOnly: true,
      },
      select: { id: true, name: true, slug: true, workspaceProfile: true, tenantStatus: true, isProvisioned: true },
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

function mapSite(row: {
  id: string;
  companyId: string;
  name: string;
  code: string;
  location: string | null;
  measurementUnit: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  company?: { name: string; slug: string } | null;
}): SiteSummary {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    companySlug: row.company?.slug ?? null,
    name: row.name,
    code: row.code,
    location: row.location ?? null,
    measurementUnit: row.measurementUnit as SiteMeasurementUnit,
    isActive: row.isActive,
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt),
  };
}

async function listSites(input?: ListSitesInput): Promise<SiteSummary[]> {
  const where: Prisma.SiteWhereInput = {};
  if (input?.companyId) where.companyId = input.companyId;

  const status = String(input?.status || "").trim().toUpperCase();
  if (status && status !== "ALL") {
    if (status === "ACTIVE") {
      where.isActive = true;
    } else if (status === "INACTIVE") {
      where.isActive = false;
    } else {
      throw new Error(`Invalid status: ${input?.status}. Use active, inactive, or all.`);
    }
  }

  const query = input?.search?.trim();
  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { code: { contains: query, mode: "insensitive" } },
      { location: { contains: query, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.site.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      name: true,
      code: true,
      location: true,
      measurementUnit: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { name: true, slug: true } },
    },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
    take: input?.limit ?? 100,
    skip: input?.skip ?? 0,
  });

  return rows.map(mapSite);
}

async function getSite(siteId: string): Promise<SiteDetail> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      companyId: true,
      name: true,
      code: true,
      location: true,
      measurementUnit: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { name: true, slug: true } },
    },
  });
  if (!site) throw new Error(`Site not found for id: ${siteId}`);

  const [sectionCount, activeSectionCount, siteEmployees, equipmentCount, inventoryItemCount] = await Promise.all([
    prisma.section.count({ where: { siteId } }),
    prisma.section.count({ where: { siteId, isActive: true } }),
    prisma.attendance.findMany({
      where: { siteId },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
    prisma.equipment.count({ where: { siteId } }),
    prisma.inventoryItem.count({ where: { siteId } }),
  ]);
  const employeeCount = siteEmployees.length;

  const summary = mapSite(site);
  return {
    ...summary,
    sectionCount,
    activeSectionCount,
    employeeCount,
    equipmentCount,
    inventoryItemCount,
  };
}

async function createSite(input: CreateSiteInput): Promise<SiteCreateResult> {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  const name = normalizeSiteName(input.name);
  const code = normalizeSiteCode(input.code);
  const location = normalizeSiteLocation(input.location);
  const measurementUnit = normalizeSiteMeasurementUnit(input.measurementUnit);

  const existing = await prisma.site.findFirst({
    where: { companyId: input.companyId, code },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Site code already exists for this company: ${code}`);
  }

  const site = await prisma.site.create({
    data: {
      companyId: input.companyId,
      name,
      code,
      location,
      measurementUnit,
      isActive: true,
    },
    select: {
      id: true,
      companyId: true,
      name: true,
      code: true,
      location: true,
      measurementUnit: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { name: true, slug: true } },
    },
  });

  const resource = mapSite(site);
  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "SITE_CREATE",
    entityType: "site",
    entityId: resource.id,
    companyId: resource.companyId,
    reason: input.reason ?? `Created site ${resource.code}`,
    after: resource,
  });

  return {
    site: resource,
    auditEventId: audit.id,
  };
}

async function updateSite(input: UpdateSiteInput): Promise<SiteUpdateResult> {
  const before = await prisma.site.findUnique({
    where: { id: input.siteId },
    select: {
      id: true,
      companyId: true,
      name: true,
      code: true,
      location: true,
      measurementUnit: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { name: true, slug: true } },
    },
  });
  if (!before) throw new Error(`Site not found for id: ${input.siteId}`);

  const data: Prisma.SiteUpdateInput = {};
  const changedFields: string[] = [];

  if (input.name !== undefined) {
    data.name = normalizeSiteName(input.name);
    changedFields.push("name");
  }

  if (input.code !== undefined) {
    const normalizedCode = normalizeSiteCode(input.code);
    if (normalizedCode !== before.code) {
      const duplicate = await prisma.site.findFirst({
        where: {
          companyId: before.companyId,
          code: normalizedCode,
          NOT: { id: before.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new Error(`Site code already exists for this company: ${normalizedCode}`);
      }
    }
    data.code = normalizedCode;
    changedFields.push("code");
  }

  if (input.location !== undefined) {
    data.location = normalizeSiteLocation(input.location);
    changedFields.push("location");
  }

  if (input.measurementUnit !== undefined) {
    data.measurementUnit = normalizeSiteMeasurementUnit(input.measurementUnit);
    changedFields.push("measurementUnit");
  }

  if (changedFields.length === 0) {
    throw new Error("No update fields provided.");
  }

  const updated = await prisma.site.update({
    where: { id: before.id },
    data,
    select: {
      id: true,
      companyId: true,
      name: true,
      code: true,
      location: true,
      measurementUnit: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { name: true, slug: true } },
    },
  });

  const after = mapSite(updated);
  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "SITE_UPDATE",
    entityType: "site",
    entityId: before.id,
    companyId: before.companyId,
    reason: input.reason ?? `Updated site ${after.code}`,
    before: mapSite(before),
    after,
    metadata: { changedFields },
  });

  return {
    site: after,
    changedFields,
    auditEventId: audit.id,
  };
}

async function setSiteStatus(input: SetSiteStatusInput & { isActive: boolean }): Promise<SiteStatusResult> {
  const before = await prisma.site.findUnique({
    where: { id: input.siteId },
    select: {
      id: true,
      companyId: true,
      name: true,
      code: true,
      isActive: true,
      company: { select: { name: true } },
    },
  });
  if (!before) throw new Error(`Site not found for id: ${input.siteId}`);

  const updated = await prisma.site.update({
    where: { id: before.id },
    data: { isActive: input.isActive },
    select: { id: true, companyId: true, name: true, code: true, isActive: true, company: { select: { name: true } } },
  });

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: input.isActive ? "SITE_ACTIVATE" : "SITE_DEACTIVATE",
    entityType: "site",
    entityId: updated.id,
    companyId: updated.companyId,
    reason: input.reason ?? null,
    before: { isActive: before.isActive },
    after: { isActive: updated.isActive },
  });

  return {
    siteId: updated.id,
    siteName: updated.name,
    siteCode: updated.code,
    companyId: updated.companyId,
    companyName: updated.company?.name ?? null,
    beforeActive: before.isActive,
    afterActive: updated.isActive,
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
  const workspaceProfile = getClientTemplateWorkspaceProfile(template.code);

  const bundleCodes = getClientTemplateBundleCodes(template.code);
  const featureKeys = getClientTemplateFeatureKeys(template.code, tierCode);
  const disabledFeatureKeys = getClientTemplateDisabledFeatureKeys(template.code);

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
  const disabledFeatures: string[] = [];
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
  for (const featureKey of disabledFeatureKeys) {
    const result = await setFeature({
      companyId: input.companyId,
      featureKey,
      enabled: false,
      actor: input.actor,
      reason: input.reason ?? `Template ${template.code} disabled feature`,
    });
    if (!result.enabled) {
      disabledFeatures.push(result.feature);
    }
  }

  if (workspaceProfile) {
    await prisma.company.update({
      where: { id: input.companyId },
      data: { workspaceProfile: workspaceProfile as Prisma.CompanyUpdateInput["workspaceProfile"] },
    });
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
      disabledFeatureCount: disabledFeatures.length,
      workspaceProfile,
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
  const normalizedPassword = normalizePasswordInput(input.password, "Password");

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new Error(`User already exists for email: ${email}`);

  const password = await bcrypt.hash(normalizedPassword, 12);
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
  const normalizedPassword = normalizePasswordInput(input.newPassword, "New password");
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, role: true, companyId: true, company: { select: { name: true } } },
  });
  if (!user) throw new Error(`Admin user not found for id: ${input.userId}`);
  if (!ADMIN_ROLES.includes(user.role as AdminRole)) throw new Error(`User ${user.email} has role ${user.role}, not admin role.`);

  const password = await bcrypt.hash(normalizedPassword, 12);
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
      provisionBundle: (input) => toProvisionBundleMutation(() => provisionBundle(input)),
      suggestSubdomains,
      reserveSubdomain: (input) => toMutation(() => reserveOrgSubdomain(input)),
      getSubdomainReservation: getOrgSubdomainReservation,
      suspend: (input) => toMutation(() => setOrganizationStatus({ ...input, targetStatus: "SUSPENDED" })),
      activate: (input) => toMutation(() => setOrganizationStatus({ ...input, targetStatus: "ACTIVE" })),
      disable: (input) => toMutation(() => setOrganizationStatus({ ...input, targetStatus: "DISABLED" })),
      previewResetWorkspace: (input) => toMutation(() => previewWorkspaceReset(input as WorkspaceResetPreviewInput)),
      resetWorkspace: (input) => toMutation(() => resetWorkspace(input as WorkspaceResetInput)),
    },
    site: {
      list: listSites,
      detail: getSite,
      create: (input) => toMutation(() => createSite(input)),
      update: (input) => toMutation(() => updateSite(input)),
      activate: (input) => toMutation(() => setSiteStatus({ ...input, isActive: true })),
      deactivate: (input) => toMutation(() => setSiteStatus({ ...input, isActive: false })),
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
